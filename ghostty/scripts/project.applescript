-- project.applescript
-- Usage: osascript project.applescript <project-path> [layout]
-- Layouts: fullstack, simple, monitor
--
-- Examples:
--   osascript project.applescript ~/work/projects/Magpi fullstack
--   osascript project.applescript ~/work/projects/malleable simple

on run argv
    if (count of argv) < 1 then
        log "Usage: osascript project.applescript <project-path> [layout]"
        log "Layouts: fullstack, simple, monitor"
        return
    end if

    set projectPath to item 1 of argv
    if (count of argv) > 1 then
        set layout to item 2 of argv
    else
        set layout to "simple"
    end if

    tell application id "com.mitchellh.ghostty"
        set frontWin to item 1 of windows
        set newTab to new tab in frontWin
        delay 0.5
        set mainTerm to item 1 of terminals of newTab

        input text ("cd " & projectPath) to mainTerm
        send key "enter" to mainTerm

        if layout is "fullstack" then
            -- ┌──────────┬──────────┐
            -- │          │ server   │
            -- │    pi    ├──────────┤
            -- │          │ shell    │
            -- └──────────┴──────────┘

            set serverTerm to split mainTerm direction right
            input text ("cd " & projectPath) to serverTerm
            send key "enter" to serverTerm

            set shellTerm to split serverTerm direction down
            input text ("cd " & projectPath) to shellTerm
            send key "enter" to shellTerm

            input text "pi --resume" to mainTerm
            send key "enter" to mainTerm

        else if layout is "monitor" then
            -- ┌──────────┬──────────┐
            -- │  main    │  logs    │
            -- ├──────────┼──────────┤
            -- │  procs   │  stats   │
            -- └──────────┴──────────┘

            set logsTerm to split mainTerm direction right
            input text ("cd " & projectPath) to logsTerm
            send key "enter" to logsTerm

            set procsTerm to split mainTerm direction down
            input text ("cd " & projectPath) to procsTerm
            send key "enter" to procsTerm

            set statsTerm to split logsTerm direction down
            input text ("cd " & projectPath) to statsTerm
            send key "enter" to statsTerm

        else -- simple
            -- ┌──────────┬──────────┐
            -- │    pi    │  shell   │
            -- └──────────┴──────────┘

            set shellTerm to split mainTerm direction right
            input text ("cd " & projectPath) to shellTerm
            send key "enter" to shellTerm

            input text "pi --resume" to mainTerm
            send key "enter" to mainTerm
        end if

        select tab newTab
    end tell
end run
