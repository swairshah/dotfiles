#!/usr/bin/env bash

# Get current pane info
PANE_ID=$(tmux display-message -p '#{pane_id}')
WINDOW_ID=$(tmux display-message -p '#{window_id}')
SESSION_NAME=$(tmux display-message -p '#{session_name}')

# Create temporary file for output
OUTPUT_FILE="/tmp/tmux-pane-info-$(date +%s).txt"

{
    echo "=== TMUX PANE INFORMATION ==="
    echo "Date: $(date)"
    echo ""
    
    echo "=== BASIC INFO ==="
    echo "Session: $SESSION_NAME"
    echo "Window: $(tmux display-message -p '#{window_index}:#{window_name}')"
    echo "Pane: $PANE_ID (#{pane_index})"
    echo ""
    
    echo "=== PANE DETAILS ==="
    echo "Size: $(tmux display-message -p '#{pane_width}x#{pane_height}')"
    echo "Current Path: $(tmux display-message -p '#{pane_current_path}')"
    echo "Current Command: $(tmux display-message -p '#{pane_current_command}')"
    echo "PID: $(tmux display-message -p '#{pane_pid}')"
    echo "TTY: $(tmux display-message -p '#{pane_tty}')"
    echo ""
    
    echo "=== PROCESS TREE ==="
    if command -v pstree >/dev/null 2>&1; then
        pstree -p $(tmux display-message -p '#{pane_pid}')
    else
        ps -ef | grep -E "PID|$(tmux display-message -p '#{pane_pid}')" | grep -v grep
    fi
    echo ""
    
    echo "=== ENVIRONMENT ==="
    echo "Shell: $SHELL"
    echo "User: $(whoami)"
    echo "Hostname: $(hostname)"
    echo ""
    
    # Get process details including open files
    PID=$(tmux display-message -p '#{pane_pid}')
    echo "=== PROCESS DETAILS (PID: $PID) ==="
    
    # For macOS, use lsof to get open files
    if command -v lsof >/dev/null 2>&1; then
        echo "Open Files:"
        lsof -p $PID 2>/dev/null | grep -E "(REG|DIR)" | grep -v -E "(\.dylib|\.so|/dev/|/System/|/Library/|/usr/lib/)" | head -20
    fi
    echo ""
    
    # Get command line arguments
    echo "=== COMMAND LINE ==="
    ps -p $PID -o command= 2>/dev/null || echo "Unable to get command line"
    echo ""
    
    # Capture pane content
    echo "=== PANE CONTENT (visible buffer) ==="
    tmux capture-pane -t $PANE_ID -p
    echo ""
    
    echo "=== PANE HISTORY (last 100 lines) ==="
    tmux capture-pane -t $PANE_ID -p -S -100
    
} > "$OUTPUT_FILE"

# Display the info (you can change this to your preferred viewer)
if command -v less >/dev/null 2>&1; then
    less "$OUTPUT_FILE"
elif command -v more >/dev/null 2>&1; then
    more "$OUTPUT_FILE"
else
    cat "$OUTPUT_FILE"
fi

# Optionally copy to clipboard
if command -v pbcopy >/dev/null 2>&1; then
    cat "$OUTPUT_FILE" | pbcopy
    echo "Info copied to clipboard!"
elif command -v xclip >/dev/null 2>&1; then
    cat "$OUTPUT_FILE" | xclip -selection clipboard
    echo "Info copied to clipboard!"
fi