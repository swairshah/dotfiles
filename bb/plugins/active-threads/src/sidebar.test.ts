import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSidebarThreads,
  followSelectedProject,
  formatActivityAge,
  getThreadLiveness,
  isActiveThread,
  matchesThreadSearch,
  orderedNavigationThreadIds,
  threadDepth,
  threadDisplayTitle,
} from "./sidebar.ts";
import {
  describeRecentWindow,
  getRecentWindowMs,
  normalizeRecentWindow,
} from "./settings.ts";

const emptyActivity = {
  workflows: 0,
  backgroundAgents: 0,
  backgroundCommands: 0,
  planMode: 0,
  goals: 0,
};

test("recognizes runtime and background work as active", () => {
  assert.equal(
    isActiveThread({
      activity: emptyActivity,
      indicator: "runtime",
      isArchived: false,
    }),
    true,
  );
  assert.equal(
    isActiveThread({
      activity: { ...emptyActivity, backgroundAgents: 1 },
      indicator: "none",
      isArchived: false,
    }),
    true,
  );
});

test("does not treat waiting, unread, or archived threads as active", () => {
  assert.equal(
    isActiveThread({
      activity: emptyActivity,
      indicator: "waiting-for-input",
      isArchived: false,
    }),
    false,
  );
  assert.equal(
    isActiveThread({
      activity: { ...emptyActivity, workflows: 1 },
      indicator: "workflow",
      isArchived: true,
    }),
    false,
  );
});

test("keeps running threads and unexpired processing leases live", () => {
  const now = 3_600_000;
  const base = {
    activity: emptyActivity,
    indicator: "none" as const,
    isArchived: false,
  };

  assert.equal(
    getThreadLiveness({ ...base, indicator: "runtime" }, now, null),
    "running",
  );
  assert.equal(
    getThreadLiveness(base, now, now - 29 * 60_000),
    "recent",
  );
  assert.equal(
    getThreadLiveness(base, now, now - 31 * 60_000),
    "none",
  );
  assert.equal(
    getThreadLiveness(base, now, now - 90 * 60_000, 2 * 60 * 60_000),
    "recent",
  );
  assert.equal(getThreadLiveness(base, now, now, 0), "none");
});

test("maps recent-window settings and safely falls back to 30 minutes", () => {
  assert.equal(getRecentWindowMs("Running only"), 0);
  assert.equal(getRecentWindowMs("2 hours"), 2 * 60 * 60_000);
  assert.equal(getRecentWindowMs("not-a-window"), 30 * 60_000);
  assert.equal(normalizeRecentWindow(undefined), "30 minutes");
  assert.equal(describeRecentWindow("Running only"), "Running threads only");
  assert.equal(
    describeRecentWindow("1 hour"),
    "Running now or processed a message in the last 1 hour",
  );
});

test("opening or reading without processing never creates liveness", () => {
  const now = 3_600_000;
  const openedThread = {
    activity: emptyActivity,
    indicator: "none" as const,
    isArchived: false,
    latestAttentionAt: now,
    updatedAt: now,
    lastReadAt: now,
  };
  assert.equal(getThreadLiveness(openedThread, now, null), "none");
  assert.equal(
    getThreadLiveness({ ...openedThread, isArchived: true }, now, now),
    "none",
  );
});

test("formats compact liveness ages", () => {
  const now = 7_200_000;
  assert.equal(formatActivityAge(now - 20_000, now), "just now");
  assert.equal(formatActivityAge(now - 60_000, now), "1m ago");
  assert.equal(formatActivityAge(now - 17 * 60_000, now), "17m ago");
  assert.equal(formatActivityAge(now - 2 * 60 * 60_000, now), "2h ago");
});

test("uses the title fallback and searches thread context", () => {
  const thread = {
    title: null,
    titleFallback: "Fix the checkout flow",
    environment: {
      id: "env_1",
      name: "review",
      branchName: "fix/checkout",
      workspaceDisplayKind: "managed-worktree" as const,
    },
    host: { id: "host_1", name: "Mac Studio" },
  };

  assert.equal(threadDisplayTitle(thread), "Fix the checkout flow");
  assert.equal(matchesThreadSearch(thread, "Storefront", "checkout"), true);
  assert.equal(matchesThreadSearch(thread, "Storefront", "storefront"), true);
  assert.equal(matchesThreadSearch(thread, "Storefront", "mac studio"), true);
  assert.equal(matchesThreadSearch(thread, "Storefront", "payments"), false);
});

test("following a selected thread collapses the project left and opens the project entered", () => {
  const next = followSelectedProject(
    new Set(["project-b", "project-c"]),
    "project-a",
    "project-b",
  );
  assert.deepEqual([...next].sort(), ["project-a", "project-c"]);
});

test("following another thread in the same project keeps that project open", () => {
  const next = followSelectedProject(new Set(["project-b"]), "project-a", "project-a");
  assert.deepEqual([...next], ["project-b"]);
});

test("selecting a live thread keeps its source project collapsed", () => {
  const next = followSelectedProject(
    new Set(["remarkable", "verif"]),
    "remarkable",
    "personal",
    true,
  );
  assert.deepEqual([...next].sort(), ["personal", "remarkable", "verif"]);
});

test("navigation visits live threads first, then each remaining project thread once", () => {
  const order = orderedNavigationThreadIds(
    ["live-personal", "live-verif"],
    [
      "remarkable-1",
      "live-verif",
      "verif-2",
      "replay-1",
      "live-personal",
      "personal-2",
    ],
  );
  assert.deepEqual(order, [
    "live-personal",
    "live-verif",
    "remarkable-1",
    "verif-2",
    "replay-1",
    "personal-2",
  ]);
  assert.equal(new Set(order).size, order.length);
});

test("sorts pinned threads first, then by latest attention", () => {
  const oldPinned = {
    isPinned: true,
    latestAttentionAt: 1,
    updatedAt: 1,
    createdAt: 1,
  };
  const recent = {
    isPinned: false,
    latestAttentionAt: 10,
    updatedAt: 10,
    createdAt: 10,
  };
  assert.ok(compareSidebarThreads(oldPinned, recent) < 0);
  assert.ok(compareSidebarThreads(recent, { ...recent, latestAttentionAt: 5 }) < 0);
});

test("calculates visible parent depth and stops at three levels", () => {
  const threads = [
    { id: "root", parentThreadId: null },
    { id: "child", parentThreadId: "root" },
    { id: "grandchild", parentThreadId: "child" },
    { id: "great-grandchild", parentThreadId: "grandchild" },
    { id: "deep", parentThreadId: "great-grandchild" },
  ];
  assert.equal(threadDepth(threads[0]!, threads), 0);
  assert.equal(threadDepth(threads[2]!, threads), 2);
  assert.equal(threadDepth(threads[4]!, threads), 3);
});
