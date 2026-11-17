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
  *)
    echo "test-templates: unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

for dir in "${template_dirs[@]}"; do
  tmpl="$(basename "$dir")"
  tmp="$(mktemp -d)"
  tmp_dirs+=("$tmp")
  bun scripts/new.ts "$tmpl" fixture "$tmp" --port 10099
  if ! grep -q '^<!-- cpp-templates:commit ' "$tmp/AGENTS.md" || grep -q '__COMMIT__' "$tmp/AGENTS.md"; then
    echo "test-templates: $tmpl: AGENTS.md missing resolved cpp-templates:commit marker" >&2
    exit 1
  fi
  for rb in "$tmp"/Formula/*.rb "$tmp"/Casks/*.rb; do
    ruby -c "$rb" >/dev/null
  done
  platforms="$(just --justfile "$tmp/justfile" --evaluate platforms)"
  read -ra platform_tokens <<< "$platforms"
  if (( ${#platform_tokens[@]} == 0 )); then
    echo "test-templates: $tmpl: platforms justfile variable must not be empty" >&2
    exit 1
  fi
  has_current=false
  for p in "${platform_tokens[@]}"; do
    case "$p" in
      macos|linux)
        if [[ "$p" == "$current_os" ]]; then
          has_current=true
        fi
        ;;
      *)
        echo "test-templates: $tmpl: unknown platform \"$p\" in platforms" >&2
        exit 1
        ;;
    esac
  done
  if [[ "$has_current" != true ]]; then
    echo "skip $tmpl: platforms=$platforms"
    continue
  fi
  git -C "$tmp" init -q
  BUGSINK_DSN="" just --justfile "$tmp/justfile" --working-directory "$tmp" test
  just --justfile "$tmp/justfile" --working-directory "$tmp" lint
  if [[ "$tmpl" == homebrew-* ]]; then
    just --justfile "$tmp/justfile" --working-directory "$tmp" build
    if [[ "$current_os" == "macos" ]]; then
      for bin in "$tmp"/build/bin/*; do
        [[ -f "$bin" && -x "$bin" ]] || continue
        while IFS= read -r lib; do
          [[ -z "$lib" ]] && continue
          case "$lib" in
            /System/Library/*|/usr/lib/libSystem.B.dylib|/usr/lib/libobjc.A.dylib) ;;
            *)
              echo "test-templates: $tmpl: unexpected dylib in $(basename "$bin"): $lib" >&2
              exit 1
              ;;
          esac
        done < <(otool -L "$bin" | tail -n +2 | awk '{print $1}')
        exported="$(nm -gU "$bin")"
        if [[ -n "$exported" ]]; then
          echo "test-templates: $tmpl: $(basename "$bin") exports symbols (expected empty nm -gU):" >&2
          echo "$exported" >&2
          exit 1
        fi
      done
    fi
  fi
done
