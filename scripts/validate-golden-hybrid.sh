#!/usr/bin/env bash
# TGA-191 — validate golden hybrid template + echelon init (from kit repo root).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build:cli
npm run test:golden-hybrid
