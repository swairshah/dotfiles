# pi-compuse

Pi extension for GUI computer-use on macOS. Gives your pi agent the ability to see and interact with the desktop — click buttons, type text, scroll, drag, press hotkeys, take screenshots, and more.

## How it works

1. **Screenshot** — captures the screen or app window using macOS `screencapture`
2. **Grounding** — sends the screenshot + semantic target description to a vision model (using pi's own model/API key) to get pixel coordinates
3. **Action** — dispatches native input events (mouse clicks, keyboard, etc.) via a Swift helper binary compiled at runtime

## Requirements

- **macOS** (uses native macOS APIs)
- **Xcode Command Line Tools** (for compiling the Swift native helper)
- **Accessibility permission** (System Settings → Privacy & Security → Accessibility)
- **Screen Recording permission** (System Settings → Privacy & Security → Screen Recording)
- A **vision-capable model** configured in pi (e.g. GPT-4.1, Claude Sonnet, Gemini)

## Installation

### As a project-local extension

```bash
# In your project's .pi/extensions/ directory
ln -s /path/to/pi-compuse .pi/extensions/pi-compuse
```

### As a global extension

```bash
ln -s /path/to/pi-compuse ~/.pi/agent/extensions/pi-compuse
```

### Quick test

```bash
pi -e /path/to/pi-compuse/src/index.ts
```

## Configuration

By default, the extension uses pi's currently active model for visual grounding.
You can override this with environment variables:

```bash
# Use a specific model for grounding (recommended: a fast vision model)
export PI_COMPUSE_GROUNDING_MODEL="gpt-4.1"
export PI_COMPUSE_GROUNDING_PROVIDER="openai"

# Or just specify the model ID (searches all providers)
export PI_COMPUSE_GROUNDING_MODEL="claude-sonnet-4-5-20250514"
```

## Tools

| Tool | Description |
|------|-------------|
| `gui_read` | Capture a screenshot and optionally locate a visual target |
| `gui_click` | Click a GUI element by visual description |
| `gui_right_click` | Right-click to open a context menu |
| `gui_double_click` | Double-click (open files, select text) |
| `gui_hover` | Hover for tooltips and hover menus |
| `gui_drag` | Drag from one target to another |
| `gui_scroll` | Scroll a region up/down/left/right |
| `gui_type` | Type text into an input field |
| `gui_keypress` | Press a single key (Enter, Tab, Escape, arrows) |
| `gui_hotkey` | Send a keyboard shortcut (Command+S, etc.) |
| `gui_screenshot` | Capture a screenshot |

## Architecture

```
src/
├── index.ts          # Extension entry - registers all tools with pi
├── runtime.ts        # Core GUI runtime (screenshot, grounding, native input)
├── grounding.ts      # Vision model grounding provider (uses pi's model registry)
└── native-helper.ts  # Swift native helper binary (compiled at runtime)
```

## Credits

GUI runtime adapted from [understudy](https://github.com/nichochar/understudy).
