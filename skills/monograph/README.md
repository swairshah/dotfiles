# monograph

A Claude Code skill that typesets technical design documents as print-quality monographs — instead of dumping a wall of Markdown into your terminal.

The agent writes Markdown; `render.py` (Python 3, zero dependencies) produces one self-contained HTML file and, optionally, a US-Letter PDF, styled after a ten-page architecture paper:

- STIX Two Text 13pt justified body, Roboto Mono inline code
- Centered title, `author · date · org` byline, three-column numbered contents
- `1. Section` / `1.1 Subsection` auto-numbering with `§1.1` cross-reference links
- Hairline-ruled code listings with grey line numbers, syntax colours, `Listing N:` captions
- Booktabs tables (2pt top/bottom rule, 1pt under header), definition tables with mono terms
- `Figure N:` captioned figures, footnotes, print stylesheet with 0.65in margins

## Install

Symlink the skill into Claude Code (from a dotfiles checkout):

```bash
mkdir -p ~/.claude/skills && ln -s ~/dotfiles/skills/monograph/skills/monograph ~/.claude/skills/monograph
```

Or as a plugin: `/plugin marketplace add ~/dotfiles/skills/monograph` then `/plugin install monograph@monograph`.

Then ask for a design doc, RFC, architecture note or spec — or run `/monograph <topic>` — and you get a path to an `.html`/`.pdf` instead of terminal text.

## Standalone use

```bash
python3 skills/monograph/render.py doc.md            # doc.html
python3 skills/monograph/render.py doc.md --pdf      # + doc.pdf (needs Chrome/Chromium on PATH)
python3 skills/monograph/render.py doc.md --open
```

See [`skills/monograph/SKILL.md`](skills/monograph/SKILL.md) for the Markdown conventions (frontmatter, captioned fences, definition lists, headerless tables) and [`examples/function-hooks.md`](examples/function-hooks.md) for a complete worked example.
