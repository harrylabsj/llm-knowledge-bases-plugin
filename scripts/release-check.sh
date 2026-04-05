#!/usr/bin/env bash
set -euo pipefail

plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"

cd "$plugin_dir"
npm run build
npm test
bash scripts/pack-dry-run.sh
