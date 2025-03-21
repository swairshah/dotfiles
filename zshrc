# Last updated 2011-03-09
#
# Released into the public domain.
#
#export PATH=/Library/Developer/Toolchains/swift-tensorflow-RELEASE-0.6.xctoolchain/usr/bin:${PATH}

npm set prefix ~/.npm
PATH="$HOME/.npm/bin:$PATH"
PATH="./node_modules/.bin:$PATH"

export CPATH=`xcrun --show-sdk-path`/usr/include#
#
#export PATH=/Library/Developer/Toolchains/swift-latest/usr/bin:${PATH}


alias julia="/Applications/Julia-1.5.app/Contents/Resources/julia/bin/julia"

# conda
export PATH=$PATH:$HOME/miniconda3/bin

# golang
export PATH=$PATH:/usr/local/go/bin

exit_zsh() { exit }
zle -N exit_zsh
bindkey '^D' exit_zsh

#fix '^R' bck-search when inside of tmux
bindkey '^R' history-incremental-search-backward

export SHELL=/bin/zsh

#write! 
alias 'vimw=gvim -u /home/swair/work/write/vimrc' 

#key-bindings
bindkey "^[[5~" up-line-or-history
bindkey "^[[6~" down-line-or-history
bindkey '^[[A' up-line-or-search
bindkey '^[[B' down-line-or-search
bindkey "^[[H" beginning-of-line
bindkey "^[[1~" beginning-of-line
bindkey "^[[F"  end-of-line
bindkey "^[[4~" end-of-line
#bindkey '^[[A' up-line-or-search
#bindkey '^[[B' down-line-or-search


#jump clone with a function
function a {
alias $1=cd\ $PWD
}

#xterm
alias 'xterm=xterm -rightbar -bg black -fg grey -geometry 1024x40'


#git
alias 'gp= git push'
alias 'gl= git pull'
alias 'glb= git pull --rebase'
alias 'glg= git log'
alias 'gc= git commit -a'
alias 'gcm= git commit -m'
alias 'gs= git status'
alias 'ga= git add'

#vim
#export EXPORT=vim

#nodejs
export NODE_PATH=/usr/lib/node_modules


#python
alias 'py=python2'

#rails
alias 'netcat=nc'


function say {
	echo $@ | festival --tts
}

alias 'you=youtube-dl -t'
alias 'zsh=zsh -l'
alias 'du=du -h'
alias 'df=df -h'

#nepomuk stuff
#alias 'nepomukcmd=sopranocmd --socket `kde4-config --path socket`nepomuk-socket --model main --nrl'
alias 'nepomukcmd=sopranocmd --dbus org.kde.nepomuk.services.nepomukstorage  --model main'
# Skip all this for non-interactive shells
[[ -z "$PS1" ]] && return

# Set prompt (white and purple, nothing too fancy)
# PS1=$'%{\e[0;37m%}%B%*%b %{\e[0;40m%}%m:%{\e[0;40m%}%~ %(!.#.>) %{\e[00m%}'
#PS1=$'% %{\e[1;31m%}%m:%{\e[0;36m%}%~ %(!.#.>) %{\e[00m%}'
PS1=$'% %{\e[1;31m%}macbook-work%{\e[0;36m%}%~ %(!.#.>) %{\e[00m%}'

# Set less options
if [[ -x $(which less) ]]
then
    export PAGER="less"
    export LESS="--ignore-case --LONG-PROMPT --QUIET --chop-long-lines -Sm --RAW-CONTROL-CHARS --quit-if-one-screen --no-init"
    if [[ -x $(which lesspipe.sh) ]]
    then
	LESSOPEN="| lesspipe.sh %s"
	export LESSOPEN
    fi
fi

# Set default editor
#if [[ -x $(which emacs) ]]
#then
#    export EDITOR="emacs"
#    export USE_EDITOR=$EDITOR
#    export VISUAL=$EDITOR
#fi
export EDITOR="vim"

# Zsh settings for history
export HISTIGNORE="&:ls:[bf]g:exit:reset:clear:cd:cd ..:cd.."
export HISTSIZE=25000
export HISTFILE=~/.zsh_history
export SAVEHIST=10000
setopt INC_APPEND_HISTORY
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_REDUCE_BLANKS
setopt HIST_VERIFY

# Say how long a command took, if it took more than 30 seconds
export REPORTTIME=30

# Zsh spelling correction options
#setopt CORRECT
#setopt DVORAK

# Prompts for confirmation after 'rm *' etc
# Helps avoid mistakes like 'rm * o' when 'rm *.o' was intended
setopt RM_STAR_WAIT

# Background processes aren't killed on exit of shell
setopt AUTO_CONTINUE

# Don’t write over existing files with >, use >! instead
setopt NOCLOBBER

# Don’t nice background processes
setopt NO_BG_NICE

# Watch other user login/out
watch=notme
export LOGCHECK=60

# Enable color support of ls
if [[ "$TERM" != "dumb" ]]; then
    if [[ -x `which dircolors` ]]; then
	eval `dircolors -b`
	alias 'ls=ls --color=auto'
    fi
fi

# Short command aliases

alias 'ls=ls -G'
alias 'l=ls'

alias 'la=ls -A'
alias 'll=ls -l'
alias 'lq=ls -Q'
alias 'lr=ls -R'
alias 'lrs=ls -lrS'
alias 'lrt=ls -lrt'
alias 'lrta=ls -lrtA'
#alias 'j=jobs -l'
alias 'kw=kwrite'
alias 'tf=tail -f'
alias 'grep=grep --colour'
alias 'e=emacs -nw --quick'
alias 'vnice=nice -n 20 ionice -c 3'
alias 'get_iplayer=get_iplayer --nopurge'
alias "tree=tree -A -I 'CVS|*~'"

# Useful KDE integration (see later for definition of z)
#alias 'k=z kate -u' # -u is reuse existing session if possible
#alias 'q=z kfmclient openURL' # Opens (or executes a .desktop) arg1 in Konqueror

# Play safe!
alias 'rm=rm -i'
alias 'mv=mv -i'
#alias 'cp=cp -i'

# For convenience
alias 'mkdir=mkdir -p'
alias 'dus=du -ms * | sort -n'

# Typing errors...
alias 'cd..=cd ..'

# Running 'b.ps' runs 'q b.ps'
alias -s ps=q
alias -s html=q

# PDF viewer (just type 'file.pdf')
if [[ -x `which kpdf` ]]; then
    alias -s 'pdf=kfmclient exec'
else
    if [[ -x `which gpdf` ]]; then
	alias -s 'pdf=gpdf'
    else
	if [[ -x `which evince` ]]; then
	    alias -s 'pdf=evince'
	fi
    fi
fi

# Global aliases (expand whatever their position)
#  e.g. find . E L
alias -g L='| less'
alias -g H='| head'
alias -g S='| sort'
alias -g T='| tail'
alias -g N='> /dev/null'
alias -g E='2> /dev/null'

# SSH aliases
#alias 'sshb=ssh matt@blissett.me.uk'

# SSH to shell[1234].doc.ic.ac.uk at random
#sshdoc() {
#    ssh mrb04@shell$(($RANDOM % 4 + 1)).doc.ic.ac.uk $*
#}

# Automatically background processes (no output to terminal etc)
alias 'z=echo $RANDOM > /dev/null; zz'
zz () {
    echo $*
    $* &> "/tmp/z-$1-$RANDOM" &!
}

# Aliases to use this
# Use e.g. 'command gv' to avoid
#for i in acroread akregator amarok chromium-browser easytag gaim gimp gpdf gv k3b kate kmail konqueror kontact kopete kpdf kwrite okular oobase oocalc ooffice oowriter opera pan thunderbird; do
#    alias "$i=z $i"
#done

# Quick find
f() {
    echo "find . -iname \"*$1*\""
    find . -iname "*$1*"
}

# Remap Dvorak-Qwerty quickly
alias 'aoeu=setxkbmap gb' # (British keyboard layout)
alias 'asdf=setxkbmap gb dvorak 2> /dev/null || setxkbmap dvorak gb 2> /dev/null || setxkbmap dvorak'

# Update config files (master copies stored on server)
alias rsync-config='rsync -av --delete blissett.me.uk:Config/ ~/.matt-config/'

# Clear konsole history
#alias 'zaph=dcop $KONSOLE_DCOP_SESSION clearHistory' For KDE3
#alias 'zaph=qdbus org.kde.konsole $KONSOLE_DBUS_SESSION' ... KDE4 can't do this yet?

# When directory is changed set xterm title to host:dir
chpwd() {
    [[ -t 1 ]] || return
    case $TERM in
	sun-cmd) print -Pn "\e]l%~\e\\";;
        *xterm*|rxvt|(dt|k|E)term) print -Pn "\e]2;%m:%~\a";;
    esac
}

# For changing the umask automatically
chpwd () {
    case $PWD in
        $HOME/[Dd]ocuments*)
            if [[ $(umask) -ne 077 ]]; then
                umask 0077
                echo -e "\033[01;32mumask: private \033[m"
            fi;;
        */[Ww]eb*)
            if [[ $(umask) -ne 072 ]]; then
                umask 0072
                echo -e "\033[01;33mumask: other readable \033[m"
            fi;;
        /vol/nothing)
            if [[ $(umask) -ne 002 ]]; then
                umask 0002
                echo -e "\033[01;35mumask: group writable \033[m"
            fi;;
        *)
            if [[ $(umask) -ne 022 ]]; then
                umask 0022
                echo -e "\033[01;31mumask: world readable \033[m"
            fi;;
    esac
}
cd . &> /dev/null

# For quickly plotting data with gnuplot.  Arguments are files for 'plot "<file>" with lines'.
plot () {
    echo -n '(echo set term png; '
    echo -n 'echo -n plot \"'$1'\" with lines; '
    for i in $*[2,$#@]; echo -n 'echo -n , \"'$i'\" with lines; '
    echo 'echo ) | gnuplot | display png:-'

    (
	echo "set term png"
	echo -n plot \"$1\" with lines
	for i in $*[2,$#@]; echo -n "," \"$i\" "with lines"
	) | gnuplot | display png:-
}
# Persistant gnuplot (can be resized etc)
plotp () {
    echo -n '(echo -n plot \"'$1'\" with lines; '
    for i in $*[2,$#@]; echo -n 'echo -n , \"'$i'\" with lines; '
    echo 'echo ) | gnuplot -persist'

    (
	echo -n plot \"$1\" with lines
	for i in $*[2,$#@]; echo -n "," \"$i\" "with lines"
	echo
	) | gnuplot -persist
}

# CD into random directory in PWD
cdrand () {
	all=( *(/) )
	rand=$(( 1 + $RANDOM % $#all ))
	cd $all[$rand]
}

# Rotate a jpeg, losslessly
jrotate-r () {
    for i in $*; do
	exiftran -9 -b -i $i
    done
}

# MySQL prompt
export MYSQL_PS1="\R:\m:\s \h> "

# Print some stuff
date
if [[ -x `which fortune` ]]; then
    echo
    fortune -a 2> /dev/null
fi

# The following lines were added by compinstall
zstyle ':completion:*' completer _expand _complete _match
zstyle ':completion:*' completions 0
zstyle ':completion:*' format 'Completing %d'
zstyle ':completion:*' glob 0
zstyle ':completion:*' group-name ''
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' matcher-list '+m:{a-z}={A-Z} r:|[._-]=** r:|=**' '' '' '+m:{a-z}={A-Z} r:|[._-]=** r:|=**'
zstyle ':completion:*' max-errors 1 numeric
zstyle ':completion:*' substitute 0
zstyle :compinstall filename "$HOME/.zshrc"

autoload -Uz compinit
compinit
# End of lines added by compinstall

zstyle -d users
#zstyle ':completion:*' users mrb04 matt
zstyle ':completion:*:*:*:users' ignored-patterns \
    adm apache bin daemon games gdm halt ident junkbust lp mail mailnull \
    named news nfsnobody nobody nscd ntp operator pcap postgres radvd \
    rpc rpcuser rpm shutdown squid sshd sync uucp vcsa xfs backup  bind  \
    dictd  gnats  identd  irc  man  messagebus  postfix  proxy  sys  www-data \
    avahi Debian-exim hplip list cupsys haldaemon ntpd proftpd statd

#zstyle ':completion:*' hosts $( cat $HOME/.hosts* )

zstyle ':completion:*:cd:*' ignored-patterns '(*/)#lost+found' '(*/)#CVS'
zstyle ':completion:*:(all-|)files' ignored-patterns '(|*/)CVS'

zstyle ':completion:*:(rm|kill|diff):*' ignore-line yes
zstyle ':completion:*:*:kill:*' menu yes select
zstyle ':completion:*:kill:*' force-list always
zstyle ':completion:*:kill:*' command 'ps -u $USER -o pid,%cpu,tty,cputime,cmd'
zstyle ':completion:*:*:kill:*:processes' list-colors '=(#b) #([0-9]#)*=0=01;31'

# Filename suffixes to ignore during completion (except after rm command)
# This doesn't seem to work
#zstyle ':completion:*:*:(^rm):*:*files' ignored-patterns '*?.o' '*?.c~' '*?.old' '*?.pro' '*~'
#zstyle ':completion:*:(all-|)files' file-patterns '(*~|\\#*\\#):backup-files' 'core(|.*):core\ files' '*:all-files'

zstyle ':completion:*:*:rmdir:*' file-sort time

zstyle ':completion:*' local matt.blissett.me.uk /web/matt.blissett.me.uk

# CD to never select parent directory
zstyle ':completion:*:cd:*' ignore-parents parent pwd

# Quick ../../..
rationalise-dot() {
    if [[ $LBUFFER = *.. ]]; then
	LBUFFER+=/..
    else
	LBUFFER+=.
    fi
}
zle -N rationalise-dot
bindkey . rationalise-dot

autoload zsh/sched

# Copys word from earlier in the current command line
# or previous line if it was chosen with ^[. etc
autoload copy-earlier-word
zle -N copy-earlier-word
bindkey '^[,' copy-earlier-word

# Cycle between positions for ambigous completions
autoload cycle-completion-positions
zle -N cycle-completion-positions
bindkey '^[z' cycle-completion-positions

# Increment integer argument
autoload incarg
zle -N incarg
bindkey '^X+' incarg

# Write globbed files into command line
autoload insert-files
zle -N insert-files
bindkey '^Xf' insert-files

# Play tetris
#autoload -U tetris
#zle -N tetris
#bindkey '^X^T' tetris

# xargs but zargs
autoload -U zargs

# Calculator
autoload zcalc

# Line editor
autoload zed

# Renaming with globbing
autoload zmv

# Various reminders of things I forget...
# (Mostly useful features that I forget to use)
# vared
# =ls turns to /bin/ls
# =(ls) turns to filename (which contains output of ls)
# <(ls) turns to named pipe
# ^X* expand word
# ^[^_ copy prev word
# ^[A accept and hold
# echo $name:r not-extension
# echo $name:e extension
# echo $xx:l lowercase
# echo $name:s/foo/bar/

# Quote current line: M-'
# Quote region: M-"

# Up-case-word: M-u
# Down-case-word: M-l
# Capitilise word: M-c

# kill-region

# expand word: ^X*
# accept-and-hold: M-a
# accept-line-and-down-history: ^O
# execute-named-cmd: M-x
# push-line: ^Q
# run-help: M-h
# spelling correction: M-s

# echo ${^~path}/*mous*

# Add host/domain specific zshrc
if [ -f $HOME/.zshrc-$HOST ]
then
    . $HOME/.zshrc-$HOST
fi

if [ -f $HOME/.zshrc-$(hostname) ]
then
    . $HOME/.zshrc-$(hostname)
fi

#git stuff
alias gi='git init'
alias gs='git status'
alias gc='git checkout'

#map Esc to Caps Lock key
#xmodmap -e "clear lock"
#xmodmap -e "keycode 0x42 = Escape"

#tmux 
alias tmux='tmux -2'

PATH=$PATH:$HOME/.rvm/bin # Add RVM to PATH for scripting

[[ -s "$HOME/.rvm/scripts/rvm" ]] && . "$HOME/.rvm/scripts/rvm" # This loads RVM into a shell session.


# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('/Users/swairshah/miniconda3/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "/Users/swairshah/miniconda3/etc/profile.d/conda.sh" ]; then
        . "/Users/swairshah/miniconda3/etc/profile.d/conda.sh"
    else
        export PATH="/Users/swairshah/miniconda3/bin:$PATH"
    fi
fi
unset __conda_setup
# <<< conda initialize <<<

# ls colors
export LSCOLORS="exfxcxdxBxegecabagacad"

alias enhance='function ne() { docker run --rm -v "$(pwd)/`dirname ${@:$#}`":/ne/input -it alexjc/neural-enhance ${@:1:$#-1} "input/`basename ${@:$#}`"; }; ne'


#### FIG ENV VARIABLES ####
[ -s ~/.fig/fig.sh ] && source ~/.fig/fig.sh
#### END FIG ENV VARIABLES ####


