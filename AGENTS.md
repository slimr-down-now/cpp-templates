# cpp-templates

Rules for maintaining `cpp-templates` itself. Consumer repository rules live in `base/AGENTS.md` inside `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->`.

## Layout and sync

- `base/` holds files shared by all templates; `templates/<name>/` holds five complete, buildable trees (`library`, `homebrew-formula`, `homebrew-service`, `homebrew-mcp`, `homebrew-cask`).
- Edit shared files in `base/`, then run `just sync` to copy `base/` into every `templates/<name>/`.
- `just test` runs `scripts/sync.ts --check` (which fails on `base/` drift) and renders, builds, tests, lints, and checks every template in a temporary directory.

## `manifest.json` contract

Each `templates/<name>/manifest.json` declares `{ "verbatim": [globs], "blocks": [paths], "seed": [globs], "recipes": [names] }`:

- `verbatim`: must match byte-for-byte after placeholder substitution.
- `blocks`: only the `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->` block must match.
- `seed`: copied once by `just new`, ignored by `just check`.
- `recipes`: compared per recipe via `just --dump --dump-format json`.

## Placeholders and domain-free rule

- Only three placeholders are substituted: `__NAME__`, `__PORT__`, and `__DESC__`.
- Keep the `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->` block in `base/AGENTS.md` placeholder-free (use `<name>`, `<template>`, `<bin>`) so `just check` matches across all five templates.
- Keep templates domain-free: hello-world seeds only, with no app-specific assumptions or extra dependencies.

## Changelog

Once `CHANGELOG.md` is present, add one line under `## Unreleased` for every change (`Internal: ...` for internal changes).
