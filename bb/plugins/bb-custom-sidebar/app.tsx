import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as HoverCard from "@radix-ui/react-hover-card";
import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  useRealtime,
  useRpc,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type {
  ProjectIconState,
  rpcContract,
  ThreadSummary,
} from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { cn } from "@/lib/utils";
import {
  compareSidebarThreads,
  formatActivityAge,
  getThreadLiveness,
  isActiveThread,
  type ThreadLiveness,
} from "./src/sidebar";
import {
  getRecentWindowMs,
  MAX_RECENT_WINDOW_MS,
} from "./src/settings";

interface ThreadGroup {
  project: PluginSidebarProject | null;
  rows: Array<{ thread: PluginSidebarThread; depth: number }>;
}

interface RecentThreadEntry {
  thread: PluginSidebarThread;
  liveness: Exclude<ThreadLiveness, "none">;
  activityAt: number;
}

const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none focus:bg-state-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
const COLLAPSED_PROJECTS_KEY =
  "bb-plugin-thread-hover-status:collapsed-projects";
const PROCESSING_LEASES_KEY =
  "bb-plugin-thread-hover-status:processing-leases";
const SUMMARY_CACHE_MS = 15_000;
const PROJECT_ICON_CHANNEL = "project-icon-updated";
const summaryCache = new Map<
  string,
  { summary: ThreadSummary; fetchedAt: number }
>();
const summaryRequests = new Map<string, Promise<ThreadSummary>>();
const projectIconCache = new Map<string, ProjectIconState>();

function threadTitle(thread: PluginSidebarThread): string {
  return thread.title ?? thread.titleFallback ?? "Untitled thread";
}

function flattenThreads(
  threads: readonly PluginSidebarThread[],
): Array<{ thread: PluginSidebarThread; depth: number }> {
  const sorted = [...threads].sort(compareSidebarThreads);
  const byId = new Map(sorted.map((thread) => [thread.id, thread]));
  const children = new Map<string, PluginSidebarThread[]>();

  for (const thread of sorted) {
    if (thread.parentThreadId === null || !byId.has(thread.parentThreadId)) {
      continue;
    }
    const siblings = children.get(thread.parentThreadId) ?? [];
    siblings.push(thread);
    children.set(thread.parentThreadId, siblings);
  }

  const rows: Array<{ thread: PluginSidebarThread; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (thread: PluginSidebarThread, depth: number) => {
    if (visited.has(thread.id)) return;
    visited.add(thread.id);
    rows.push({ thread, depth });
    for (const child of (children.get(thread.id) ?? []).sort(
      compareSidebarThreads,
    )) {
      visit(child, depth + 1);
    }
  };

  for (const thread of sorted) {
    if (thread.parentThreadId === null || !byId.has(thread.parentThreadId)) {
      visit(thread, 0);
    }
  }
  for (const thread of sorted) visit(thread, 0);
  return rows;
}

function buildGroups(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
): ThreadGroup[] {
  const visible = threads.filter((thread) => !thread.isArchived);
  const knownProjectIds = new Set(projects.map((project) => project.id));
  const groups: ThreadGroup[] = projects
    .map((project) => ({
      project,
      rows: flattenThreads(
        visible.filter((thread) => thread.projectId === project.id),
      ),
    }))
    .filter((group) => group.rows.length > 0);
  const unknownRows = flattenThreads(
    visible.filter((thread) => !knownProjectIds.has(thread.projectId)),
  );
  if (unknownRows.length > 0) groups.push({ project: null, rows: unknownRows });
  return groups;
}

function formatAge(timestamp: number): string {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1_000),
  );
  if (elapsedSeconds < 60) return "now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatCompactCount(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${Math.round(value / 1_000)}k`;
}

function ThreadIndicator({
  thread,
  liveness = null,
  isCurrentLive = false,
}: {
  thread: PluginSidebarThread;
  liveness?: Exclude<ThreadLiveness, "none"> | null;
  isCurrentLive?: boolean;
}) {
  const label = thread.indicatorLabel ?? undefined;
  const iconClass = "size-3 shrink-0";

  switch (thread.indicator) {
    case "unread-error":
      return (
        <Icon
          name="CircleX"
          aria-label={label}
          className={cn(iconClass, "text-destructive")}
        />
      );
    case "waiting-for-input":
      return (
        <Icon
          name="CircleQuestion"
          aria-label={label}
          className={cn(iconClass, "text-muted-foreground")}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          aria-label={label}
          className={cn(
            iconClass,
            "animate-spin text-muted-foreground motion-reduce:animate-none",
          )}
        />
      );
    case "workflow":
      return <WorkingThreadIcon name="Workflow" label={label} />;
    case "background-agent":
      return <WorkingThreadIcon name="UserRoundPlus" label={label} />;
    case "background-command":
      return <WorkingThreadIcon name="Terminal" label={label} />;
    case "plan-mode":
      return <WorkingThreadIcon name="ListTodo" label={label} />;
    case "goal":
      return <WorkingThreadIcon name="Target" label={label} />;
    case "draft":
    case "working-draft":
      return (
        <Icon
          name="Edit"
          aria-label={label}
          className={cn(iconClass, "text-muted-foreground")}
        />
      );
    case "unread-success":
      return (
        <span
          aria-label={label}
          className="flex size-3 items-center justify-center"
        >
          <span className="size-1.5 rounded-full bg-success-foreground" />
        </span>
      );
    case "none":
      if (isCurrentLive) {
        return (
          <Icon
            name="Circle"
            aria-label="Current recent thread"
            className={cn(iconClass, "text-success-foreground")}
          />
        );
      }
      if (liveness === "recent") {
        return (
          <Icon
            name="Clock"
            aria-label="Recently active thread"
            className={cn(iconClass, "text-muted-foreground/70")}
          />
        );
      }
      return (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-muted-foreground/25"
        />
      );
    default:
      return (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-muted-foreground/25"
        />
      );
  }
}

function WorkingThreadIcon({
  name,
  label,
}: {
  name: "Workflow" | "UserRoundPlus" | "Terminal" | "ListTodo" | "Target";
  label: string | undefined;
}) {
  return (
    <Icon
      name={name}
      aria-label={label}
      className="size-3 animate-pulse text-muted-foreground motion-reduce:animate-none"
    />
  );
}

function useElementVisible(element: Element | null): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (element === null) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting === true),
      { rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return visible;
}

function useProjectIcon(projectId: string, enabled: boolean) {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<ProjectIconState>(
    projectIconCache.get(projectId) ?? { status: "pending" },
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await rpc.call("project_icon", { projectId });
      projectIconCache.set(projectId, next);
      setState(next);
    } catch {
      const unavailable: ProjectIconState = { status: "unavailable" };
      projectIconCache.set(projectId, unavailable);
      setState(unavailable);
    }
  }, [enabled, projectId, rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpdate = useCallback(
    (payload: unknown) => {
      if (
        enabled &&
        payload !== null &&
        typeof payload === "object" &&
        "projectId" in payload &&
        payload.projectId === projectId
      ) {
        void refresh();
      }
    },
    [enabled, projectId, refresh],
  );
  useRealtime(PROJECT_ICON_CHANNEL, handleUpdate);

  return state;
}

function ProjectGlyph({
  project,
  state,
}: {
  project: PluginSidebarProject;
  state: ProjectIconState;
}) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center overflow-hidden rounded bg-sidebar-accent text-muted-foreground",
        state.status === "pending" && "animate-pulse",
      )}
      title={state.status === "ready" ? state.sourceLabel : undefined}
    >
      {state.status === "ready" ? (
        <img
          src={state.dataUrl}
          alt=""
          draggable={false}
          className="size-full object-contain"
        />
      ) : (
        <Icon
          name={project.isPersonal ? "UserRound" : "Folder"}
          className="size-3"
          aria-hidden
        />
      )}
    </span>
  );
}

function useThreadSummary(threadId: string, enabled: boolean) {
  const rpc = useRpc<typeof rpcContract>();
  const cached = summaryCache.get(threadId)?.summary ?? null;
  const [summary, setSummary] = useState<ThreadSummary | null>(cached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      const cachedEntry = summaryCache.get(threadId);
      if (
        !force &&
        cachedEntry !== undefined &&
        Date.now() - cachedEntry.fetchedAt < SUMMARY_CACHE_MS
      ) {
        if (mounted.current) setSummary(cachedEntry.summary);
        return cachedEntry.summary;
      }

      if (mounted.current) {
        setLoading(true);
        setError(null);
      }
      try {
        let request = summaryRequests.get(threadId);
        if (request === undefined) {
          request = rpc.call("thread_summary", { threadId });
          summaryRequests.set(threadId, request);
          void request.then(
            () => summaryRequests.delete(threadId),
            () => summaryRequests.delete(threadId),
          );
        }
        const next = await request;
        summaryCache.set(threadId, { summary: next, fetchedAt: Date.now() });
        if (mounted.current) setSummary(next);
        return next;
      } catch (cause) {
        if (mounted.current) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
        return null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [rpc, threadId],
  );

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { rpc, summary, loading, error, refresh };
}

type ThreadSummaryState = ReturnType<typeof useThreadSummary>;

function DiffStats({
  summary,
  compact = false,
}: {
  summary: ThreadSummary | null;
  compact?: boolean;
}) {
  if (summary === null || summary.git.state === "unavailable") return null;
  const format = compact ? formatCompactCount : String;
  const caveat = summary.git.lineStatsComplete
    ? undefined
    : "Line counts may exclude untracked files";
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums"
      title={caveat}
    >
      <span className="text-diff-added">
        +{format(summary.git.insertions)}
      </span>
      <span className="text-diff-removed">
        -{format(summary.git.deletions)}
      </span>
    </span>
  );
}

function ThreadHoverCard({
  thread,
  open,
  onOpenChange,
  onNavigate,
  isCompactViewport,
  summaryState,
  children,
}: {
  thread: PluginSidebarThread;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: () => void;
  isCompactViewport: boolean;
  summaryState: ThreadSummaryState;
  children: ReactNode;
}) {
  const actions = experimental_useSidebarThreadActions();
  const portalScopeProps = usePortalScopeProps();
  const { rpc, summary, loading, error, refresh } = summaryState;
  const [actionPending, setActionPending] = useState(false);
  const dirty = summary?.git.state === "dirty";

  const createPullRequest = async () => {
    if (actionPending) return;
    setActionPending(true);
    try {
      const result = await rpc.call("create_pull_request", {
        threadId: thread.id,
      });
      toast.success(
        result.delivery === "sent"
          ? "Creating pull request"
          : "Pull request work queued",
      );
      actions.open(thread.id);
      onNavigate();
      onOpenChange(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not create pull request",
      );
      void refresh(true);
    } finally {
      setActionPending(false);
    }
  };

  const archive = () => {
    actions.archive(thread.id);
    onOpenChange(false);
  };

  return (
    <HoverCard.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) void refresh();
      }}
      openDelay={260}
      closeDelay={120}
    >
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          {...portalScopeProps}
          side={isCompactViewport ? "bottom" : "right"}
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-xl outline-none"
          style={{ width: "20rem", maxWidth: "calc(100vw - 1rem)" }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex min-h-5 items-center justify-between gap-3 text-xs">
            {summary === null ? (
              <span className="text-muted-foreground">
                Checking workspace…
              </span>
            ) : summary.git.state === "unavailable" ? (
              <span className="text-muted-foreground">No git workspace</span>
            ) : (
              <DiffStats summary={summary} />
            )}
            <ThreadIndicator thread={thread} />
          </div>

          <h3 className="mt-2 truncate text-base font-semibold">
            {threadTitle(thread)}
          </h3>
          <p className="mt-2 line-clamp-3 max-w-full overflow-hidden break-words text-sm leading-5 text-muted-foreground">
            {summary?.lastMessage?.text ??
              (loading ? "Loading last message…" : "No messages yet.")}
          </p>
          {error === null ? null : (
            <p
              role="alert"
              className="mt-2 line-clamp-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            {error !== null && summary === null ? (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void refresh(true)}
              >
                <Icon
                  name="Loading"
                  className={cn("size-4", loading && "animate-spin")}
                />
                Retry
              </Button>
            ) : summary === null ? (
              <Button variant="outline" size="sm" disabled>
                <Icon name="Loading" className="size-4 animate-spin" />
                Checking
              </Button>
            ) : dirty ? (
              <Button
                variant="outline"
                size="sm"
                disabled={actionPending}
                onClick={() => void createPullRequest()}
              >
                <Icon
                  name={actionPending ? "Loading" : "GitPullRequest"}
                  className={cn("size-4", actionPending && "animate-spin")}
                />
                Create PR
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={archive}>
                <Icon name="Archive" className="size-4" />
                Archive
              </Button>
            )}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {formatAge(thread.updatedAt)}
            </span>
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function ThreadContextMenu({
  thread,
  onNavigate,
  children,
}: {
  thread: PluginSidebarThread;
  onNavigate: () => void;
  children: ReactNode;
}) {
  const actions = experimental_useSidebarThreadActions();
  const split = experimental_useSidebarThreadSplit(thread.id);
  const portalScopeProps = usePortalScopeProps();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          {...portalScopeProps}
          className="z-50 min-w-44 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            disabled={!split.isAvailable}
            onSelect={() => {
              actions.open(thread.id, { split: true });
              onNavigate();
            }}
          >
            <Icon name="PanelLeft" className="size-4" />
            Open in split
          </ContextMenu.Item>
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onSelect={() =>
              void actions.setPinned(thread.id, !thread.isPinned)
            }
          >
            <Icon name="Pin" className="size-4" />
            {thread.isPinned ? "Unpin" : "Pin"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onSelect={() =>
              void actions.setRead(thread.id, thread.isUnread)
            }
          >
            <Icon name="MessageSquare" className="size-4" />
            {thread.isUnread ? "Mark read" : "Mark unread"}
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onSelect={() => actions.archive(thread.id)}
          >
            <Icon name="Archive" className="size-4" />
            Archive
          </ContextMenu.Item>
          <ContextMenu.Item
            className={cn(
              MENU_ITEM_CLASS,
              "text-destructive focus:text-destructive",
            )}
            onSelect={() => actions.requestDelete(thread.id)}
          >
            <Icon name="Trash2" className="size-4" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function ThreadRow({
  thread,
  depth,
  ordinal,
  active,
  recent,
  liveness,
  shortcutTarget,
  projectName,
  activityAt,
  now,
  onNavigate,
  isCompactViewport,
}: {
  thread: PluginSidebarThread;
  depth: number;
  ordinal?: number;
  active: boolean;
  recent: boolean;
  liveness: Exclude<ThreadLiveness, "none"> | null;
  shortcutTarget: boolean;
  projectName: string;
  activityAt: number;
  now: number;
  onNavigate: () => void;
  isCompactViewport: boolean;
}) {
  const actions = experimental_useSidebarThreadActions();
  const split = experimental_useSidebarThreadSplit(thread.id);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [rowElement, setRowElement] = useState<HTMLAnchorElement | null>(null);
  const visible = useElementVisible(rowElement);
  const summaryState = useThreadSummary(thread.id, visible || hoverOpen);
  const openThread = () => {
    actions.open(thread.id);
    onNavigate();
  };

  const row = (
    <a
      ref={setRowElement}
      href="#"
      data-sidebar-thread-shortcut-target={shortcutTarget ? "" : undefined}
      data-sidebar-thread-id={shortcutTarget ? thread.id : undefined}
      {...split.splitProps}
      onClick={(event) => {
        event.preventDefault();
        actions.open(thread.id, {
          split: split.isAvailable && (event.metaKey || event.ctrlKey),
        });
        onNavigate();
      }}
      className={cn(
        "group/thread flex min-w-0 items-center gap-1 rounded-md px-1 text-sm outline-none transition-[color,background-color,transform] active:scale-[0.98] focus-visible:ring-1 focus-visible:ring-ring",
        recent ? "min-h-9" : "min-h-7",
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground",
        thread.isUnread && "font-medium text-sidebar-foreground",
      )}
      style={
        recent || depth === 0
          ? undefined
          : { marginLeft: Math.min(depth, 3) * 12 }
      }
      aria-current={active ? "page" : undefined}
      aria-label={`Open ${threadTitle(thread)}`}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-[10px] tabular-nums text-muted-foreground">
        {recent ? (
          <ThreadIndicator
            thread={thread}
            liveness={liveness}
            isCurrentLive={active}
          />
        ) : thread.parentThreadId !== null ? (
          <Icon name="Fork" className="size-3.5" aria-hidden />
        ) : (
          ordinal
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs" title={threadTitle(thread)}>
          {threadTitle(thread)}
        </span>
        {recent ? (
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{projectName}</span>
            <span className="shrink-0 tabular-nums">
              {formatActivityAge(activityAt, now)}
            </span>
          </span>
        ) : null}
      </span>
      {summaryState.summary?.git.state === "dirty" ? (
        <span className="text-[10px]">
          <DiffStats summary={summaryState.summary} compact />
        </span>
      ) : null}
      {thread.isPinned ? (
        <Icon
          name="Pin"
          className="size-3 shrink-0 text-muted-foreground/60"
          aria-label="Pinned"
        />
      ) : null}
    </a>
  );

  return (
    <ThreadContextMenu thread={thread} onNavigate={onNavigate}>
      <div>
        <ThreadHoverCard
          thread={thread}
          open={hoverOpen}
          onOpenChange={setHoverOpen}
          onNavigate={onNavigate}
          isCompactViewport={isCompactViewport}
          summaryState={summaryState}
        >
          {row}
        </ThreadHoverCard>
      </div>
    </ThreadContextMenu>
  );
}

function RecentThreads({
  entries,
  activeThreadId,
  projectNameById,
  now,
  onNavigate,
  isCompactViewport,
}: {
  entries: readonly RecentThreadEntry[];
  activeThreadId: string | null;
  projectNameById: ReadonlyMap<string, string>;
  now: number;
  onNavigate: () => void;
  isCompactViewport: boolean;
}) {
  const runningCount = entries.filter(
    (entry) => entry.liveness === "running",
  ).length;
  return (
    <section
      aria-label="Recent threads"
      className="mx-1.5 mt-1 rounded-lg bg-sidebar-accent/40 p-0.5 ring-1 ring-sidebar-border/60"
    >
      <div className="flex h-6 items-center gap-1.5 px-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            runningCount > 0
              ? "bg-success-foreground"
              : "bg-muted-foreground/35",
          )}
        />
        <h2 className="min-w-0 flex-1 text-xs font-semibold text-sidebar-foreground">
          Recent threads
        </h2>
        {runningCount > 0 ? (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {runningCount} running
          </span>
        ) : null}
        <span className="min-w-5 rounded-full bg-sidebar px-1.5 py-0.5 text-center text-[10px] tabular-nums text-muted-foreground">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          No recent threads.
        </p>
      ) : (
        <div className="space-y-0.5">
          {entries.map(({ thread, activityAt, liveness }) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              depth={0}
              active={thread.id === activeThreadId}
              recent
              liveness={liveness}
              shortcutTarget
              projectName={
                projectNameById.get(thread.projectId) ?? "Unknown project"
              }
              activityAt={activityAt}
              now={now}
              onNavigate={onNavigate}
              isCompactViewport={isCompactViewport}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectSection({
  group,
  collapsed,
  activeThreadId,
  recentThreadIds,
  onToggle,
  onNavigate,
  isCompactViewport,
}: {
  group: ThreadGroup;
  collapsed: boolean;
  activeThreadId: string | null;
  recentThreadIds: ReadonlySet<string>;
  onToggle: () => void;
  onNavigate: () => void;
  isCompactViewport: boolean;
}) {
  const actions = experimental_useSidebarThreadActions();
  const project = group.project;
  const [headerElement, setHeaderElement] = useState<HTMLDivElement | null>(null);
  const visible = useElementVisible(headerElement);
  const iconState = useProjectIcon(
    project?.id ?? "",
    project !== null && !project.isPersonal && visible,
  );
  if (project === null) return null;

  return (
    <section aria-label={project.name}>
      <div
        ref={setHeaderElement}
        className="group/project flex min-h-7 items-center rounded-md hover:bg-sidebar-accent/35"
      >
        <button
          type="button"
          className="flex min-h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left outline-none active:scale-[0.98] focus-visible:ring-1 focus-visible:ring-ring"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${project.name}`}
          onClick={onToggle}
        >
          <Icon
            name="ChevronRight"
            className={cn(
              "size-2.5 shrink-0 text-muted-foreground transition-transform",
              !collapsed && "rotate-90",
            )}
            aria-hidden
          />
          <ProjectGlyph project={project} state={iconState} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/90">
            {project.name}
          </span>
        </button>
        <button
          type="button"
          className="mr-0.5 grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`New thread in ${project.name}`}
          onClick={() => {
            actions.openNewThread({ projectId: project.id, focusPrompt: true });
            onNavigate();
          }}
        >
          <Icon name="Plus" className="size-3.5" aria-hidden />
        </button>
      </div>
      {!collapsed ? (
        <div className="ml-3 space-y-px border-l border-sidebar-border/60 pl-0.5">
          {group.rows.map(({ thread, depth }, index) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              depth={depth}
              ordinal={index + 1}
              active={thread.id === activeThreadId}
              recent={false}
              liveness={null}
              shortcutTarget={!recentThreadIds.has(thread.id)}
              projectName={project.name}
              activityAt={thread.updatedAt}
              now={Date.now()}
              onNavigate={onNavigate}
              isCompactViewport={isCompactViewport}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ThreadList({
  activeProjectId,
  activeThreadId,
  isCompactViewport,
  onNavigate,
}: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const { values: settings } = useSettings();
  const recentWindowMs = getRecentWindowMs(settings?.recentWindow);
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  const [processingLeases, setProcessingLeases] = useState<Map<string, number>>(
    readProcessingLeases,
  );
  const previousRunningIds = useRef<Set<string>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string> | null>(
    readCollapsedProjects,
  );
  const [onlyActiveProjects, setOnlyActiveProjects] = useState(false);
  const now = nowMinute * 60_000;

  const visibleThreads = useMemo(
    () => threads.filter((thread) => !thread.isArchived),
    [threads],
  );
  const groups = useMemo(
    () => buildGroups(visibleThreads, projects),
    [projects, visibleThreads],
  );
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const runningIds = useMemo(
    () =>
      new Set(
        visibleThreads.filter(isActiveThread).map((thread) => thread.id),
      ),
    [visibleThreads],
  );
  const recentEntries = useMemo(
    () =>
      visibleThreads
        .map((thread) => {
          const activityAt = processingLeases.get(thread.id) ?? thread.updatedAt;
          return {
            thread,
            activityAt,
            liveness: getThreadLiveness(
              thread,
              now,
              activityAt,
              recentWindowMs,
            ),
          };
        })
        .filter(
          (entry): entry is RecentThreadEntry => entry.liveness !== "none",
        )
        .sort((left, right) =>
          compareSidebarThreads(left.thread, right.thread),
        ),
    [now, processingLeases, recentWindowMs, visibleThreads],
  );
  const recentThreadIds = useMemo(
    () => new Set(recentEntries.map((entry) => entry.thread.id)),
    [recentEntries],
  );
  const activeThreadProjectId = visibleThreads.find(
    (thread) => thread.id === activeThreadId,
  )?.projectId;
  const projectToReveal = activeProjectId ?? activeThreadProjectId;

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previous = previousRunningIds.current;
    const transitioned = new Set<string>();
    for (const id of runningIds) if (!previous.has(id)) transitioned.add(id);
    for (const id of previous) if (!runningIds.has(id)) transitioned.add(id);
    previousRunningIds.current = new Set(runningIds);
    if (transitioned.size === 0) return;
    const changedAt = Date.now();
    setProcessingLeases((current) => {
      const next = new Map(current);
      for (const id of transitioned) next.set(id, changedAt);
      return next;
    });
  }, [runningIds]);

  useEffect(() => {
    setProcessingLeases((current) => {
      const next = new Map(
        [...current].filter(
          ([id, changedAt]) =>
            runningIds.has(id) ||
            (recentWindowMs > 0 && now - changedAt <= recentWindowMs),
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [now, recentWindowMs, runningIds]);

  useEffect(() => {
    writeJsonStorage(PROCESSING_LEASES_KEY, Object.fromEntries(processingLeases));
  }, [processingLeases]);

  useEffect(() => {
    if (status !== "ready" || collapsedProjects !== null) return;
    setCollapsedProjects(
      new Set(
        projects
          .filter((project) => project.id !== projectToReveal)
          .map((project) => project.id),
      ),
    );
  }, [collapsedProjects, projectToReveal, projects, status]);

  useEffect(() => {
    if (projectToReveal === undefined) return;
    setCollapsedProjects((current) => {
      const next = new Set(current ?? []);
      next.delete(projectToReveal);
      return next;
    });
  }, [projectToReveal]);

  useEffect(() => {
    if (collapsedProjects !== null) {
      writeJsonStorage(COLLAPSED_PROJECTS_KEY, [...collapsedProjects]);
    }
  }, [collapsedProjects]);

  const displayedGroups = onlyActiveProjects
    ? groups.filter((group) =>
        group.rows.some(
          ({ thread }) => isActiveThread(thread) || thread.isUnread,
        ),
      )
    : groups;

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((current) => {
      const next = new Set(current ?? []);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  if (status === "loading") {
    return (
      <div className="space-y-2 p-2" aria-label="Loading threads">
        <div className="h-20 animate-pulse rounded-xl bg-sidebar-accent/50" />
        <div className="h-12 animate-pulse rounded-xl bg-sidebar-accent/35" />
        <div className="h-12 animate-pulse rounded-xl bg-sidebar-accent/35" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div role="alert" className="p-4 text-sm text-destructive">
        Threads could not be loaded.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-3 antialiased">
      <RecentThreads
        entries={recentEntries}
        activeThreadId={activeThreadId}
        projectNameById={projectNameById}
        now={now}
        onNavigate={onNavigate}
        isCompactViewport={isCompactViewport}
      />

      <section aria-label="Projects" className="px-1.5 pt-1.5">
        <div className="flex h-6 items-center gap-0.5 px-1">
          <h2 className="min-w-0 flex-1 text-xs font-semibold text-sidebar-foreground/85">
            Projects
          </h2>
          <button
            type="button"
            className={cn(
              "grid size-5 place-items-center rounded text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
              onlyActiveProjects && "bg-sidebar-accent text-foreground",
            )}
            aria-label="Show only projects with active or unread threads"
            aria-pressed={onlyActiveProjects}
            onClick={() => setOnlyActiveProjects((current) => !current)}
          >
            <Icon name="SlidersHorizontal" className="size-3" aria-hidden />
          </button>
          <button
            type="button"
            className="grid size-5 place-items-center rounded text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Start a project thread"
            onClick={() => {
              actions.openNewThread({ focusPrompt: true });
              onNavigate();
            }}
          >
            <Icon name="FolderPlus" className="size-3" aria-hidden />
          </button>
        </div>

        {displayedGroups.length === 0 ? (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">
            No matching projects.
          </p>
        ) : (
          <div className="mt-0.5 space-y-0.5">
            {displayedGroups.map((group, index) => {
              if (group.project === null) return null;
              const collapsed =
                collapsedProjects?.has(group.project.id) ??
                group.project.id !== projectToReveal;
              return (
                <ProjectSection
                  key={group.project.id ?? index}
                  group={group}
                  collapsed={collapsed}
                  activeThreadId={activeThreadId}
                  recentThreadIds={recentThreadIds}
                  onToggle={() => toggleProject(group.project!.id)}
                  onNavigate={onNavigate}
                  isCompactViewport={isCompactViewport}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function readCollapsedProjects(): Set<string> | null {
  try {
    const raw = localStorage.getItem(COLLAPSED_PROJECTS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((value) => typeof value === "string")
    ) {
      return null;
    }
    return new Set(parsed);
  } catch {
    return null;
  }
}

function readProcessingLeases(): Map<string, number> {
  try {
    const raw = localStorage.getItem(PROCESSING_LEASES_KEY);
    if (raw === null) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map();
    }
    const now = Date.now();
    return new Map(
      Object.entries(parsed).filter(
        ([id, changedAt]) =>
          id.length > 0 &&
          typeof changedAt === "number" &&
          Number.isFinite(changedAt) &&
          changedAt <= now + 60_000 &&
          now - changedAt <= MAX_RECENT_WINDOW_MS,
      ) as Array<[string, number]>,
    );
  } catch {
    return new Map();
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Some webviews can block local storage.
  }
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "hover-status",
    title: "BB Custom Sidebar",
    description:
      "Shows recent threads, project threads, Git changes, hover actions, and project icons.",
    component: ThreadList,
  });
});
