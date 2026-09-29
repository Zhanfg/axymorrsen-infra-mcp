#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-release}"
version="$(node -p "require('./package.json').version")"

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "package.json version must be stable SemVer x.y.z" >&2
  exit 1
fi

if [ ! -f dist/index.js ] || [ ! -f dist/bridge/stdio-remote.js ]; then
  echo "dist output is missing; run npm run build first" >&2
  exit 1
fi

rm -rf "$output_dir"
mkdir -p "$output_dir"

npm sbom --sbom-format=cyclonedx --sbom-type=application > "$output_dir/sbom.cdx.json"

archive="$output_dir/axymorrsen-infra-mcp-v${version}-node.tgz"

tar -czf "$archive" \
  dist \
  package.json \
  package-lock.json \
  README.md \
  .env.example \
  docs \
  skills \
  examples

(
  cd "$output_dir"
  sha256sum     "axymorrsen-infra-mcp-v${version}-node.tgz"     "sbom.cdx.json"     > SHA256SUMS
)

printf 'release bundle: %s\n' "$archive"
