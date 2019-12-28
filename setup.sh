cd ..
ln -s dotfiles/vimrc .vimrc
ln -s dotfiles/zshrc .zshrc
mkdir ~/.vim
mkdir ~/.vim/colors
cp dotfiles/wombat256.vim ~/.vim/colors
cp dotfiles/lucius.vim ~/.vim/colors
mkdir ~/.vim/autolog

wget https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim -P ~/.vim/autoload
