#!/usr/bin/env bash
set -euo pipefail

plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"
cache_dir="$(mktemp -d "${TMPDIR:-/tmp}/llm-kb-npm-cache.XXXXXX")"
trap 'rm -rf "$cache_dir"' EXIT

cd "$plugin_dir"
npm pack --dry-run --cache "$cache_dir"
