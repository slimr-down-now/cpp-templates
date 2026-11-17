# Align an existing repository

Outline
- Resolve repo, template, and marker
- Diff template changes since marker
- Pre-align MCP snapshot
- Adapt intent and preserve customizations
- Validate, bump marker, and commit

## Resolve repo, template, and marker

- Resolve target repository path (default `.`), ~/dev/slimr/cpp-templates, and target ref (default `HEAD` in ~/dev/slimr/cpp-templates)
- Infer template from repository layout unless specified: `ports/` -> `library`, `Casks/` -> `homebrew-cask`, `Formula/` + `test-mcp` -> `homebrew-mcp`, `Formula/` + `daemon-start` -> `homebrew-service`, `Formula/` -> `homebrew-formula`
- Read `<!-- cpp-templates:commit <sha> -->` from the `<!-- cpp-templates:begin/end -->` block in `AGENTS.md` (`mcp/AGENTS.md` for `whatsapp-mcp`); if missing or `unknown`, inspect `git log` to establish the baseline commit before diffing

## Diff template changes since marker

List commits and inspect changes affecting `base/` and `templates/<template>/` since `<sha>`:

```sh
git -C ~/dev/slimr/cpp-templates log --oneline <sha>..<to_sha> -- base/ templates/<template>/
git -C ~/dev/slimr/cpp-templates diff <sha>..<to_sha> -- base/ templates/<template>/
```

Stop if there are no relevant changes and only bump the marker if needed

## Pre-align MCP snapshot

For `homebrew-mcp` repositories, if the diff touches C++ sources, `CMakeLists.txt`, or build/MCP recipes, capture a pre-align snapshot before editing:

- `tools/list` and `resources/list` JSON from `<bin> mcp` (or `<bin> http --port 0` + `POST /mcp` `server/discover`)
- doctest case count
- `just --list` output

## Adapt intent and preserve customizations

- Substitute `__NAME__`, `__CLASS__`, `__PORT__`, and `__DESC__` from existing repository metadata when applying changes (leave `<!-- cpp-templates:commit <to_sha> -->` for the final step)
- Update only inside `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->` in `AGENTS.md` and `docs/contributing.md`, leaving repository-owned sections outside the block intact
- Adapt shared files (`.github/`, `scripts/`, `.clang-format`, `.clangd`, `.vscode/settings.json`, `triplets/`, `justfile` recipes, `src/log_file.hpp`) while preserving intentional repository customizations, extra recipes, and variable overrides (`formula`, `endpoint`, `tools`, `test_target`, `platforms`)
- For `whatsapp-mcp` split layout: apply `mcp/` template files under `mcp/` (`mcp/justfile`, `mcp/AGENTS.md`, `mcp/docs/contributing.md`) and adapt root-owned `.github/`, `scripts/release.ts`, `scripts/formula-shared.ts`, root `AGENTS.md` block, and root `docs/contributing.md` block at repo root while preserving multi-formula publish and `mcp/scripts/test-mcp.ts`
- Preserve seed files (`src/` except `src/log_file.hpp`, `tests/`, `README.md`, `CHANGELOG.md`, `.clang-tidy`) unless a template diff requires a specific migration
- Escalate instead of guessing if a template change conflicts with an intentional repository customization

## Validate, bump marker, and commit

- Run `just test` and `just lint`
- If C++, build, or MCP files changed: also run `just build`, `just test-mcp` (for `homebrew-mcp`), and verify `tools/list`, `resources/list`, doctest case count, and `just --list` match the pre-align snapshot
- Update `<!-- cpp-templates:commit <to_sha> -->` in `AGENTS.md` (`mcp/AGENTS.md` for `whatsapp-mcp`) and run `just --fmt --check --unstable` if `justfile` changed
- Commit on a feature branch (never push directly to `main`)
