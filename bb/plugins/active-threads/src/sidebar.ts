import type { PluginSidebarThread } from "@bb/plugin-sdk/app";

const ACTIVE_INDICATORS = new Set([
  "runtime",
  "workflow",
  "background-agent",
  "background-command",
  "plan-mode",
  "goal",
]);

export const THREAD_LIVENESS_WINDOW_MS = 30 * 60_000;
export type ThreadLiveness = "running" | "recent" | "none";

export function threadDisplayTitle(
  thread: Pick<PluginSidebarThread, "title" | "titleFallback">,
): string {
  return thread.title?.trim() || thread.titleFallback?.trim() || "Untitled thread";
}

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
  windowMs = THREAD_LIVENESS_WINDOW_MS,
): ThreadLiveness {
  if (thread.isArchived) return "none";
  if (isActiveThread(thread)) return "running";
  if (
    lastProcessingAt !== null &&
    now - lastProcessingAt <= windowMs
  ) {
    return "recent";
  }
  return "none";
}

export function formatActivityAge(activityAt: number, now: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - activityAt) / 60_000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes === 1) return "1m ago";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  return `${hours}h ago`;
}

export function matchesThreadSearch(
  thread: Pick<
    PluginSidebarThread,
    "title" | "titleFallback" | "environment" | "host"
  >,
  projectName: string,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;

  const searchable = [
    threadDisplayTitle(thread),
    projectName,
    thread.environment?.branchName,
    thread.environment?.name,
    thread.host?.name,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();

  return searchable.includes(query);
}

export function followSelectedProject(
  collapsedProjectIds: ReadonlySet<string>,
  previousProjectId: string | null,
  selectedProjectId: string,
  selectedThreadIsLive = false,
): Set<string> {
  const next = new Set(collapsedProjectIds);
  if (previousProjectId && previousProjectId !== selectedProjectId) {
    next.add(previousProjectId);
  }
  if (selectedThreadIsLive) next.add(selectedProjectId);
  else next.delete(selectedProjectId);
  return next;
}

export function orderedNavigationThreadIds(
  liveThreadIds: readonly string[],
  projectThreadIds: readonly string[],
): string[] {
  const live = new Set(liveThreadIds);
  return [
    ...liveThreadIds,
    ...projectThreadIds.filter((threadId) => !live.has(threadId)),
  ];
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

export function threadDepth(
  thread: Pick<PluginSidebarThread, "id" | "parentThreadId">,
  visibleThreads: readonly Pick<PluginSidebarThread, "id" | "parentThreadId">[],
): number {
  const byId = new Map(visibleThreads.map((candidate) => [candidate.id, candidate]));
  const seen = new Set([thread.id]);
  let parentId = thread.parentThreadId;
  let depth = 0;

  while (parentId && depth < 3) {
    const parent = byId.get(parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    depth += 1;
    parentId = parent.parentThreadId;
  }

  return depth;
}
