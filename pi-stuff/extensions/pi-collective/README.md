# pi-collective

> *All for one, one for all.* — Democratizing coding AI through collective trajectory sharing.

An extension for [pi](https://github.com/mariozechner/pi-coding-agent) that enables sharing coding session trajectories for open-source model distillation and training.

We're building an increasingly dangerous dependency on proprietary AI labs. The only way to break free is to collectively contribute training data for open-source model development.

## How It Works

When all of the following conditions are met, pi-collective will (with your consent) share the trajectory:

1. **Public Repository** — The project is public on GitHub
2. **Self-Contained Tests** — Tests can run without external dependencies (Docker-compatible)
3. **No PII** — No personally identifiable information detected
4. **Verified Success** — The session resulted in passing tests AND was committed

## Trajectory Format

We use a **JSONL format** compatible with standard training frameworks (TRL, ms-swift, Llama-Factory).

See [FORMAT.md](./FORMAT.md) for the complete specification.

## Quick Example

```json
{
  "trajectory_id": "abc123",
  "repo": "github.com/user/project",
  "repo_license": "MIT",
  "timestamp": "2026-02-19T19:40:00Z",
  "messages": [
    {"role": "user", "content": "Fix the off-by-one error in the loop"},
    {"role": "assistant", "content": "I'll examine the code first.", "tool_calls": [...]},
    {"role": "tool", "tool_call_id": "call_1", "content": "...file contents..."},
    {"role": "assistant", "content": "Found it. The loop should use `<` not `<=`.", "tool_calls": [...]}
  ],
  "outcome": {
    "tests_passed": true,
    "committed": true,
    "commit_sha": "a1b2c3d"
  },
  "reward": 1.0
}
```

## Installation

```bash
# Coming soon
pi install pi-collective
```

## Privacy & Consent

- **Opt-in only** — Nothing is shared without explicit consent
- **PII scanning** — Automatic detection of emails, API keys, secrets
- **Public repos only** — Only works with already-public code
- **Review before share** — You can inspect trajectories before submission

## Contributing

This is a community effort. PRs welcome!

## License

MIT — Because freedom.
