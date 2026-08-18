import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HERDR_ENV = process.env.HERDR_ENV;
const PANE_ID = process.env.HERDR_PANE_ID;
const SOURCE = "custom:pi-sidebar-summary";
const MAX_LENGTH = 96;
const HOME = process.env.HOME;

function enabled(): boolean {
  return HERDR_ENV === "1" && typeof PANE_ID === "string" && PANE_ID.length > 0;
}

function compact(text: string): string {
  const normalized = text
    .replace(/<status>\s*/gi, "")
    .replace(/\s*<\/status>/gi, "")
    .replace(/\[Figure\s+\d+\]:\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= MAX_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
}

function displayDirectory(cwd: string): string {
  if (HOME && (cwd === HOME || cwd.startsWith(`${HOME}/`))) {
    return `~${cwd.slice(HOME.length)}`;
  }
  return cwd;
}

function messageText(message: any): string {
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join(" ");
}

function latestUserPrompt(ctx: any): string | undefined {
  const entries = ctx?.sessionManager?.getBranch?.();
  if (!Array.isArray(entries)) return undefined;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "message" || entry?.message?.role !== "user") continue;
    const summary = compact(messageText(entry.message));
    if (summary) return summary;
  }
  return undefined;
}

function latestStatus(text: string): string | undefined {
  const matches = [...text.matchAll(/<status>\s*(?:started|progress|done|error|need-input):\s*([^<]+)<\/status>/gi)];
  const value = matches.at(-1)?.[1];
  return value ? compact(value) : undefined;
}

export default function (pi: ExtensionAPI) {
  if (!enabled()) return;

  let lastSummary: string | undefined;
  let lastModel: string | undefined;
  let lastDirectory: string | undefined;

  async function reportToken(name: "summary" | "model" | "directory", value: string | undefined): Promise<void> {
    const next = value ? compact(value) : undefined;
    if (!next) return;
    if (name === "summary" && next === lastSummary) return;
    if (name === "model" && next === lastModel) return;
    if (name === "directory" && next === lastDirectory) return;

    if (name === "summary") lastSummary = next;
    else if (name === "model") lastModel = next;
    else lastDirectory = next;

    await pi.exec("herdr", [
      "pane",
      "report-metadata",
      PANE_ID!,
      "--source",
      SOURCE,
      "--token",
      `${name}=${next}`,
    ], { timeout: 2000 });
  }

  function reportModel(model: any): void {
    const id = typeof model?.id === "string" ? model.id : undefined;
    if (id) void reportToken("model", id);
  }

  pi.on("session_start", (_event, ctx) => {
    void reportToken("summary", pi.getSessionName() ?? latestUserPrompt(ctx));
    void reportToken("directory", displayDirectory(ctx.cwd));
    reportModel(ctx.model);
  });

  pi.on("session_info_changed", (event) => {
    if (event.name) void reportToken("summary", event.name);
  });

  pi.on("before_agent_start", (event, ctx) => {
    const prompt = compact(event.prompt);
    if (prompt) void reportToken("summary", prompt);
    void reportToken("directory", displayDirectory(ctx.cwd));
    reportModel(ctx.model);
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    const status = latestStatus(messageText(event.message));
    if (status) void reportToken("summary", status);
  });

  pi.on("model_select", (event) => {
    reportModel(event.model);
  });
}
