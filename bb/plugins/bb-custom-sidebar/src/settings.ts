export const RECENT_WINDOW_OPTIONS = [
  "Running only",
  "5 minutes",
  "15 minutes",
  "30 minutes",
  "1 hour",
  "2 hours",
  "4 hours",
  "8 hours",
  "24 hours",
] as const;

export const DEFAULT_RECENT_WINDOW = "30 minutes";
export const PROJECT_ICON_PROVIDER_OPTIONS = [
  "Pi with automatic fallback",
  "Project default",
] as const;
export const DEFAULT_PROJECT_ICON_PROVIDER = "Pi with automatic fallback";
export const DEFAULT_PROJECT_ICON_MODEL = "openai-codex/gpt-5.4-mini";
export const DEFAULT_PROJECT_ICON_STYLE =
  "Minimal black-and-white retro line art on a white background. Use bold black outlines, simple geometric shapes, no color, no gradients, no text, and very little detail.";

const RECENT_WINDOW_MS: Record<(typeof RECENT_WINDOW_OPTIONS)[number], number> = {
  "Running only": 0,
  "5 minutes": 5 * 60_000,
  "15 minutes": 15 * 60_000,
  "30 minutes": 30 * 60_000,
  "1 hour": 60 * 60_000,
  "2 hours": 2 * 60 * 60_000,
  "4 hours": 4 * 60 * 60_000,
  "8 hours": 8 * 60 * 60_000,
  "24 hours": 24 * 60 * 60_000,
};

export const MAX_RECENT_WINDOW_MS = Math.max(...Object.values(RECENT_WINDOW_MS));

export function getRecentWindowMs(value: unknown): number {
  if (typeof value === "string" && value in RECENT_WINDOW_MS) {
    return RECENT_WINDOW_MS[value as keyof typeof RECENT_WINDOW_MS];
  }
  return RECENT_WINDOW_MS[DEFAULT_RECENT_WINDOW];
}
