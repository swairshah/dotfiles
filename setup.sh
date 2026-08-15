#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

link_force() {
  local src="$1"
  local dst="$2"

  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ] || [ -f "$dst" ]; then
    rm -f "$dst"
  elif [ -d "$dst" ]; then
    rm -rf "$dst"
  fi

  ln -s "$src" "$dst"
  echo "linked: $dst -> $src"
}

# Shell/editor dotfiles
link_force "$DOTFILES_DIR/vimrc" "$HOME/.vimrc"
link_force "$DOTFILES_DIR/zshrc" "$HOME/.zshrc"

# Herdr config
link_force "$DOTFILES_DIR/herdr/config.toml" "$HOME/.config/herdr/config.toml"

# Ghostty terminal config
mkdir -p "$HOME/.config/ghostty/themes"
link_force "$DOTFILES_DIR/ghostty/config" "$HOME/.config/ghostty/config"
for theme in "$DOTFILES_DIR"/ghostty/themes/*; do
  [ -e "$theme" ] || continue
  link_force "$theme" "$HOME/.config/ghostty/themes/$(basename "$theme")"
done

# Vim directories and colors/scripts
mkdir -p "$HOME/.vim/scripts" "$HOME/.vim/colors" "$HOME/.vim/autoload"
cp "$DOTFILES_DIR/pyjlslime.vim" "$HOME/.vim/scripts/"
cp "$DOTFILES_DIR/wombat256.vim" "$HOME/.vim/colors/"
cp "$DOTFILES_DIR/lucius.vim" "$HOME/.vim/colors/"
cp "$DOTFILES_DIR/molokai.vim" "$HOME/.vim/colors/"

# Install vim-plug
if command -v curl >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim -o "$HOME/.vim/autoload/plug.vim"
elif command -v wget >/dev/null 2>&1; then
  wget -q https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim -O "$HOME/.vim/autoload/plug.vim"
else
  echo "warning: neither curl nor wget found; skipping vim-plug install"
fi

# Pi extensions: keep source in this repo, link into ~/.pi/agent/extensions
PI_EXT_SRC="$DOTFILES_DIR/pi-stuff/extensions"
PI_EXT_DST="$HOME/.pi/agent/extensions"

if [ -d "$PI_EXT_SRC" ]; then
  mkdir -p "$PI_EXT_DST"

  shopt -s dotglob nullglob
  for ext in "$PI_EXT_SRC"/*; do
    link_force "$ext" "$PI_EXT_DST/$(basename "$ext")"
  done
  shopt -u dotglob nullglob

  echo "pi extensions linked into $PI_EXT_DST"
else
  echo "warning: $PI_EXT_SRC not found; skipping pi extension setup"
fi

echo "setup complete"
