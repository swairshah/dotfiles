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

export function normalizeRecentWindow(value: unknown): (typeof RECENT_WINDOW_OPTIONS)[number] {
  return typeof value === "string" && value in RECENT_WINDOW_MS
    ? (value as (typeof RECENT_WINDOW_OPTIONS)[number])
    : DEFAULT_RECENT_WINDOW;
}

export function getRecentWindowMs(value: unknown): number {
  return RECENT_WINDOW_MS[normalizeRecentWindow(value)];
}

export function describeRecentWindow(value: unknown): string {
  const window = normalizeRecentWindow(value);
  return window === "Running only"
    ? "Running threads only"
    : `Running now or processed a message in the last ${window}`;
}
