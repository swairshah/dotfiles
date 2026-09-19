/**
 * magazine — /magazine <instructions>
 *
 * Asks the agent to write the requested technical document in the
 * `monograph` house style (skills/monograph in this repo) and typeset it to
 * HTML/PDF with render.py, returning file paths instead of a wall of text.
 *
 *   /magazine design doc for the new cache layer
 *   /magazine --pdf --dark write up how the scheduler works
 *
 * Flags: --pdf (also emit PDF), --dark | --light (theme; default follows OS).
 * No npm deps; the agent runs render.py itself via bash.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findSkillDir(): string | null {
  const here = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
  const candidates = [
    process.env.MONOGRAPH_DIR,
    path.resolve(here, "../../skills/monograph/skills/monograph"),
    path.join(os.homedir(), "dotfiles/skills/monograph/skills/monograph"),
    path.join(os.homedir(), ".claude/skills/monograph"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "render.py"))) return c;
  }
  return null;
}

function skillBody(skillDir: string): string {
  const raw = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  return raw.replace(/^---[\s\S]*?\n---\n/, "").trim();
}

type Flags = { pdf: boolean; theme: "light" | "dark" | null; rest: string };

function parseFlags(args: string): Flags {
  let pdf = false;
  let theme: Flags["theme"] = null;
  const rest = args
    .split(/\s+/)
    .filter((tok) => {
      if (tok === "--pdf") return (pdf = true), false;
      if (tok === "--dark") return (theme = "dark"), false;
      if (tok === "--light") return (theme = "light"), false;
      return true;
    })
    .join(" ")
    .trim();
  return { pdf, theme, rest };
}

function buildPrompt(skillDir: string, flags: Flags): string {
  const renderer = path.join(skillDir, "render.py");
  const toolHint = `render with \`python3 ${renderer} docs/<slug>.md${flags.pdf ? " --pdf" : ""}${
    flags.theme ? ` --theme=${flags.theme}` : ""
  }\`,`;

  return [
    `/magazine request: ${flags.rest}`,
    "",
    "Produce this as a typeset monograph, not terminal text. Follow the skill below exactly:",
    "write the Markdown to docs/<slug>.md in the current project (create docs/ if needed),",
    toolHint,
    "then reply with only the absolute path(s) of the .html" + (flags.pdf ? " and .pdf" : "") + " plus a two-line summary.",
    ...(flags.theme ? [`Set \`theme: ${flags.theme}\` in the frontmatter.`] : []),
    "Use that renderer path verbatim (it supersedes the path shown in the skill).",
    "",
    "<skill name=\"monograph\">",
    skillBody(skillDir),
    "</skill>",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  const skillDir = findSkillDir();

  pi.registerCommand("magazine", {
    description: "Write the requested doc as a typeset HTML/PDF monograph (flags: --pdf, --dark, --light)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (!skillDir) {
        ctx.ui.notify("magazine: monograph skill not found (clone dotfiles or set MONOGRAPH_DIR)", "error");
        return;
      }
      const flags = parseFlags(args ?? "");
      if (!flags.rest) {
        ctx.ui.notify("usage: /magazine [--pdf] [--dark|--light] <what to write>", "warning");
        return;
      }
      const prompt = buildPrompt(skillDir, flags);
      if (ctx.isIdle()) {
        pi.sendUserMessage(prompt);
      } else {
        pi.sendUserMessage(prompt, { deliverAs: "followUp" });
        ctx.ui.notify("magazine: queued until the current turn finishes", "info");
      }
    },
  });
}
