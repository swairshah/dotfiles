---
name: monograph
description: Typeset a technical design document, architecture note, RFC, spec, or deep-dive as a print-quality HTML/PDF monograph — numbered sections with a three-column contents block, STIX Two serif body, Roboto Mono code, ruled listings with line numbers and captions, booktabs tables, §-cross-references — instead of dumping a wall of Markdown into the terminal. Use whenever the user asks for a design doc, architecture doc, RFC, spec, proposal, technical write-up, "paper", "monograph", or any multi-section explanation of a system (>400 words) they will read rather than skim. Also triggers on "write it up properly", "make this a doc", "format this like a paper". Skip for short answers, code edits, and status updates.
---

# Monograph

Produce a designed technical document — the kind of short, dense architecture paper an engineer prints and annotates — from Markdown. The agent writes Markdown only; `render.py` (Python 3.8+, stdlib, zero deps) typesets it into one self-contained HTML file and, optionally, a US-Letter PDF.

## When this triggers

- "Write a design doc / architecture doc / RFC / spec / proposal for X"
- "Explain how X works, properly" — any multi-section systems explanation
- "Document the Y subsystem" / "write up the Z decision"
- "Turn these notes into a paper"
- Any output that would naturally have numbered sections, code listings, and a vocabulary table

**Skip for:** conversational answers, single-file edits, status updates, anything under ~400 words.

## Workflow

1. **Write the document as Markdown** with YAML frontmatter, following the [house style](#house-style) below. Save it to `docs/<slug>.md` in the project (create `docs/` if missing).
2. **Render:**
   ```bash
   python3 ~/.claude/skills/monograph/render.py docs/<slug>.md            # -> docs/<slug>.html
   python3 ~/.claude/skills/monograph/render.py docs/<slug>.md --pdf      # also docs/<slug>.pdf via headless Chrome
   python3 ~/.claude/skills/monograph/render.py docs/<slug>.md --open     # open in the default browser
   ```
   If installed as a plugin, the renderer lives at `${CLAUDE_PLUGIN_ROOT}/skills/monograph/render.py`.
3. **Tell the user the absolute path** of the `.html` (and `.pdf`). Do not paste the document body into the terminal.

### Editing

Edit the source `.md` and re-render; never hand-edit the `.html`. The source Markdown is embedded verbatim in the HTML in `<script id="source-md">` so it can always be recovered.

## Frontmatter

```yaml
---
title: Function Hooks: Core Architecture
author: Alice Poteat
date: August 2026
org: Anthropic            # rendered as "author · date · org"
subtitle: optional italic line under the title
abstract: optional paragraph set before §1
toc: true                 # false to suppress the contents block
fonts: google             # "local" to skip the Google Fonts link (offline)
---
```

## Markdown syntax

| Element | Syntax | Renders as |
|---|---|---|
| Section | `## Algebra` | `2. Algebra`, 15pt bold, auto-numbered |
| Subsection | `### Order Is Nesting` | `2.1 Order Is Nesting`, 13.5pt bold |
| Sub-subsection | `#### …` | italic run-in heading, unnumbered |
| Cross-reference | `(§2.1)` in prose | blue link to that section |
| Inline code | `` `$.tool.call` `` | Roboto Mono at 0.85em |
| Listing | fenced block with `caption="…"` | ruled, line-numbered, `Listing N: …` |
| Unnumbered snippet | fenced block with `nonum` | ruled, no line numbers (short JSON etc.) |
| Table | GFM pipe table with header row | booktabs: 2pt top/bottom rule, 1pt under header |
| Headerless table | pipe table whose header cells are empty (`| | |`) | rules only, first column in mono |
| Definition list | `` `term` `` on one line, `: definition` on the next | headerless two-column table, mono terms |
| Figure | `![Caption text](image.svg)` on its own line | centered image, `Figure N: Caption text` |
| Display math | `$$ … $$` block | centered italic line (plain text, no MathJax) |
| Footnote | `text[^1]` … `[^1]: note` | superscript, notes at end |
| Line break in a cell | `<br>` | newline (works inside backticks too) |

Numbering: `##` → 1, 2, 3…; `###` → 1.1, 1.2…; fences get `Listing N` only when captioned; figures always get `Figure N`. Fenced blocks of 4+ lines are line-numbered automatically; pass `nonum` to suppress. Languages highlighted: js/ts/jsx/tsx, json, py, sh, go, rs — keywords blue-semibold, strings plum, comments grey.

## House style

The reference document this skill reproduces is a ten-page architecture paper. Match its register:

- **Title block**: plain title (no "Design Doc:" prefix), one byline `author · date · org`. No cover page, no revision table, no status badge.
- **Contents**: generated automatically from `##`/`###`; three columns, only shown when there are ≥3 sections. Keep section titles to 1–4 words so the columns stay clean ("Algebra", "The Fold", "Five Placements").
- **Prose**: justified paragraphs, 13pt serif, terse and declarative. Prefer one precise sentence over three hedged ones. Define every term of art on first use in a `term | meaning` table (see "Vocabulary" pattern below).
- **Code**: short listings (≤12 lines) that show one idea each; use `⋯` for elided lines. Caption every listing that the prose refers to.
- **Tables** over bullet lists for anything with two dimensions (placement × behavior, term × meaning, field × purpose).
- **Cross-reference** aggressively with `§n.m` rather than "see above" / "see below".
- **No emoji, no callout boxes, no bold-first-word bullets, no "Overview"/"Introduction"/"Conclusion" sections.** Start with the substance; end with a short "Miscellanea" or "Open Questions" section if needed.
- **Length**: 1,500–5,000 words. If the material is smaller, don't use this skill.

### Vocabulary pattern

```markdown
### Vocabulary

| term | meaning |
|---|---|
| plugin | The discrete unit of installation, management, and discovery. |
| hook | A function registered on an event. Every hook has the signature `($, e, next)`. |
```

### Signature / API pattern

```markdown
`next(e)`
: Runs the rest of the chain with `e` and resolves to the event's final result.

`next.signal`
: An `AbortSignal`, one per dispatch, that fires when the whole chain has returned.
```

### Listing pattern

````markdown
```ts caption="The same hook as a function."
export function register(on) {
  on("tool.call", ($, e, next) => {
    if (e.tool === "Bash") return { deny: "blocked" }
    return next(e)
  })
}
```
````

## Output

- One self-contained `.html` (CSS inlined; only external request is Google Fonts for STIX Two Text / Roboto Mono, with Times / system-mono fallbacks; set `fonts: local` to skip).
- `--pdf` prints US-Letter with 0.65in margins through headless Chrome/Chromium if one is on `PATH`; otherwise open the HTML and print — the print stylesheet is identical.
- See `examples/function-hooks.md` (and its `.html`/`.pdf`) in the repository for a full worked example reproducing the reference paper.
