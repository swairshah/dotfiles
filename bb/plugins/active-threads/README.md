# Active Threads for bb

A bb sidebar plugin that keeps live conversations in one **Live threads** block above the project list.

## UX

- A thread becomes live only when real processing starts after a message; clicking or reading never promotes it.
- It stays live while work is running and for 30 minutes after processing finishes.
- The recent-thread window is configurable from **Extensions → Plugins → Active Threads**, from running-only through 24 hours.
- Live rows show whether they are running or how long ago processing ended.
- Live rows show their project and branch or machine for context.
- Previous/next navigation follows one continuous order: Live threads first, then Remarkable, Verif, replay, and the remaining projects in sidebar order.
- A selected live row is the only highlighted copy, keeps its green current indicator, and leaves its source project collapsed.
- Project copies preserve context without duplicating live threads in the keyboard sequence.
- Once navigation enters projects, shortcuts collapse the project left, expand the project entered, and scroll the selected row into view.
- Projects remain collapsible, searchable, and able to create new threads.
- Rows preserve bb keyboard shortcuts, Cmd/Ctrl-click splits, drag-to-split, and the standard thread context actions.

## Install

```sh
npm install
bb plugin install . --yes
```

Then choose **Live threads first** in **Settings → Appearance → Sidebar**. The sidebar choice is stored per bb client.

## Develop

```sh
npm test
npm run typecheck
npm run build
bb plugin dev
```
