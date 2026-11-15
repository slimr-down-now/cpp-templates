#!/usr/bin/env bash
set -euo pipefail

shopt -s nullglob
template_dirs=(templates/*/)
if (( ${#template_dirs[@]} == 0 )); then
  exit 0
fi

tmp_dirs=()
cleanup() {
  for dir in "${tmp_dirs[@]}"; do
    rm -rf "$dir"
  done
}
trap cleanup EXIT

for dir in "${template_dirs[@]}"; do
  tmpl="$(basename "$dir")"
  tmp="$(mktemp -d)"
  tmp_dirs+=("$tmp")
  bun scripts/new.ts "$tmpl" fixture "$tmp" --port 10099
  for rb in "$tmp"/Formula/*.rb; do
    ruby -c "$rb" >/dev/null
  done
  git -C "$tmp" init -q
  BUGSINK_DSN="" just --justfile "$tmp/justfile" --working-directory "$tmp" test
  just --justfile "$tmp/justfile" --working-directory "$tmp" lint
  bun scripts/check.ts "$tmpl" "$tmp"
done
