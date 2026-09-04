import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

const ACTIVE_INDICATORS = new Set([
  "runtime",
  "workflow",
  "background-agent",
  "background-command",
  "plan-mode",
  "goal",
]);

export type ThreadLiveness = "running" | "recent" | "none";

export function isActiveThread(
  thread: Pick<PluginSidebarThread, "activity" | "indicator" | "isArchived">,
): boolean {
  if (thread.isArchived) return false;
  const activity = thread.activity;
  if (
    activity.workflows +
      activity.backgroundAgents +
      activity.backgroundCommands +
      activity.planMode +
      activity.goals >
    0
  ) {
    return true;
  }
  return ACTIVE_INDICATORS.has(thread.indicator);
}

export function getThreadLiveness(
  thread: Pick<PluginSidebarThread, "activity" | "indicator" | "isArchived">,
  now: number,
  lastProcessingAt: number | null,
  windowMs: number,
): ThreadLiveness {
  if (thread.isArchived) return "none";
  if (isActiveThread(thread)) return "running";
  if (
    windowMs > 0 &&
    lastProcessingAt !== null &&
    now - lastProcessingAt <= windowMs
  ) {
    return "recent";
  }
  return "none";
}

export function compareSidebarThreads(
  left: Pick<
    PluginSidebarThread,
    "isPinned" | "latestAttentionAt" | "updatedAt" | "createdAt"
  >,
  right: Pick<
    PluginSidebarThread,
    "isPinned" | "latestAttentionAt" | "updatedAt" | "createdAt"
  >,
): number {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
  return (
    right.latestAttentionAt - left.latestAttentionAt ||
    right.updatedAt - left.updatedAt ||
    right.createdAt - left.createdAt
  );
}

export function formatActivityAge(activityAt: number, now: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - activityAt) / 60_000));
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  return `${hours}h ago`;
}
