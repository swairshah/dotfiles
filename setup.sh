cd ..
ln -s dotfiles/vimrc .vimrc
ln -s dotfiles/zshrc .zshrc
ln -s dotfiles/ghostty.conf .ghostty.conf
mkdir ~/.vim
mkdir ~/.vim/colors
mkdir ~/.vim/scripts
cp dotfiles/pyjlslime.vim ~/.vim/scripts
cp dotfiles/wombat256.vim ~/.vim/colors
cp dotfiles/lucius.vim ~/.vim/colors
cp dotfiles/molokai.vim ~/.vim/colors
mkdir ~/.vim/autolog

wget https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim -P ~/.vim/autoload

mv $HOME/Library/Application\ Support/com.mitchellh.ghostty/config $HOME/Library/Application\ Support/com.mitchellh.ghostty/_config
ln -s dotfiles/ghostty.conf $HOME/Library/Application\ Support/com.mitchellh.ghostty/config
