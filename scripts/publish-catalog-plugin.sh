#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 7 ]; then
  echo "usage: $0 <plugin-dir> <bundle-path> <catalog-repo> <server-base-url> <publish-token> <platform> <channel>" >&2
  exit 1
fi

plugin_dir="${1%/}"
bundle_path="$2"
catalog_repo="${3%/}"
server_base_url="${4%/}"
publish_token="$5"
platform="$6"
channel="$7"

manifest_path="${plugin_dir}/runner-plugin.yaml"
publish_script="${catalog_repo}/scripts/publish-and-export.sh"

if [ ! -f "$manifest_path" ]; then
  echo "runner plugin manifest not found: $manifest_path" >&2
  exit 1
fi

if [ ! -f "$bundle_path" ]; then
  echo "bundle not found: $bundle_path" >&2
  exit 1
fi

if [ ! -x "$publish_script" ]; then
  echo "catalog publish script not found: $publish_script" >&2
  exit 1
fi

read_manifest_field() {
  local ruby_code="$1"
  ruby -r yaml -e "
manifest = YAML.load_file(ARGV[0])
${ruby_code}
" "$manifest_path"
}

plugin_name="$(read_manifest_field 'puts manifest.fetch("metadata").fetch("name")')"
plugin_version="$(read_manifest_field 'puts manifest.fetch("metadata").fetch("plugin_version")')"
publisher="$(read_manifest_field 'puts manifest.fetch("metadata").fetch("publisher")')"
runtime_type="$(read_manifest_field 'puts manifest.fetch("runtime").fetch("type")')"
entrypoint="$(read_manifest_field 'puts manifest.fetch("runtime").fetch("entrypoint")')"
capabilities_csv="$(read_manifest_field 'puts Array(manifest.dig("capabilities", "provides")).join(",")')"

if [ -z "$capabilities_csv" ]; then
  echo "no provided capabilities found in $manifest_path" >&2
  exit 1
fi

output_path="plugins/official/${plugin_name}.yaml"
bundle_abs_path="$(cd "$(dirname "$bundle_path")" && pwd)/$(basename "$bundle_path")"

(
  cd "$catalog_repo"
  bash "scripts/publish-and-export.sh" \
    "$server_base_url" \
    "$publish_token" \
    "$plugin_name" \
    "$plugin_version" \
    "$publisher" \
    "$runtime_type" \
    "$platform" \
    "$entrypoint" \
    "$capabilities_csv" \
    "$bundle_abs_path" \
    "$output_path"
)

curl --fail --silent --show-error \
  -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"channel\":\"${channel}\"}" \
  "${server_base_url}/api/plugins/${plugin_name}/${plugin_version}/promote" >/dev/null

echo "published to catalog: ${plugin_name}@${plugin_version} channel=${channel}"
