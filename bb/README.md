# bb configuration

This directory contains the portable parts of the local bb setup:

- `themes/ultramarine`: the active custom blue theme
- `plugins/active-threads`: the sidebar replacement that keeps live threads visible

Run `./install.sh` after cloning the dotfiles repository. The installer:

1. links the Ultramarine theme into `~/.bb/theme/ultramarine`;
2. links the Active Threads source into `~/.bb/plugin-sources/active-threads`;
3. installs or reloads the plugin from that stable link; and
4. activates the Ultramarine theme.

Existing non-symlink destinations are preserved with a timestamped `.backup-*`
suffix before the links are created.
