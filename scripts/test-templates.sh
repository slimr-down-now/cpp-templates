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

case "$(uname -s)" in
  Darwin) current_os="macos" ;;
  Linux) current_os="linux" ;;
  *) current_os="$(uname -s | tr '[:upper:]' '[:lower:]')" ;;
esac

for dir in "${template_dirs[@]}"; do
  tmpl="$(basename "$dir")"
  tmp="$(mktemp -d)"
  tmp_dirs+=("$tmp")
  bun scripts/new.ts "$tmpl" fixture "$tmp" --port 10099
  for rb in "$tmp"/Formula/*.rb "$tmp"/Casks/*.rb; do
    ruby -c "$rb" >/dev/null
  done
  platforms="$(just --justfile "$tmp/justfile" --evaluate platforms)"
  if [[ " $platforms " != *" $current_os "* ]]; then
    echo "skip $tmpl: platforms=$platforms"
    bun scripts/check.ts "$tmpl" "$tmp"
    continue
  fi
  git -C "$tmp" init -q
  BUGSINK_DSN="" just --justfile "$tmp/justfile" --working-directory "$tmp" test
  just --justfile "$tmp/justfile" --working-directory "$tmp" lint
  bun scripts/check.ts "$tmpl" "$tmp"
done
