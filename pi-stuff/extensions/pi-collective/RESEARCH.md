# Research: Trajectory Storage & RL Environments

## Summary

After analyzing **Prime RL** and **Tinker**, here's what we need to know for pi-collective.

---

## Prime RL Approach

### Architecture
Prime RL separates concerns:
1. **Verifiers** — Environment library that produces trajectories
2. **Orchestrator** — Collects rollouts from inference servers
3. **Trainer** — Consumes trajectories for GRPO/PPO training

### Trajectory Format (from `verifiers`)

```python
@dataclass
class TrajectoryStep:
    prompt: list[Message]          # Messages up to this point
    completion: list[Message]      # Assistant response
    tokens: TrajectoryStepTokens   # Token-level data
    reward: float | None           # Step reward
    advantage: float | None        # Computed advantage
    trajectory_id: str             # Links multi-turn steps
    extras: dict                   # Custom metadata

@dataclass
class TrajectoryStepTokens:
    prompt_ids: list[int]          # Token IDs
    prompt_mask: list[int]         # 0 = don't train on
    completion_ids: list[int]
    completion_mask: list[int]     # 1 = train on this token
    completion_logprobs: list[float]  # For importance sampling
    overlong_prompt: bool
    is_truncated: bool
```

### Key Insight: The Extension Property

Prime RL uses "best-effort interleaving" where multi-turn trajectories are merged when possible:

```
Extension holds when: prompt[t] = prompt[t-1] + completion[t-1] + new_user_message

If extension holds → merge into single training sample (O(T) compute)
If extension breaks → start new sample (O(T²) worst case)
```

This is important because:
- Many chat templates strip thinking between turns (Qwen3, GLM)
- Context compaction changes the prefix
- Sub-agent calls create discontinuities

**Prime RL handles this gracefully** — it doesn't fail, it just creates multiple samples.

---

## Tinker Code RL Approach

### Environment Setup
```python
@dataclass
class DeepcoderTask:
    problem: str                    # The coding problem
    tests: list[dict[str, Any]]     # Test cases
    starter_code: str | None        # Optional template

# Reward function
reward = format_coef * (has_code_block - 1) + correct
# Where: correct = 1.0 if all tests pass, 0.0 otherwise
```

### Sandbox Execution
Two backends:
1. **SandboxFusion** — Local Docker container
2. **Modal** — Cloud sandboxed execution

```python
async def sandbox_check_correctness(
    sample: list[dict],    # Test cases
    generation: str,       # Generated code
    timeout: int = 6,
    backend: SandboxBackend
) -> tuple[bool, dict]:
```

### Tool-Based Interaction
```python
@tool
async def check_solution(
    code: Annotated[str, "Python code implementing the solution."],
) -> ToolResult:
    """Execute the proposed solution against test cases."""
```

---

## What This Means for pi-collective

### Two Options for Trajectory Sharing

#### Option A: Trajectories Only (SFT/DPO)
Store just the conversation + outcome.

```json
{
  "messages": [...],
  "outcome": { "success": true, "tests_passed": true },
  "reward": 1.0
}
```

**Pros:**
- Simple to collect and store
- Works for SFT (learn from demonstrations)
- Works for DPO/ORPO (compare good vs bad trajectories)

**Cons:**
- Can't replay with fresh model
- Can't do online RL training

#### Option B: Trajectories + Environment Reference (Full RL)
Store trajectory + everything needed to reconstruct the environment.

```json
{
  "messages": [...],
  "outcome": { ... },
  "reward": 1.0,
  
  "environment": {
    "repo_url": "https://github.com/user/repo",
    "commit_sha": "abc123",
    "test_command": "pytest tests/",
    "dockerfile": "...",
    "task_description": "Fix the off-by-one error in the loop"
  }
}
```

**Pros:**
- Full RL training possible
- Can verify trajectories
- Can generate new trajectories from same starting point

**Cons:**
- Much larger (need Dockerfile, dependencies)
- Some repos may drift (deleted, private later)
- Need to snapshot dependencies

---

## Recommended Approach: Hybrid

### For pi-collective v1.0

Store **both** the trajectory AND the environment reference:

```jsonc
{
  // === TRAJECTORY (for SFT/DPO) ===
  "trajectory_id": "uuid",
  "messages": [
    {"role": "user", "content": "Fix the bug..."},
    {"role": "assistant", "content": "...", "tool_calls": [...]},
    {"role": "tool", "tool_call_id": "...", "content": "..."}
  ],
  "outcome": {
    "success": true,
    "reward": 1.0
  },
  
  // === ENVIRONMENT REFERENCE (for RL) ===
  "environment": {
    "repo_url": "https://github.com/user/repo",
    "commit_before": "abc123",  // Starting state
    "commit_after": "def456",   // After fix
    "test_command": "pytest",
    "language": "python",
    "dependencies_file": "requirements.txt"
  },
  
  // === TOKEN-LEVEL DATA (optional, for advanced RL) ===
  "tokens": {
    "enabled": false,  // Future: capture logprobs for importance sampling
  }
}
```

### Environment Bundle (Separate Storage)

For repos that opt-in, we can also store:

```
s3://pi-collective/envs/
  └── {trajectory_id}/
      ├── Dockerfile
      ├── requirements.txt (or package.json, Cargo.toml, etc.)
      ├── tests/           # Just the test files
      └── metadata.json
```

This allows:
1. **Quick SFT/DPO** — Use just the JSONL trajectories
2. **Full RL** — Download env bundle, spin up Docker, train

---

## Storage Architecture

### S3 Structure
```
s3://pi-collective/
├── trajectories/
│   ├── 2026/02/
│   │   ├── batch_001.jsonl.zst    # Compressed JSONL
│   │   └── batch_002.jsonl.zst
│   └── index.json                 # Metadata index
├── environments/
│   └── {trajectory_id}/           # Optional env bundles
└── datasets/
    ├── sft_v1.jsonl.zst           # Curated SFT dataset
    └── dpo_v1.jsonl.zst           # Paired DPO dataset
```

### Upload Flow
```
pi session ends
    │
    ├── Gate checks pass?
    │       │
    │       ▼
    │   Package trajectory
    │       │
    │       ▼
    │   Upload to S3
    │       │
    │       ├── trajectories/{date}/batch_{n}.jsonl.zst
    │       │
    │       └── [Optional] environments/{id}/ (if full RL enabled)
    │
    └── Gates fail → discard (or store locally for debugging)
```

---

## Do We Need a Shared RL Environment?

### Short Answer: Not for v1

For v1, focus on:
1. **Collecting high-quality trajectories**
2. **Storing them in a format compatible with existing tools** (TRL, Prime RL, Tinker)
3. **Providing environment references** so others CAN do RL if they want

### Why Not Bundle Full RL Infrastructure?

1. **Complexity** — Running RL requires GPUs, orchestration, inference servers
2. **Diversity** — Different teams use different RL algorithms (GRPO, PPO, DPO)
3. **Focus** — Our job is data collection, not training infrastructure

### What We Should Provide

1. **JSONL trajectories** compatible with:
   - TRL's SFTTrainer
   - TRL's DPOTrainer
   - Prime RL's orchestrator
   - Tinker's dataset format

2. **Environment reconstruction scripts**:
   ```bash
   # Download trajectory + environment
   pi-collective download --id abc123
   
   # Reconstruct environment
   pi-collective setup-env --id abc123
   
   # Outputs: Docker container ready to run tests
   ```

3. **Integration examples** for:
   - Prime RL
   - Tinker
   - TRL
   - Custom GRPO implementations

---

## Format Compatibility Matrix

| Framework | SFT | DPO/ORPO | GRPO/PPO | Notes |
|-----------|-----|----------|----------|-------|
| TRL | ✅ messages array | ✅ chosen/rejected | ⚠️ needs env | Standard HF format |
| Prime RL | ✅ | ⚠️ needs pairs | ✅ with env | Uses verifiers |
| Tinker | ✅ | ✅ | ✅ with env | Flexible |
| ms-swift | ✅ | ✅ | ✅ | Qwen ecosystem |
| Llama-Factory | ✅ | ✅ | ⚠️ | Alpaca format |

### Our Format → Their Format

```python
# TRL SFT
def to_trl_sft(trajectory):
    return {"messages": trajectory["messages"]}

# TRL DPO (need pairs)
def to_trl_dpo(good_traj, bad_traj):
    return {
        "prompt": good_traj["messages"][0]["content"],
        "chosen": good_traj["messages"][-1]["content"],
        "rejected": bad_traj["messages"][-1]["content"]
    }

# Prime RL (via verifiers)
def to_prime_rl(trajectory):
    # Prime RL expects token-level data
    # We'd need to re-tokenize or store logprobs
    ...
```

---

## Next Steps

1. **Finalize trajectory format** (current FORMAT.md is good)
2. **Add environment reference fields** (commit, test command)
3. **Build S3 upload logic**
4. **Create format converters** for TRL, Prime RL, Tinker
5. **Write environment reconstruction scripts**
6. **Document integration with popular RL frameworks**

---

## References

- [Prime RL Trajectories](https://github.com/PrimeIntellect-ai/prime-rl/blob/main/docs/trajectories.md)
- [Verifiers Design Doc](https://github.com/PrimeIntellect-ai/verifiers/blob/main/notes/TRAJECTORIES.md)
- [Tinker Code RL Recipe](https://github.com/thinking-machines-lab/tinker-cookbook/tree/main/tinker_cookbook/recipes/code_rl)
- [TRL Documentation](https://huggingface.co/docs/trl)
- [DeepCoder Blog Post](https://pretty-radio-b75.notion.site/DeepCoder)
