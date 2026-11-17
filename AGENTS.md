# cpp-templates

Rules for maintaining `cpp-templates` itself. Consumer repository rules live in `base/AGENTS.md` inside `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->`.

## Layout and sync

- `base/` holds files shared by all templates; `templates/<name>/` holds five complete, buildable trees (`library`, `homebrew-formula`, `homebrew-service`, `homebrew-mcp`, `homebrew-cask`).
- Edit shared files in `base/`, then run `just sync` to copy `base/` into every `templates/<name>/`.
- `just test` runs `scripts/sync.ts --check` (which fails on `base/` drift) and renders, builds, tests, and lints every template in a temporary directory.

## Placeholders and domain-free rule

- Three input placeholders are substituted (`__NAME__`, `__PORT__`, `__DESC__`), plus derived `__CLASS__` (Homebrew formula class from `__NAME__`) and `__COMMIT__` (`<!-- cpp-templates:commit __COMMIT__ -->` in `base/AGENTS.md`).
- Keep the `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->` block in `base/AGENTS.md` generic (use `<name>`, `<template>`, `<bin>`) across all five templates.
- Keep templates domain-free: hello-world seeds only, with no app-specific assumptions or extra dependencies.

## Changelog

Once `CHANGELOG.md` is present, PRs leave it untouched (`release.yml` writes entries from squash-merge commits after merge).
