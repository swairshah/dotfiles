let g:slime_target = "tmux"
let g:slime_paste_file = "$HOME/.slime_paste"

"------------------------------------------------------------------------------
" slime configuration 
"------------------------------------------------------------------------------
let g:slime_python_ipython = 1
let g:slime_target = 'tmux'
let g:slime_default_config = {"socket_name": "default", "target_pane": ":.1"}
let g:slime_dont_ask_default = 1

" Run cell for vim-slime
function! SendCell(pattern)
    let start_line = search(a:pattern, 'bnW')

    if start_line
        let start_line = start_line + 1
    else
        let start_line = 1
    endif

    let stop_line = search(a:pattern, 'nW')
    if stop_line
        let stop_line = stop_line - 1
    else
        let stop_line = line('$')
    endif

    call slime#send_range(start_line, stop_line)
endfunction

" Custom vim-slime mappings
let g:slime_no_mappings = 1
xmap <c-c><c-c> <Plug>SlimeRegionSend
nmap <c-c><c-c> :<c-u>call SendCell('^#.\+%%')<cr>

