#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <plugin-dir> <bundle-path>" >&2
  exit 1
fi

plugin_dir="${1%/}"
bundle_path="$2"

if [ ! -d "$plugin_dir" ]; then
  echo "plugin directory not found: $plugin_dir" >&2
  exit 1
fi

mkdir -p "$(dirname "$bundle_path")"

tar -czf "$bundle_path" \
  -C "$plugin_dir" \
  .

echo "built catalog bundle: $bundle_path"
