#!/bin/sh
set -eu

bb_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bb_data_dir=${BB_DATA_DIR:-"$HOME/.bb"}
theme_link="$bb_data_dir/theme/ultramarine"
plugin_link="$bb_data_dir/plugin-sources/active-threads"
theme_source="$bb_root/themes/ultramarine"
plugin_source="$bb_root/plugins/active-threads"

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

command -v bb >/dev/null 2>&1 || {
  printf 'bb is required but was not found on PATH.\n' >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  printf 'npm is required to install the Active Threads dependencies.\n' >&2
  exit 1
}

mkdir -p "$(dirname "$theme_link")" "$(dirname "$plugin_link")"

backup_destination "$theme_link" "$theme_source"
ln -sfn "$theme_source" "$theme_link"

backup_destination "$plugin_link" "$plugin_source"
ln -sfn "$plugin_source" "$plugin_link"

npm ci --prefix "$plugin_source"

installed_source=$(bb plugin list --json | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const plugin = JSON.parse(input).plugins.find(item => item.id === "active-threads");
  process.stdout.write(plugin?.source ?? "");
});
')

desired_source="path:$plugin_link"
if [ "$installed_source" != "$desired_source" ]; then
  if [ -n "$installed_source" ]; then
    bb plugin remove active-threads
  fi
  bb plugin install "$plugin_link" --yes
else
  bb plugin reload active-threads
fi

bb theme set ultramarine

printf 'Installed bb theme and plugin from %s\n' "$bb_root"
