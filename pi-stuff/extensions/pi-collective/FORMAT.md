# Trajectory Format Specification v1.1

## Overview

pi-collective uses a JSONL format designed to be directly usable for:
- **SFT (Supervised Fine-Tuning)** — Learning from demonstrations
- **GRPO/PPO** — Reward-based RL where tests provide the reward signal
- **DPO/ORPO** — Preference learning (successful vs failed trajectories)
- **Distillation** — Transferring capabilities from proprietary to open models

This format is compatible with:
- TRL (Hugging Face)
- Prime RL (PrimeIntellect)
- Tinker (Thinking Machines Lab)
- ms-swift (ModelScope)
- Llama-Factory

## Format Version

Current: `v1.1`

## Complete Schema

```json
{
  // === METADATA ===
  "format_version": "1.1",
  "trajectory_id": "uuid-v4",
  "timestamp": "ISO-8601 datetime",
  
  // === SOURCE CONTEXT ===
  "source": {
    "repo_url": "https://github.com/user/project",
    "repo_license": "MIT|Apache-2.0|GPL-3.0|...",
    "branch": "main",
    "language_primary": "python|typescript|rust|...",
    "languages_used": ["python", "bash"]
  },
  
  // === THE TRAJECTORY (SFT/DPO compatible) ===
  "messages": [
    {
      "role": "system",
      "content": "You are a coding assistant..."
    },
    {
      "role": "user", 
      "content": "The task/prompt from the human"
    },
    {
      "role": "assistant",
      "content": "Reasoning and response text",
      "thinking": "Optional: internal reasoning (for reasoning models)",
      "tool_calls": [
        {
          "id": "call_001",
          "type": "function",
          "function": {
            "name": "read_file",
            "arguments": "{\"path\": \"src/main.py\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_001",
      "name": "read_file",
      "content": "...file contents or command output..."
    }
  ],
  
  // === OUTCOME & REWARD ===
  "outcome": {
    "success": true,
    "tests_passed": true,
    "tests_total": 15,
    "tests_failed": 0,
    "committed": true,
    "commit_sha": "abc123def",
    "files_changed": ["src/main.py", "tests/test_main.py"],
    "lines_added": 42,
    "lines_removed": 10
  },
  
  // Reward signal for RL training (0.0 to 1.0)
  "reward": 1.0,
  
  // === ENVIRONMENT REFERENCE (for RL reproduction) ===
  "environment": {
    "commit_before": "sha of repo state when session started",
    "commit_after": "sha after successful completion",
    "test_command": "pytest tests/",
    "test_timeout_seconds": 300,
    "dependencies_file": "requirements.txt",
    "docker_compatible": true,
    "dockerfile_ref": "s3://pi-collective/envs/{trajectory_id}/Dockerfile"
  },
  
  // === TOKEN-LEVEL DATA (optional, for advanced RL) ===
  // Enable this for full Prime RL / GRPO compatibility
  "tokens": {
    "enabled": false,
    "steps": [
      {
        "step_index": 0,
        "prompt_ids": [1, 2, 3],
        "prompt_mask": [0, 0, 0],
        "completion_ids": [4, 5, 6],
        "completion_mask": [1, 1, 1],
        "completion_logprobs": [-0.1, -0.2, -0.3]
      }
    ]
  },
  
  // === COLLECTION METADATA ===
  "collector": {
    "tool": "pi-collective",
    "version": "0.1.0",
    "contributor_id": "anonymous-hash or opt-in identifier",
    "consent_timestamp": "ISO-8601 when user approved sharing"
  }
}
```

## Tool Call Types

Standard tool names that should be normalized:

| Tool Name | Description | Prime RL | Tinker |
|-----------|-------------|----------|--------|
| `read_file` | Read file contents | ✓ | ✓ |
| `write_file` | Create/overwrite file | ✓ | ✓ |
| `edit_file` | Surgical edit (find/replace) | ✓ | ✓ |
| `bash` | Execute shell command | ✓ | ✓ |
| `search_files` | Grep/ripgrep search | ✓ | - |
| `list_files` | List directory contents | ✓ | - |
| `check_solution` | Run tests (Tinker-style) | - | ✓ |

## Reward Calculation

```python
def calculate_reward(outcome):
    reward = 0.0
    
    # Tests passed: +0.5
    if outcome.tests_passed:
        reward += 0.5
    
    # Committed: +0.3
    if outcome.committed:
        reward += 0.3
    
    # Public repo (verifiable): +0.1
    if outcome.is_public_repo:
        reward += 0.1
    
    # No PII detected: +0.1
    if outcome.no_pii:
        reward += 0.1
    
    return min(reward, 1.0)
```

### Format Bonus (Tinker-style)
For code tasks, can add format penalty:
```python
format_coef = 0.1
format_score = 1.0 if has_valid_code_block else 0.0
reward += format_coef * (format_score - 1.0)
```

## Extension Property (Prime RL Compatibility)

For multi-turn trajectories, we track whether the "extension property" holds:

```
Extension holds when: prompt[t] = prompt[t-1] + completion[t-1] + new_user_message
```

If extension holds, multiple turns can be merged into a single training sample.
If extension breaks (e.g., context compaction), each turn becomes a separate sample.

We indicate this with:
```json
{
  "tokens": {
    "extension_breaks_at": [3, 7]  // Turn indices where extension broke
  }
}
```

## Usage in Training

### For SFT (TRL, ms-swift)
```python
# Extract messages directly
def to_sft_format(trajectory):
    return {"messages": trajectory["messages"]}
```

### For DPO (TRL)
```python
# Need pairs of successful/failed trajectories
def to_dpo_format(good_trajectory, bad_trajectory):
    return {
        "prompt": good_trajectory["messages"][0]["content"],
        "chosen": extract_final_response(good_trajectory),
        "rejected": extract_final_response(bad_trajectory)
    }
```

### For GRPO/PPO (Prime RL)
```python
# Need token-level data + environment for reward computation
def to_prime_rl_format(trajectory):
    return {
        "example_id": trajectory["trajectory_id"],
        "task": trajectory["messages"][0]["content"],  # Initial prompt
        "trajectory": [
            vf.TrajectoryStep(
                prompt=extract_prompt(step),
                completion=extract_completion(step),
                tokens=trajectory["tokens"]["steps"][i],
                reward=trajectory["reward"] if is_final else None,
            )
            for i, step in enumerate(trajectory["messages"])
        ]
    }
```

### For Tinker
```python
# Tinker uses its own env builder, but trajectories are compatible
def to_tinker_format(trajectory):
    return {
        "problem": trajectory["messages"][0]["content"],
        "tests": reconstruct_tests_from_env(trajectory["environment"]),
        "response": extract_final_response(trajectory),
        "reward": trajectory["reward"]
    }
```

## File Format

One trajectory per line, JSONL format:
```
{"trajectory_id": "...", "messages": [...], ...}
{"trajectory_id": "...", "messages": [...], ...}
```

## Compression

For bulk storage/transfer: `.jsonl.zst` (Zstandard compression)

## Privacy Fields

These fields are NEVER included:
- Absolute file paths (relativized to repo root)
- Environment variables
- API keys, tokens, secrets
- Email addresses (except in LICENSE/README)
- IP addresses
- Usernames (except public GitHub username)

## Storage Layout

```
s3://pi-collective/
├── trajectories/
│   └── {year}/{month}/
│       ├── batch_{n}.jsonl.zst
│       └── manifest.json
├── environments/
│   └── {trajectory_id}/
│       ├── Dockerfile
│       ├── requirements.txt
│       └── tests/
└── datasets/
    ├── sft_v1.jsonl.zst       # Curated SFT dataset
    ├── dpo_v1.jsonl.zst       # Paired comparisons
    └── grpo_v1.jsonl.zst      # With token data
```

## Versioning

- Format version is stored in each trajectory
- Breaking changes increment major version
- Additive changes increment minor version
- Converters provided for migrating between versions
