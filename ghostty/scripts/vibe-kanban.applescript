-- vibe-kanban.applescript
-- One-click workspace for vibe-kanban (Rust + frontend full-stack)
--
-- Usage: osascript vibe-kanban.applescript

set projectPath to "~/misc/vibe-kanban"

tell application id "com.mitchellh.ghostty"
    -- Create a fresh window
    set mainWin to new window
    set editorTerm to item 1 of terminals of mainWin

    -- ┌──────────────┬──────────────┐
    -- │              │  backend     │
    -- │   editor     ├──────────────┤
    -- │   (nvim)     │  frontend    │
    -- │              ├──────────────┤
    -- │              │  shell       │
    -- └──────────────┴──────────────┘

    -- Navigate editor pane
    input text ("cd " & projectPath) to editorTerm
    send key "enter" to editorTerm

    -- Create right column: backend server
    set backendTerm to split editorTerm direction right
    input text ("cd " & projectPath) to backendTerm
    send key "enter" to backendTerm

    -- Split backend down: frontend dev server
    set frontendTerm to split backendTerm direction down
    input text ("cd " & projectPath) to frontendTerm
    send key "enter" to frontendTerm

    -- Split frontend down: general shell
    set shellTerm to split frontendTerm direction down
    input text ("cd " & projectPath) to shellTerm
    send key "enter" to shellTerm

    -- Start everything up
    -- Small delay to let cd finish
    delay 0.3

    -- Editor
    input text "nvim ." to editorTerm
    send key "enter" to editorTerm

    -- Backend: cargo watch
    input text "npm run backend:dev" to backendTerm
    send key "enter" to backendTerm

    -- Frontend: vite/svelte dev server
    input text "npm run frontend:dev" to frontendTerm
    send key "enter" to frontendTerm

    -- Shell ready for git, tests, etc.
    input text "git status" to shellTerm
    send key "enter" to shellTerm

    activate window mainWin
end tell
