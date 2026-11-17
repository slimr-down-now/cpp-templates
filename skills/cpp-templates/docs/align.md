# Align an existing repository

Outline
- Pre-port snapshots and clang-format
- Run `just check` loop
- Remove local linking and old CI
- Update registries, paths, logging, and clang-tidy
- Update docs and verify snapshots

## Pre-port snapshots and clang-format

Before editing an MCP repo, save snapshots to compare after the port:

- `tools/list` and `resources/list` JSON from `<bin> http --port 0` plus `POST /mcp` `server/discover`
- doctest case count
- `just --list` output

Reformat C++ sources in their own commit (`style: clang-format`), add the commit hash to `.git-blame-ignore-revs`, and exclude vendored code in `.clang-format-ignore`.

## Run `just check` loop

Run from `~/dev/slimr/cpp-templates`:

```sh
just check <template> <path>
```

Repeat until `just check` exits 0:

- Copy or update `verbatim` files from `templates/<template>/` with placeholder substitution
- Replace only the `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->` blocks in `AGENTS.md` and `docs/contributing.md`; move repository-specific rules outside the block and remove hand-copied memory-safety sections
- Align template `recipes` in `justfile` while keeping repository-specific recipes and variables (`formula`, `endpoint`, `tools`, `test_target`, `platforms`)

## Remove local linking and old CI

Delete legacy local-linking and release machinery:

- Remove `VCPKG_OVERLAY_PORTS`, `Library/Taps` symlinks, `install-local`, `reinstall-local`, `install-github`, `publish`, `publish-local`, `--dry-run`, `run`, `check-formula`, `dev-formula.*`, `homebrew.mjs`, and `publish.mjs`
- Replace push-triggered `.github/workflows/ci.yml` with template `test.yml` and `release.yml`, and delete the `VCPKG_REF` repo variable

## Update registries, paths, logging, and clang-tidy

- Switch `vcpkg-configuration.json` to `slimr-*` git registries (including transitive `slimr-*` dependencies) and run `just upgrade-deps`
- Move XDG paths (`~/.local/share/...`, `~/.local/state/...`, `~/.config/...`) to `$(brew --prefix)/var/<name>` and `$(brew --prefix)/etc/<name>/` (always using the formula name, never a short XDG name); move secrets into env vars (`$(brew --prefix)/etc/<name>/env` for services)
- Wire `src/log_file.hpp` and `--log-file`, compile `VERSION` into `--version` and Bugsink `release`, bind `0.0.0.0` by default on `http`, and wire the `PluginApp` env check with `--skip-checks`
- Keep `just lint` green by disabling `.clang-tidy` checks with findings under a commented `Pending lint follow-ups` list with per-check counts; fix them later, one check per reviewed commit
- Seed `CHANGELOG.md` with an empty `## Unreleased` heading (`release.yml` writes entries from squash-merge commits after merge)

## Update docs and verify snapshots

- Split port history into single-purpose commits: `style: clang-format` first, then non-behavior docs/tooling, then one commit per behavior change with its tests
- Restructure `README.md` end-user first (what it does, install, usage, env var table, then links to `docs/`)
- Move contributor workflow to `docs/contributing.md` (direct binary dev loop on port `2000N`, PR/CI/release flow, explicit-URL tap, dropped recipes) under `## Repository tips` outside the template block
- Run `just build`, `just test`, `just lint`, `just test-mcp` (for `homebrew-mcp`), and verify `tools/list`, `resources/list`, and doctest case count match the pre-port snapshot; reviewers also run a base-vs-ported regression gate on temp worktrees
