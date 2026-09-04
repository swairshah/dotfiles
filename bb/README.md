# bb configuration

This directory contains the portable parts of the local bb setup:

- `themes/ultramarine` contains the active custom blue theme.
- `plugins/active-threads` contains the original sidebar replacement.
- `plugins/bb-custom-sidebar` contains the compact custom sidebar with recent threads, Git status, hover actions, and project icons.

Run `./install.sh` after cloning the dotfiles repository. The installer links the theme and both plugins into `~/.bb`, installs their dependencies, installs or reloads the plugins, and activates the Ultramarine theme.

Existing destinations that are not the expected symlinks are preserved with a timestamped `.backup-*` suffix before new links are created.
