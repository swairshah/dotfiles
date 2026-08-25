import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  definePluginApp,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginSidebarThreadIndicator,
  type PluginThreadListProps,
} from "@bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  compareSidebarThreads,
  followSelectedProject,
  formatActivityAge,
  getThreadLiveness,
  isActiveThread,
  matchesThreadSearch,
  THREAD_LIVENESS_WINDOW_MS,
  threadDepth,
  threadDisplayTitle,
  type ThreadLiveness,
} from "./src/sidebar";

const COLLAPSED_PROJECTS_KEY = "bb-plugin-active-threads:collapsed-projects";
const PROCESSING_LEASES_KEY = "bb-plugin-active-threads:processing-leases";

type LiveThreadEntry = {
  thread: PluginSidebarThread;
  liveness: Exclude<ThreadLiveness, "none">;
  lastProcessingAt: number | null;
};

function ActiveThreadsSidebar({
  activeThreadId,
  activeProjectId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const actions = useSidebarThreadActions();
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string> | null>(
    readCollapsedProjects,
  );
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  const [processingLeases, setProcessingLeases] = useState<Map<string, number>>(
    readProcessingLeases,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousSelectedProjectIdRef = useRef<string | null>(
    activeThreadId ? activeProjectId : null,
  );
  const previousRunningThreadIdsRef = useRef<Set<string>>(new Set());
  const now = nowMinute * 60_000;

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const visibleThreads = useMemo(
    () => threads.filter((thread) => !thread.isArchived),
    [threads],
  );
  const runningThreadIds = useMemo(
    () =>
      new Set(
        visibleThreads
          .filter(isActiveThread)
          .map((thread) => thread.id),
      ),
    [visibleThreads],
  );
  const liveThreads = useMemo(
    () =>
      visibleThreads
        .map((thread) => {
          const lastProcessingAt = processingLeases.get(thread.id) ?? null;
          return {
            thread,
            lastProcessingAt,
            liveness: getThreadLiveness(thread, now, lastProcessingAt),
          };
        })
        .filter((entry): entry is LiveThreadEntry => entry.liveness !== "none")
        .sort((left, right) =>
          compareSidebarThreads(left.thread, right.thread),
        ),
    [now, processingLeases, visibleThreads],
  );
  const liveThreadIds = useMemo(
    () => new Set(liveThreads.map(({ thread }) => thread.id)),
    [liveThreads],
  );
  const matchingLiveThreads = useMemo(
    () =>
      liveThreads.filter(({ thread }) =>
        matchesThreadSearch(
          thread,
          projectNameById.get(thread.projectId) ?? "",
          searchQuery,
        ),
      ),
    [liveThreads, projectNameById, searchQuery],
  );
  const runningCount = liveThreads.filter(
    ({ liveness }) => liveness === "running",
  ).length;

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previous = previousRunningThreadIdsRef.current;
    const transitioned = new Set<string>();
    for (const threadId of runningThreadIds) {
      if (!previous.has(threadId)) transitioned.add(threadId);
    }
    for (const threadId of previous) {
      if (!runningThreadIds.has(threadId)) transitioned.add(threadId);
    }
    previousRunningThreadIdsRef.current = new Set(runningThreadIds);
    if (transitioned.size === 0) return;

    const transitionedAt = Date.now();
    setProcessingLeases((current) => {
      const next = new Map(current);
      for (const threadId of transitioned) next.set(threadId, transitionedAt);
      return next;
    });
  }, [runningThreadIds]);

  useEffect(() => {
    setProcessingLeases((current) => {
      const next = new Map(
        [...current].filter(
          ([threadId, lastProcessingAt]) =>
            runningThreadIds.has(threadId) ||
            now - lastProcessingAt <= THREAD_LIVENESS_WINDOW_MS,
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [now, runningThreadIds]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PROCESSING_LEASES_KEY,
        JSON.stringify(Object.fromEntries(processingLeases)),
      );
    } catch {
      // Private browsing or a locked-down webview can reject localStorage.
    }
  }, [processingLeases]);

  useEffect(() => {
    if (status !== "ready" || collapsedProjectIds !== null) return;
    setCollapsedProjectIds(
      new Set(
        projects
          .filter((project) => project.id !== activeProjectId)
          .map((project) => project.id),
      ),
    );
  }, [activeProjectId, collapsedProjectIds, projects, status]);

  useEffect(() => {
    if (!activeThreadId || !activeProjectId) return;
    const previousProjectId = previousSelectedProjectIdRef.current;
    const selectedThreadIsLive = liveThreadIds.has(activeThreadId);
    setCollapsedProjectIds((current) => {
      const base = current ?? new Set<string>();
      const next = followSelectedProject(
        base,
        previousProjectId,
        activeProjectId,
        selectedThreadIsLive,
      );
      const unchanged =
        current !== null &&
        next.size === current.size &&
        [...next].every((projectId) => current.has(projectId));
      return unchanged ? current : next;
    });
    previousSelectedProjectIdRef.current = activeProjectId;
  }, [activeProjectId, activeThreadId, liveThreadIds]);

  useEffect(() => {
    if (!activeThreadId) return;
    const frame = window.requestAnimationFrame(() => {
      const root = scrollContainerRef.current;
      if (!root) return;
      const selectedRow = Array.from(
        root.querySelectorAll<HTMLAnchorElement>(
          "a[data-sidebar-thread-shortcut-target][data-sidebar-thread-id]",
        ),
      ).find((row) => row.dataset.sidebarThreadId === activeThreadId);
      selectedRow?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeThreadId, collapsedProjectIds, searchQuery]);

  useEffect(() => {
    if (collapsedProjectIds === null) return;
    try {
      localStorage.setItem(
        COLLAPSED_PROJECTS_KEY,
        JSON.stringify([...collapsedProjectIds]),
      );
    } catch {
      // Private browsing or a locked-down webview can reject localStorage.
    }
  }, [collapsedProjectIds]);

  const projectSections = useMemo(
    () =>
      projects.map((project) => {
        const projectNameMatches = project.name
          .toLocaleLowerCase()
          .includes(searchQuery.trim().toLocaleLowerCase());
        const candidates = visibleThreads.filter(
          (thread) => thread.projectId === project.id,
        );
        const matchingThreads = (
          projectNameMatches
            ? candidates
            : candidates.filter((thread) =>
                matchesThreadSearch(thread, project.name, searchQuery),
              )
        ).sort(compareSidebarThreads);

        return {
          project,
          threads: matchingThreads,
          visible:
            !searchQuery.trim() || projectNameMatches || matchingThreads.length > 0,
        };
      }),
    [projects, searchQuery, visibleThreads],
  );

  function toggleProject(projectId: string) {
    setCollapsedProjectIds((current) => {
      const next = new Set(current ?? []);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  if (status === "loading") return <SidebarSkeleton />;
  if (status === "error") {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground" role="status">
        Could not load threads.
      </div>
    );
  }

  const hasVisibleProject = projectSections.some((section) => section.visible);

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-0 flex-1 overflow-y-auto antialiased"
    >
      <LiveSection
        entries={matchingLiveThreads}
        totalCount={liveThreads.length}
        runningCount={runningCount}
        projectNameById={projectNameById}
        activeThreadId={activeThreadId}
        now={now}
        onNavigate={onNavigate}
        searchQuery={searchQuery}
      />

      <section aria-label="Projects" className="px-1.5 pb-3 pt-2">
        <div className="flex h-7 items-center gap-2 px-2.5">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/65">
            Projects
          </h2>
          <span className="h-px flex-1 bg-sidebar-border/70" />
        </div>

        {!hasVisibleProject ? (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground" role="status">
            No project threads found
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {projectSections.map(({ project, threads: projectThreads, visible }) => {
              if (!visible) return null;
              const collapsed =
                !searchQuery.trim() && Boolean(collapsedProjectIds?.has(project.id));
              return (
                <ProjectSection
                  key={project.id}
                  project={project}
                  threads={projectThreads}
                  collapsed={collapsed}
                  isCurrentProject={
                    project.id === activeProjectId &&
                    (activeThreadId === null || !liveThreadIds.has(activeThreadId))
                  }
                  activeThreadId={activeThreadId}
                  liveThreadIds={liveThreadIds}
                  now={now}
                  onToggle={() => toggleProject(project.id)}
                  onNewThread={() =>
                    actions.openNewThread({ projectId: project.id, focusPrompt: true })
                  }
                  onNavigate={onNavigate}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function LiveSection({
  entries,
  totalCount,
  runningCount,
  projectNameById,
  activeThreadId,
  now,
  onNavigate,
  searchQuery,
}: {
  entries: readonly LiveThreadEntry[];
  totalCount: number;
  runningCount: number;
  projectNameById: ReadonlyMap<string, string>;
  activeThreadId: string | null;
  now: number;
  onNavigate: () => void;
  searchQuery: string;
}) {
  return (
    <section
      aria-label="Live threads"
      title="Running now or processed a message in the last 30 minutes"
      className="mx-1.5 mt-1 rounded-xl bg-sidebar-accent/45 p-1 shadow-sm ring-1 ring-sidebar-border/60"
    >
      <div className="flex h-8 items-center gap-2 px-2">
        <span className="relative flex size-3 items-center justify-center" aria-hidden="true">
          {runningCount > 0 ? (
            <span className="size-1.5 rounded-full bg-success-foreground" />
          ) : totalCount > 0 ? (
            <span className="size-1.5 rounded-full bg-success-foreground/70" />
          ) : (
            <span className="size-1.5 rounded-full bg-muted-foreground/35" />
          )}
        </span>
        <h2 className="min-w-0 flex-1 text-xs font-semibold text-sidebar-foreground">
          Live threads
        </h2>
        {runningCount > 0 ? (
          <span className="text-2xs tabular-nums text-muted-foreground/70">
            {runningCount} running
          </span>
        ) : null}
        <span className="min-w-5 rounded-full bg-sidebar px-1.5 py-0.5 text-center text-2xs font-medium tabular-nums text-muted-foreground shadow-sm">
          {totalCount}
        </span>
      </div>

      {entries.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {entries.map(({ thread, liveness, lastProcessingAt }) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              projectName={projectNameById.get(thread.projectId) ?? "Unknown project"}
              isCurrent={thread.id === activeThreadId}
              activeStyle
              shortcutTarget
              liveness={liveness}
              lastProcessingAt={lastProcessingAt}
              now={now}
              depth={0}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : (
        <p className="px-2.5 pb-2 pt-0.5 text-xs text-muted-foreground/75">
          {searchQuery.trim() && totalCount > 0
            ? "No live threads match this search"
            : "No live threads yet"}
        </p>
      )}
    </section>
  );
}

function ProjectSection({
  project,
  threads,
  collapsed,
  isCurrentProject,
  activeThreadId,
  liveThreadIds,
  now,
  onToggle,
  onNewThread,
  onNavigate,
}: {
  project: PluginSidebarProject;
  threads: readonly PluginSidebarThread[];
  collapsed: boolean;
  isCurrentProject: boolean;
  activeThreadId: string | null;
  liveThreadIds: ReadonlySet<string>;
  now: number;
  onToggle: () => void;
  onNewThread: () => void;
  onNavigate: () => void;
}) {
  return (
    <section aria-label={project.name}>
      <div
        className={cn(
          "group/project flex min-h-10 items-center rounded-lg transition-colors",
          isCurrentProject ? "bg-sidebar-accent/60" : "hover:bg-sidebar-accent/35",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${project.name}`}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none ring-sidebar-ring transition-transform active:scale-[0.96] focus-visible:ring-2"
        >
          <Icon
            name="ChevronRight"
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/65 transition-transform duration-150",
              !collapsed && "rotate-90",
            )}
          />
          <Icon
            name={project.isPersonal ? "UserRound" : "Folder"}
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground/70"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground/90">
            {project.name}
          </span>
          <span className="tabular-nums text-2xs text-muted-foreground/55">
            {threads.length}
          </span>
        </button>
        <button
          type="button"
          onClick={onNewThread}
          aria-label={`New thread in ${project.name}`}
          title={`New thread in ${project.name}`}
          className="mr-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-70 outline-none ring-sidebar-ring transition-[color,background-color,transform,opacity] hover:bg-sidebar-accent hover:text-foreground hover:opacity-100 active:scale-[0.96] focus-visible:opacity-100 focus-visible:ring-2 group-hover/project:opacity-100"
        >
          <Icon name="MessageSquarePlus" aria-hidden="true" className="size-4" />
        </button>
      </div>

      {threads.length > 0 ? (
        <ul
          aria-hidden={collapsed || undefined}
          className={cn(
            "relative ml-4 flex flex-col gap-px border-l border-sidebar-border/60 pl-1.5",
            collapsed && "hidden",
          )}
        >
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              projectName={project.name}
              isCurrent={
                thread.id === activeThreadId && !liveThreadIds.has(thread.id)
              }
              activeStyle={false}
              shortcutTarget={!liveThreadIds.has(thread.id)}
              liveness={null}
              lastProcessingAt={null}
              now={now}
              depth={threadDepth(thread, threads)}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ThreadRow({
  thread,
  projectName,
  isCurrent,
  activeStyle,
  shortcutTarget,
  liveness,
  lastProcessingAt,
  now,
  depth,
  onNavigate,
}: {
  thread: PluginSidebarThread;
  projectName: string;
  isCurrent: boolean;
  activeStyle: boolean;
  shortcutTarget: boolean;
  liveness: Exclude<ThreadLiveness, "none"> | null;
  lastProcessingAt: number | null;
  now: number;
  depth: number;
  onNavigate: () => void;
}) {
  const actions = useSidebarThreadActions();
  const split = useSidebarThreadSplit(thread.id);
  const title = threadDisplayTitle(thread);
  const context = thread.environment?.branchName || thread.host?.name || null;
  const livenessLabel =
    liveness === "running"
      ? "Running"
      : liveness === "recent" && lastProcessingAt !== null
        ? formatActivityAge(lastProcessingAt, now)
        : null;

  return (
    <ThreadContextMenu thread={thread}>
      <li className="list-none">
        <a
          {...split.splitProps}
          data-sidebar-thread-shortcut-target={shortcutTarget ? "" : undefined}
          data-sidebar-thread-id={shortcutTarget ? thread.id : undefined}
          href="#"
          aria-current={isCurrent ? "page" : undefined}
          aria-label={`Open ${title}`}
          onClick={(event) => {
            event.preventDefault();
            actions.open(thread.id, {
              split: split.isAvailable && (event.metaKey || event.ctrlKey),
            });
            onNavigate();
          }}
          className={cn(
            "group/thread flex min-h-10 w-full items-center gap-2 rounded-lg pr-2 outline-none ring-sidebar-ring transition-[color,background-color,transform] active:scale-[0.96] focus-visible:ring-2",
            activeStyle &&
              (isCurrent
                ? "min-h-[52px] bb-sidebar-selected-row bg-sidebar-accent text-sidebar-foreground"
                : "min-h-[52px] bg-sidebar hover:bg-sidebar-accent"),
            !activeStyle &&
              (isCurrent
                ? "bb-sidebar-selected-row bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"),
          )}
          style={{ paddingLeft: activeStyle ? 8 : 8 + depth * 12 }}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md",
              activeStyle ? "bg-sidebar-accent" : "bg-transparent",
            )}
          >
            <ThreadStatus
              indicator={thread.indicator}
              label={thread.indicatorLabel}
              liveness={liveness}
              isCurrentLive={activeStyle && isCurrent}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm",
                thread.isUnread || activeStyle ? "font-medium" : "font-normal",
              )}
              title={title}
            >
              {title}
            </span>
            {activeStyle ? (
              <span className="mt-0.5 flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate">{projectName}</span>
                  {context ? (
                    <>
                      <span aria-hidden="true" className="text-muted-foreground/35">
                        ·
                      </span>
                      <span className="truncate">{context}</span>
                    </>
                  ) : null}
                </span>
                {livenessLabel ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground/65">
                    {livenessLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
          {thread.isPinned ? (
            <Icon
              name="Pin"
              aria-label="Pinned"
              className="size-3 shrink-0 text-muted-foreground/55"
            />
          ) : null}
          {!activeStyle && thread.indicator === "none" && thread.isUnread ? (
            <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-foreground" />
          ) : null}
        </a>
      </li>
    </ThreadContextMenu>
  );
}

function ThreadStatus({
  indicator,
  label,
  liveness,
  isCurrentLive,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
  liveness: Exclude<ThreadLiveness, "none"> | null;
  isCurrentLive: boolean;
}) {
  const aria = label ?? undefined;
  const iconClass = "size-3.5 shrink-0";

  switch (indicator) {
    case "unread-error":
      return <Icon name="CircleX" aria-label={aria} className={cn(iconClass, "text-destructive")} />;
    case "waiting-for-input":
      return <Icon name="CircleQuestion" aria-label={aria} className={cn(iconClass, "text-muted-foreground")} />;
    case "runtime":
      return <Icon name="Loading" aria-label={aria} className={cn(iconClass, "animate-spin text-muted-foreground motion-reduce:animate-none")} />;
    case "workflow":
      return <WorkingIcon name="Workflow" label={aria} />;
    case "background-agent":
      return <WorkingIcon name="UserRoundPlus" label={aria} />;
    case "background-command":
      return <WorkingIcon name="Terminal" label={aria} />;
    case "plan-mode":
      return <WorkingIcon name="ListTodo" label={aria} />;
    case "goal":
      return <WorkingIcon name="Target" label={aria} />;
    case "draft":
    case "working-draft":
      return <Icon name="Edit" aria-label={aria} className={cn(iconClass, "text-muted-foreground")} />;
    case "unread-success":
      return (
        <span aria-label={aria} className="flex size-3.5 items-center justify-center">
          <span className="size-1.5 rounded-full bg-success-foreground" />
        </span>
      );
    case "none":
      if (isCurrentLive) {
        return (
          <Icon
            name="Circle"
            aria-label="Current live thread"
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
      return <span className="size-1.5 rounded-full bg-muted-foreground/25" aria-hidden="true" />;
    default:
      return <span className="size-1.5 rounded-full bg-muted-foreground/25" aria-hidden="true" />;
  }
}

function WorkingIcon({
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
      className="size-3.5 animate-pulse text-muted-foreground motion-reduce:animate-none"
    />
  );
}

function ThreadContextMenu({
  thread,
  children,
}: {
  thread: PluginSidebarThread;
  children: ReactNode;
}) {
  const actions = useSidebarThreadActions();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Thread actions"
          className="z-50 min-w-44 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <MenuItem onSelect={() => actions.open(thread.id, { split: true })}>
            Open in split
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => void actions.setRead(thread.id, thread.isUnread)}>
            {thread.isUnread ? "Mark read" : "Mark unread"}
          </MenuItem>
          <MenuItem onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}>
            {thread.isPinned ? "Unpin" : "Pin"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => actions.archive(thread.id)}>Archive</MenuItem>
          <MenuItem destructive onSelect={() => actions.requestDelete(thread.id)}>
            Delete
          </MenuItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function MenuItem({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded-lg px-2.5 py-2 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}

function MenuSeparator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}

function SidebarSkeleton() {
  return (
    <div className="space-y-2 px-2 py-1" aria-label="Loading threads">
      <div className="h-20 animate-pulse rounded-xl bg-sidebar-accent/55 motion-reduce:animate-none" />
      <div className="h-10 animate-pulse rounded-lg bg-sidebar-accent/35 motion-reduce:animate-none" />
      <div className="h-10 animate-pulse rounded-lg bg-sidebar-accent/35 motion-reduce:animate-none" />
    </div>
  );
}

function readProcessingLeases(): Map<string, number> {
  try {
    const raw = localStorage.getItem(PROCESSING_LEASES_KEY);
    if (raw === null) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map();
    }

    const now = Date.now();
    return new Map(
      Object.entries(parsed).filter(
        ([threadId, lastProcessingAt]) =>
          threadId.length > 0 &&
          typeof lastProcessingAt === "number" &&
          Number.isFinite(lastProcessingAt) &&
          lastProcessingAt <= now + 60_000 &&
          now - lastProcessingAt <= THREAD_LIVENESS_WINDOW_MS,
      ),
    );
  } catch {
    return new Map();
  }
}

function readCollapsedProjects(): Set<string> | null {
  try {
    const raw = localStorage.getItem(COLLAPSED_PROJECTS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
      return null;
    }
    return new Set(parsed);
  } catch {
    return null;
  }
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "active-first",
    title: "Live threads first",
    description: "Running and recently processed threads above collapsible projects.",
    component: ActiveThreadsSidebar,
  });
});
