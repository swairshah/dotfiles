#!/bin/sh
set -eu

bb_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bb_data_dir=${BB_DATA_DIR:-"$HOME/.bb"}
theme_link="$bb_data_dir/theme/ultramarine"
active_threads_link="$bb_data_dir/plugin-sources/active-threads"
custom_sidebar_link="$bb_data_dir/plugin-sources/bb-custom-sidebar"
theme_source="$bb_root/themes/ultramarine"
active_threads_source="$bb_root/plugins/active-threads"
custom_sidebar_source="$bb_root/plugins/bb-custom-sidebar"

backup_destination() {
  destination=$1
  expected_source=$2

  if [ -L "$destination" ]; then
    current_source=$(readlink "$destination")
    if [ "$current_source" = "$expected_source" ]; then
      return
    fi
  elif [ ! -e "$destination" ]; then
    return
  fi

  backup="$destination.backup-$(date +%Y%m%d-%H%M%S)"
  mv "$destination" "$backup"
  printf 'Preserved %s as %s\n' "$destination" "$backup"
}

install_or_reload_plugin() {
  plugin_id=$1
  plugin_link=$2
  installed_source=$(bb plugin list --json | PLUGIN_ID="$plugin_id" node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const plugin = JSON.parse(input).plugins.find(item => item.id === process.env.PLUGIN_ID);
  process.stdout.write(plugin?.source ?? "");
});
')

  desired_source="path:$plugin_link"
  if [ "$installed_source" = "$desired_source" ]; then
    bb plugin reload "$plugin_id"
  else
    bb plugin install "$plugin_link" --yes
  fi
}

command -v bb >/dev/null 2>&1 || {
  printf 'bb is required but was not found on PATH.\n' >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  printf 'npm is required to install the plugin dependencies.\n' >&2
  exit 1
}

mkdir -p "$(dirname "$theme_link")" "$(dirname "$active_threads_link")"

backup_destination "$theme_link" "$theme_source"
ln -sfn "$theme_source" "$theme_link"

backup_destination "$active_threads_link" "$active_threads_source"
ln -sfn "$active_threads_source" "$active_threads_link"

backup_destination "$custom_sidebar_link" "$custom_sidebar_source"
ln -sfn "$custom_sidebar_source" "$custom_sidebar_link"

npm ci --prefix "$active_threads_source"
npm ci --prefix "$custom_sidebar_source"

install_or_reload_plugin active-threads "$active_threads_link"
install_or_reload_plugin thread-hover-status "$custom_sidebar_link"

bb theme set ultramarine

printf 'Installed bb theme and plugins from %s\n' "$bb_root"
