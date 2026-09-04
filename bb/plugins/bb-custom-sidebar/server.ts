import { Buffer } from "node:buffer";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  DEFAULT_PROJECT_ICON_MODEL,
  DEFAULT_PROJECT_ICON_PROVIDER,
  DEFAULT_PROJECT_ICON_STYLE,
  DEFAULT_RECENT_WINDOW,
  PROJECT_ICON_PROVIDER_OPTIONS,
  RECENT_WINDOW_OPTIONS,
} from "./src/settings";

const MESSAGE_PREVIEW_MAX_CHARS = 180;
const PROJECT_ICON_CHANNEL = "project-icon-updated";
const PROJECT_ICON_CACHE_VERSION = 4;
const LEGACY_PROJECT_ICON_CACHE_VERSION = 3;
const PROJECT_ICON_REFRESH_MS = 30 * 24 * 60 * 60_000;
const PROJECT_ICON_ERROR_RETRY_MS = 60 * 60_000;
const PROJECT_ICON_MAX_BYTES = 96 * 1024;
const PROJECT_ICON_MAX_DATA_URL_CHARS = 150_000;

const messagePreviewSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: z.string().max(MESSAGE_PREVIEW_MAX_CHARS),
});

const gitSummarySchema = z.object({
  state: z.enum(["clean", "dirty", "unavailable"]),
  fileCount: z.number().int().nonnegative(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  lineStatsComplete: z.boolean(),
  message: z.string().nullable(),
});

const threadSummarySchema = z.object({
  lastMessage: messagePreviewSchema.nullable(),
  git: gitSummarySchema,
});

const projectIconStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("unavailable") }),
  z.object({
    status: z.literal("ready"),
    dataUrl: z.string().max(PROJECT_ICON_MAX_DATA_URL_CHARS),
    source: z.enum(["favicon", "generated", "custom"]),
    sourceLabel: z.string().max(500),
  }),
]);

const storedProjectIconSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    cachedAt: z.number(),
    dataUrl: z.string().max(PROJECT_ICON_MAX_DATA_URL_CHARS),
    source: z.enum(["favicon", "generated", "custom"]),
    sourceLabel: z.string().max(500),
  }),
  z.object({
    status: z.literal("error"),
    cachedAt: z.number(),
    message: z.string().max(500),
  }),
]);

const iconAgentResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1).max(500),
  }),
  z.object({
    kind: z.literal("svg"),
    svg: z.string().min(1).max(20_000),
  }),
]);

export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type ProjectIconState = z.infer<typeof projectIconStateSchema>;
type StoredProjectIcon = z.infer<typeof storedProjectIconSchema>;
type IconAgentResult = z.infer<typeof iconAgentResultSchema>;

export const rpcContract = defineRpcContract({
  thread_summary: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: threadSummarySchema,
  },
  project_icon: {
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: projectIconStateSchema,
  },
  create_pull_request: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({
      delivery: z.enum(["sent", "queued"]),
    }),
  },
});

const CREATE_PR_PROMPT = [
  "Create a pull request for the current workspace changes.",
  "Review the working tree, commit the appropriate changes, push the branch, and open a pull request with a clear title and description.",
  "Do not include unrelated files.",
].join(" ");

function projectIconPrompt(style: string): string {
  return `You are a read-only project icon scout. Do not edit files and do not use the network.

Inspect this project's workspace and choose a compact icon for a 20 by 20 pixel sidebar slot.

First look for an existing favicon or app icon in the repository. Prefer, in order: favicon.svg, favicon.ico, a small square PNG/WebP favicon, an app icon, then a simple square logo. Ignore dependency, build-output, cache, coverage, and generated directories. Before selecting a file, verify its byte size. You MUST NOT select a file larger than 96 KiB. If all suitable files are larger, treat the project as having no usable icon and generate the SVG fallback.

If a suitable file exists, return exactly one JSON object and no markdown:
{"kind":"file","path":"relative/path/from/project/root"}

If none exists, read the README and infer one clear visual motif. Create a simple standalone SVG using a 24 by 24 viewBox. It must remain legible at 20 pixels and follow this style brief:
${style.slice(0, 2_000)}

Use only svg, g, path, circle, rect, line, polyline, polygon, ellipse, title, or text elements. Use inline attributes only. Do not use scripts, styles, links, images, external resources, data URLs, gradients, masks, filters, entities, or foreignObject. Return exactly one JSON object and no markdown:
{"kind":"svg","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\">...</svg>"}`;
}

function truncateMessagePreview(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MESSAGE_PREVIEW_MAX_CHARS) return normalized;
  return `${normalized.slice(0, MESSAGE_PREVIEW_MAX_CHARS - 1).trimEnd()}…`;
}

function unavailableGitSummary(message: string): ThreadSummary["git"] {
  return {
    state: "unavailable",
    fileCount: 0,
    insertions: 0,
    deletions: 0,
    lineStatsComplete: false,
    message,
  };
}

function projectIconCacheKey(
  projectId: string,
  version = PROJECT_ICON_CACHE_VERSION,
): string {
  return `project-icon:v${version}:${projectId}`;
}

function projectIconState(stored: StoredProjectIcon): ProjectIconState {
  if (stored.status === "error") return { status: "unavailable" };
  return {
    status: "ready",
    dataUrl: stored.dataUrl,
    source: stored.source,
    sourceLabel: stored.sourceLabel,
  };
}

function parseIconAgentResult(output: string): IconAgentResult {
  const trimmed = output.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  if (fenced !== undefined) candidates.push(fenced);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return iconAgentResultSchema.parse(JSON.parse(candidate));
    } catch {
      // Try the next bounded JSON candidate.
    }
  }
  throw new Error("The icon worker did not return valid JSON.");
}

function sanitizeGeneratedSvg(svg: string): string {
  let value = svg.trim();
  if (
    value.length > 20_000 ||
    !/^<svg(?:\s|>)/i.test(value) ||
    !/<\/svg>\s*$/i.test(value)
  ) {
    throw new Error("The generated SVG is malformed.");
  }

  if (
    /<!|<\?|<\/?(?:script|style|foreignObject|image|a|iframe|object|embed|audio|video|use|defs|linearGradient|radialGradient|filter|mask|pattern)\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=|\burl\s*\(|javascript:|data:/i.test(
      value,
    )
  ) {
    throw new Error("The generated SVG contains unsupported content.");
  }

  const allowedElements = new Set([
    "svg",
    "g",
    "path",
    "circle",
    "rect",
    "line",
    "polyline",
    "polygon",
    "ellipse",
    "title",
    "text",
  ]);
  for (const match of value.matchAll(/<\/?\s*([a-zA-Z][\w:-]*)/g)) {
    const element = match[1]?.toLowerCase();
    if (element === undefined || !allowedElements.has(element)) {
      throw new Error("The generated SVG uses an unsupported element.");
    }
  }

  if (!/\bviewBox\s*=\s*["']0\s+0\s+24\s+24["']/i.test(value)) {
    throw new Error("The generated SVG must use a 0 0 24 24 viewBox.");
  }
  if (!/\bxmlns\s*=/.test(value)) {
    value = value.replace(
      /^<svg\b/i,
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
  }
  return value;
}

function inferImageMimeType(path: string, reported: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return reported;
}

function normalizeProjectPath(path: string): string {
  const normalized = path.replace(/^\.\//, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("The icon worker returned an unsafe file path.");
  }
  return normalized;
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  const settingsHandle = bb.settings.define({
    recentWindow: {
      type: "select",
      label: "Recent thread window",
      description:
        "How long a completed thread stays in the Recent threads section.",
      options: [...RECENT_WINDOW_OPTIONS],
      default: DEFAULT_RECENT_WINDOW,
    },
    autoProjectIcons: {
      type: "boolean",
      label: "Automatic project icons",
      description:
        "Use a hidden Pi worker to find a favicon or create an SVG from the README.",
      default: true,
    },
    projectIconProvider: {
      type: "select",
      label: "Project icon provider",
      description:
        "Prefer Pi with a safe fallback, or always use each project's default provider.",
      options: [...PROJECT_ICON_PROVIDER_OPTIONS],
      default: DEFAULT_PROJECT_ICON_PROVIDER,
    },
    projectIconModel: {
      type: "string",
      label: "Pi project icon model",
      description: "Model used when Pi is available.",
      default: DEFAULT_PROJECT_ICON_MODEL,
    },
    projectIconStyle: {
      type: "string",
      label: "Generated icon style",
      description:
        "Style brief used when the Pi worker needs to create an SVG.",
      default: DEFAULT_PROJECT_ICON_STYLE,
    },
  });
  let currentSettings = await settingsHandle.get();
  settingsHandle.onChange((next) => {
    currentSettings = next;
  });

  const disposeController = new AbortController();
  const pendingProjects = new Set<string>();
  let queueTail: Promise<void> = Promise.resolve();

  async function readStoredIcon(
    projectId: string,
  ): Promise<StoredProjectIcon | undefined> {
    const stored = await bb.storage.kv.get<unknown>(projectIconCacheKey(projectId));
    const parsed = storedProjectIconSchema.safeParse(stored);
    if (parsed.success) return parsed.data;

    const legacy = await bb.storage.kv.get<unknown>(
      projectIconCacheKey(projectId, LEGACY_PROJECT_ICON_CACHE_VERSION),
    );
    const parsedLegacy = storedProjectIconSchema.safeParse(legacy);
    if (
      parsedLegacy.success &&
      parsedLegacy.data.status === "ready" &&
      parsedLegacy.data.source !== "generated"
    ) {
      await bb.storage.kv.set(projectIconCacheKey(projectId), parsedLegacy.data);
      return parsedLegacy.data;
    }
    return undefined;
  }

  async function readProjectIconFile(
    projectId: string,
    path: string,
  ): Promise<StoredProjectIcon> {
    const normalizedPath = normalizeProjectPath(path);
    const file = await bb.sdk.projects.fileContent({
      projectId,
      path: normalizedPath,
    });
    if (file.sizeBytes > PROJECT_ICON_MAX_BYTES) {
      throw new Error("The selected project icon is larger than 96 KiB.");
    }

    const mimeType = inferImageMimeType(normalizedPath, file.mimeType);
    const allowedMimeTypes = new Set([
      "image/svg+xml",
      "image/x-icon",
      "image/vnd.microsoft.icon",
      "image/png",
      "image/webp",
      "image/gif",
      "image/jpeg",
    ]);
    if (!allowedMimeTypes.has(mimeType)) {
      throw new Error(`Unsupported project icon type: ${mimeType}`);
    }

    const base64 =
      file.contentEncoding === "base64"
        ? file.content
        : Buffer.from(file.content, "utf8").toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    if (dataUrl.length > PROJECT_ICON_MAX_DATA_URL_CHARS) {
      throw new Error("The selected project icon is too large to cache.");
    }
    return {
      status: "ready",
      cachedAt: Date.now(),
      dataUrl,
      source: "favicon",
      sourceLabel: normalizedPath,
    };
  }

  function generatedProjectIcon(
    svg: string,
    source: "generated" | "custom" = "generated",
    sourceLabel = "Generated from README",
  ): StoredProjectIcon {
    const safeSvg = sanitizeGeneratedSvg(svg);
    return {
      status: "ready",
      cachedAt: Date.now(),
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(safeSvg, "utf8").toString("base64")}`,
      source,
      sourceLabel: sourceLabel.slice(0, 500),
    };
  }

  async function spawnProjectIconThread(args: {
    projectId: string;
    projectName: string;
    prompt: string;
    providerMode: string;
    piModel: string;
  }) {
    const common = {
      projectId: args.projectId,
      environment: { type: "project-default" } as const,
      reasoningLevel: "low" as const,
      permissionMode: "full" as const,
      title: `Find icon for ${args.projectName}`,
      prompt: args.prompt,
      visibility: "hidden" as const,
    };

    if (args.providerMode === "Pi with automatic fallback") {
      try {
        return await bb.sdk.threads.spawn({
          ...common,
          providerId: "pi",
          model: args.piModel,
        });
      } catch (piError) {
        bb.log.info(
          `Pi icon worker unavailable; using the project default provider: ${
            piError instanceof Error ? piError.message : "Unknown error"
          }`,
        );
      }
    }
    return bb.sdk.threads.spawn(common);
  }

  bb.agents.registerTool({
    name: "set_bb_project_icon",
    description:
      "Set the current BB project's sidebar icon from a complete SVG. Use when the user asks to create, change, restyle, or replace the current project icon. The SVG must use viewBox 0 0 24 24 and only simple inline shape elements; do not use scripts, styles, links, images, defs, gradients, masks, filters, use, or external resources.",
    instructions:
      "Create an SVG that follows the user's requested style and remains clear at 20px. If no style is specified, use minimal black-and-white retro line art on white with bold black outlines and no text.",
    parameters: z
      .object({
        svg: z
          .string()
          .min(1)
          .max(20_000)
          .describe("Complete safe SVG markup using a 0 0 24 24 viewBox."),
        description: z
          .string()
          .max(200)
          .optional()
          .describe("Short description of the chosen motif and style."),
      })
      .strict(),
    async execute({ svg, description }, { projectId }) {
      if (projectId === "proj_personal") {
        throw new Error("The Personal project keeps BB's user icon.");
      }
      const project = await bb.sdk.projects.get({ projectId });
      const stored = generatedProjectIcon(
        svg,
        "custom",
        description?.trim() || "Set by agent",
      );
      await bb.storage.kv.set(projectIconCacheKey(projectId), stored);
      bb.realtime.publish(PROJECT_ICON_CHANNEL, { projectId });
      return `Updated the BB project icon for ${project.name}.`;
    },
  });

  bb.agents.configure(({ project }) => ({
    tools: project.kind === "standard" ? ["set_bb_project_icon"] : [],
    skills: [],
    instructions:
      project.kind === "standard"
        ? `When the user asks to change or restyle the current BB project icon, create a safe 24 by 24 SVG and call set_bb_project_icon. Default generated-icon style: ${currentSettings.projectIconStyle.slice(0, 1_000)}`
        : undefined,
  }));

  async function runIconWorker(projectId: string): Promise<void> {
    if (disposeController.signal.aborted) return;
    const previous = await readStoredIcon(projectId);
    let workerThreadId: string | null = null;
    let completed = false;

    try {
      const settings = await settingsHandle.get();
      if (
        !settings.autoProjectIcons ||
        (previous?.status === "ready" && previous.source === "custom")
      ) {
        return;
      }
      const project = await bb.sdk.projects.get({ projectId });
      const worker = await spawnProjectIconThread({
        projectId,
        projectName: project.name,
        prompt: projectIconPrompt(settings.projectIconStyle),
        providerMode: settings.projectIconProvider,
        piModel: settings.projectIconModel,
      });
      workerThreadId = worker.id;
      await bb.sdk.threads.wait({
        threadId: worker.id,
        status: "idle",
        timeoutMs: 3 * 60_000,
        signal: disposeController.signal,
      });
      const result = await bb.sdk.threads.output({ threadId: worker.id });
      const choice = parseIconAgentResult(result.output ?? "");
      let stored: StoredProjectIcon;
      if (choice.kind === "svg") {
        stored = generatedProjectIcon(choice.svg);
      } else {
        try {
          stored = await readProjectIconFile(projectId, choice.path);
        } catch (fileError) {
          const latestEvents = await bb.sdk.threads.events.list({
            threadId: worker.id,
            order: "desc",
            limit: "1",
          });
          const afterSeq = latestEvents[0]?.seq;
          const reason =
            fileError instanceof Error
              ? fileError.message
              : "The selected file could not be used.";
          await bb.sdk.threads.send({
            threadId: worker.id,
            mode: "queue-if-active",
            input: [
              {
                type: "text",
                mentions: [],
                text: `The selected file cannot be used: ${reason} Treat this project as having no usable icon. Read the README and return only the SVG JSON object described earlier.`,
              },
            ],
          });
          const idleEvent = await bb.sdk.threads.events.wait({
            threadId: worker.id,
            type: "thread.idle",
            ...(afterSeq === undefined ? {} : { afterSeq: String(afterSeq) }),
            waitMs: String(3 * 60_000),
            signal: disposeController.signal,
          });
          if (idleEvent === null) {
            throw new Error("The icon worker timed out while generating an SVG fallback.");
          }
          const retryResult = await bb.sdk.threads.output({ threadId: worker.id });
          const retryChoice = parseIconAgentResult(retryResult.output ?? "");
          if (retryChoice.kind !== "svg") {
            throw new Error("The icon worker did not return an SVG fallback.");
          }
          stored = generatedProjectIcon(retryChoice.svg);
        }
      }
      const latest = await readStoredIcon(projectId);
      if (
        latest?.status !== "ready" ||
        latest.source !== "custom" ||
        latest.cachedAt <= (previous?.cachedAt ?? 0)
      ) {
        await bb.storage.kv.set(projectIconCacheKey(projectId), stored);
      }
      completed = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project icon generation failed.";
      bb.log.warn(`Project icon worker failed for ${projectId}: ${message}`);
      if (previous?.status !== "ready" && !disposeController.signal.aborted) {
        await bb.storage.kv.set(projectIconCacheKey(projectId), {
          status: "error",
          cachedAt: Date.now(),
          message: message.slice(0, 500),
        } satisfies StoredProjectIcon);
      }
    } finally {
      if (workerThreadId !== null) {
        if (!completed) {
          await bb.sdk.threads
            .stop({ threadId: workerThreadId })
            .catch(() => undefined);
        }
        await bb.sdk.threads
          .archive({ threadId: workerThreadId })
          .catch(() => undefined);
      }
      if (!disposeController.signal.aborted) {
        bb.realtime.publish(PROJECT_ICON_CHANNEL, { projectId });
      }
    }
  }

  function enqueueIconWorker(projectId: string): void {
    if (pendingProjects.has(projectId) || disposeController.signal.aborted) {
      return;
    }
    pendingProjects.add(projectId);
    const run = queueTail.then(() => runIconWorker(projectId));
    queueTail = run
      .catch((error) => {
        bb.log.warn(
          `Project icon queue failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      })
      .finally(() => {
        pendingProjects.delete(projectId);
      });
  }

  bb.rpc.register(rpcContract, {
    thread_summary: async ({ threadId }) => {
      const [thread, outline] = await Promise.all([
        bb.sdk.threads.get({ threadId }),
        bb.sdk.threads.conversationOutline({ threadId }),
      ]);

      const latest = outline.items.at(-1);
      const lastMessage =
        latest === undefined
          ? null
          : {
              role: latest.role,
              text: truncateMessagePreview(latest.preview),
            };

      if (thread.environmentId === null) {
        return {
          lastMessage,
          git: unavailableGitSummary("No git workspace"),
        };
      }

      try {
        const status = await bb.sdk.environments.status({
          environmentId: thread.environmentId,
        });
        if (status.outcome === "available") {
          const workingTree = status.workspace.workingTree;
          const git: ThreadSummary["git"] = {
            state: workingTree.hasUncommittedChanges ? "dirty" : "clean",
            fileCount: workingTree.files.length,
            insertions: workingTree.insertions,
            deletions: workingTree.deletions,
            lineStatsComplete: workingTree.lineStatsComplete,
            message: null,
          };
          return { lastMessage, git };
        }
        if (status.outcome === "not_applicable") {
          return {
            lastMessage,
            git: unavailableGitSummary(status.message),
          };
        }
        return {
          lastMessage,
          git: unavailableGitSummary(status.failure.message),
        };
      } catch (error) {
        return {
          lastMessage,
          git: unavailableGitSummary(
            error instanceof Error ? error.message : "Git status is unavailable",
          ),
        };
      }
    },

    project_icon: async ({ projectId }): Promise<ProjectIconState> => {
      const settings = await settingsHandle.get();
      if (!settings.autoProjectIcons || projectId === "proj_personal") {
        return { status: "unavailable" };
      }

      const stored = await readStoredIcon(projectId);
      if (stored?.status === "ready") {
        if (
          stored.source !== "custom" &&
          Date.now() - stored.cachedAt > PROJECT_ICON_REFRESH_MS
        ) {
          enqueueIconWorker(projectId);
        }
        return projectIconState(stored);
      }
      if (
        stored?.status === "error" &&
        Date.now() - stored.cachedAt <= PROJECT_ICON_ERROR_RETRY_MS
      ) {
        return projectIconState(stored);
      }

      enqueueIconWorker(projectId);
      return { status: "pending" };
    },

    create_pull_request: async ({ threadId }) => {
      const thread = await bb.sdk.threads.get({ threadId });
      if (thread.environmentId === null) {
        throw new Error("This thread does not have a workspace.");
      }

      const status = await bb.sdk.environments.status({
        environmentId: thread.environmentId,
      });
      if (
        status.outcome !== "available" ||
        !status.workspace.workingTree.hasUncommittedChanges
      ) {
        throw new Error("The working tree is clean.");
      }

      const result = await bb.sdk.threads.send({
        threadId,
        mode: "queue-if-active",
        input: [{ type: "text", text: CREATE_PR_PROMPT, mentions: [] }],
      });
      return { delivery: result.delivery };
    },
  });

  bb.onDispose(() => {
    disposeController.abort();
    bb.log.info("disposed");
  });
}
