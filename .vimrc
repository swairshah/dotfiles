"""""""""""""""""""""""""""""""""""""""""""""
" Filename : vimrc
" Maintainer : Swair Shah <swairshah@gmail.com>
"
" Lot of stuff borrowed from 
" kde-devel-vimrc (can be found on techbase.kde.org)
" http://amix.dk/vim/vimrc.html
"
"""""""""""""""""""""""""""""""""""""""""""""



set nocompatible "get rid of the Vi compatibility mode


colorscheme wombat256

" other view settings
set t_Co=256

"insert tab char in whitespace-only lines, complete otherwise
inoremap <Tab> <C-R>=SmartTab()<CR>

" indent related
set et
set backspace=indent,eol,start
set expandtab
set sw=4
set tabstop=4
set softtabstop=4
set smarttab

set number
set autoindent
set smartindent
set showcmd
set showmatch
set ruler
set tw=0


"call pathogen#helptags()
"call pathogen#runtime_append_all_bundles()

"source ~/.vim/bundle/a.vim

syntax enable filetype on
filetype indent on
filetype plugin on

nnoremap / /\v
vnoremap / /\v
set hlsearch
nnoremap <leader><space> :nohlsearch<CR>
set incsearch
set ignorecase
set smartcase
set gdefault
set magic


function! SmartTab()
    let col = col('.') - 1
    if !col || getline('.')[col-1] !~ '\k'
        return "\<Tab>"
    else
        return "\<C-P>"
    endif
endfunction

function! SmartParens( char, ... )
    if ! ( &syntax =~ '^\(c\|cpp\|java\)$' )
        return a:char
    endif
    let s = strpart( getline( '.' ), 0, col( '.' ) - 1 )
    if s =~ '//'
        return a:char
    endif
    let s = substitute( s, '/\*\([^*]\|\*\@!/\)*\*/', '', 'g' )
    let s = substitute( s, "'[^']*'", '', 'g' )
    let s = substitute( s, '"\(\\"\|[^"]\)*"', '', 'g' )
    if s =~ "\\([\"']\\|/\\*\\)"
        return a:char
    endif
    if a:0 > 0
        if strpart( getline( '.' ), col( '.' ) - 3, 2 ) == a:1 . ' '
            return "\<BS>" . a:char
        endif
        if strpart( getline( '.' ), col( '.' ) - 2, 1 ) == ' '
            return a:char
        endif
        return ' ' . a:char
    endif
    if !exists("g:DisableSpaceBeforeParen")
        if a:char == '('
            if strpart( getline( '.' ), col( '.' ) - 3, 2 ) == 'if' ||
              \strpart( getline( '.' ), col( '.' ) - 4, 3 ) == 'for' ||
              \strpart( getline( '.' ), col( '.' ) - 6, 5 ) == 'while' ||
              \strpart( getline( '.' ), col( '.' ) - 7, 6 ) == 'switch'
                return ' ( '
            endif
        endif
    endif
    return a:char . ' '
endfunction

function! SmartParensOn()
    inoremap ( <C-R>=SmartParens( '(' )<CR>
    inoremap [ <C-R>=SmartParens( '[' )<CR>
    inoremap ] <C-R>=SmartParens( ']', '[' )<CR>
    inoremap ) <C-R>=SmartParens( ')', '(' )<CR>
endfunction

if !exists("DisableSmartParens")
" Insert a space after ( or [ and before ] or ) unless preceded by a matching
" paren/bracket or space or inside a string or comment. Comments are only
" recognized as such if they start on the current line :-(
inoremap ( <C-R>=SmartParens( '(' )<CR>
inoremap [ <C-R>=SmartParens( '[' )<CR>
inoremap ] <C-R>=SmartParens( ']', '[' )<CR>
inoremap ) <C-R>=SmartParens( ')', '(' )<CR>
endif
