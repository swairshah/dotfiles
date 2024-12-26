"""""""""""""""""""""""""""""""""""""""""""""
" Filename : vimrc
" Maintainer : Swair Shah <swairshah@gmail.com>
"
" Lot of stuff borrowed from 
" kde-devel-vimrc (can be found on techbase.kde.org)
" http://amix.dk/vim/vimrc.html
"
"""""""""""""""""""""""""""""""""""""""""""""

" copy to clipboard
"set clipboard=unnamedplus
"
"

call plug#begin('~/.vim/plugged')

Plug 'https://github.com/kballard/vim-swift.git'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'vim-syntastic/syntastic'

Plug 'Olical/vim-scheme', { 'for': 'scheme', 'on': 'SchemeConnect' }
"Plug 'guns/vim-sexp'
Plug 'tpope/vim-sexp-mappings-for-regular-people'
Plug 'metakirby5/codi.vim'
Plug 'AlexvZyl/nordic.nvim', { 'branch': 'main' }
Plug 'gilgigilgil/anderson.vim'

Plug 'JuliaEditorSupport/julia-vim'
Plug 'jpalardy/vim-slime', { 'for': ['python', 'julia', 'scheme']}
Plug 'mroavi/vim-julia-cell', { 'for': 'julia' }

call plug#end()

let g:slime_target = 'tmux'
let g:slime_default_config = {"socket_name": "default", "target_pane": ":.1"}
let g:slime_dont_ask_default = 1
let g:slime_paste_file = "$HOME/.slime_paste"

let g:scheme_executable = "mechanics.sh"


" change mapleader from \ to ,
let mapleader = ","

" tab shortcuts
map <leader>t :tabnew
noremap <leader>1 1gt
noremap <leader>2 2gt
noremap <leader>3 3gt
noremap <leader>4 4gt
noremap <leader>5 5gt


set mouse=a

function! TwoSpace()
    setlocal ts=2
    setlocal sw=2
endfunction
au FileType ruby call TwoSpace()
au FileType coffee call TwoSpace()
au FileType vim call TwoSpace()
au BufNewFile,BufRead *.erb call TwoSpace()

"tab switching
nnoremap J gT
nnoremap K gt
            
"latex
filetype plugin indent on
set grepprg=grep\ -nH\ $*
let g:tex_flavor = "latex"


"nerdtree
"let NERDTreeWinSize = 18
"map <C-n> :NERDTreeToggle<CR>
"autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTreeType") && b:NERDTreeType == "primary") | q | endif
"
"eclim
"let g:acp_behaviorJavaEclimLength = 3
"function MeetsForJavaEclim(context)
"  return g:acp_behaviorJavaEclimLength >= 0 &&
"        \ a:context =~ '\k\.\k\{' . g:acp_behaviorJavaEclimLength . ',}$'
"endfunction
"let g:acp_behavior = {
"    \ 'java': [{
"      \ 'command': "\<c-x>\<c-u>",
"      \ 'completefunc' : 'eclim#java#complete#CodeComplete',
"      \ 'meets'        : 'MeetsForJavaEclim',
"    \ }]
"  \ }

set nocompatible "get rid of the Vi compatibility mode




nnoremap <leader>ft Vatzf


" : -> ;
nnoremap ; :

"quickly edit/reload vimrc file
nmap <silent> <leader>ev :e $MYVIMRC<CR>
nmap <silent> <leader>sv :so $MYVIMRC<CR>


"Pathogen 
"call pathogen#helptags()
"call pathogen#infect()


"filetype plugins
syntax enable filetype on
filetype indent on
filetype plugin on

autocmd filetype python set expandtab

"paste mode toggle
set pastetoggle=<F2>


"(temp) disable arrow keys use hjkl"
"map <up> <nop>
"map <down> <nop>
"map <left> <nop>
"map <right> <nop>

" other view settings
" set t_Co=256
" set background=dark
highlight Normal ctermbg=NONE
highlight nonText ctermbg=NONE
"colorscheme lucius
colorscheme anderson

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
set cul
set tw=0



"source ~/.vim/bundle/a.vim

"search related
nnoremap / /\v
vnoremap / /\v
set hlsearch
nnoremap <leader><space> :nohlsearch<CR>
set incsearch
set ignorecase
set smartcase
set gdefault
set magic

"handle long lines
set wrap
set textwidth=79
set formatoptions=qrn1
"set colorcolumn=85


function! SmartTab()
    let col = col('.') - 1
    if !col || getline('.')[col-1] !~ '\k'
        return "\<Tab>"
    else
        return "\<C-P>"
    endif
endfunction

function! SmartParens( char, ... )
    if ! ( &syntax =~ '^\(.c\|.cpp\|.java\)$' )
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

"function! SmartParensOn()
"    inoremap ( <C-R>=SmartParens( '(' )<CR>
"    inoremap [ <C-R>=SmartParens( '[' )<CR>
"    inoremap ] <C-R>=SmartParens( ']', '[' )<CR>
"    inoremap ) <C-R>=SmartParens( ')', '(' )<CR>
"endfunction

if !exists("DisableSmartParens")
" Insert a space after ( or [ and before ] or ) unless preceded by a matching
" paren/bracket or space or inside a string or comment. Comments are only
" recognized as such if they start on the current line :-(
inoremap ( <C-R>=SmartParens( '(' )<CR>
inoremap [ <C-R>=SmartParens( '[' )<CR>
inoremap ] <C-R>=SmartParens( ']', '[' )<CR>
inoremap ) <C-R>=SmartParens( ')', '(' )<CR>
endif

" Disable syntastic by defauly, check when Ctrl-w E
let g:syntastic_mode_map = { 'mode': 'passive', 'active_filetypes': [],'passive_filetypes': [] }
nnoremap <C-w>E :SyntasticCheck<CR> :SyntasticToggleMode<CR>

au Filetype python source ~/.vim/scripts/pyjlslime.vim
au Filetype julia source ~/.vim/scripts/pyjlslime.vim

autocmd BufRead,BufNewFile *.jl :set filetype=julia

