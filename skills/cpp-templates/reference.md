# cpp-templates reference

Outline
- Which template
- Shared vs block vs seed
- Guides

## Which template

| Template | Ships via | Key additions | Examples |
| --- | --- | --- | --- |
| `library` | vcpkg git registry (own repo) | `ports/<name>/`, `versions/`, no brew recipes | `slimr-json`, `slimr-mcp`, `slimr-sqlite` |
| `homebrew-formula` | Homebrew formula (CLI binary) | `VERSION`, `Formula/<name>.rb`, `install` / `uninstall` | `virtual-hid/clients/macos-input` |
| `homebrew-service` | Homebrew formula + `brew services` | `log`, `src/log_file.hpp`, `daemon-*`, `service do` | generic daemon |
| `homebrew-mcp` | Homebrew formula + `brew services` + MCP | `endpoint`, `test-mcp`, `server/discover` `_probe`, plugin manifests | `gdocsmith-mcp`, `personal-log-mcp`, `whatsapp-mcp/mcp` |
| `homebrew-cask` | Homebrew cask (macOS only) | `dist/` artifact hook, optional `sign` / `notarize`, `--cask` | `virtual-hid` root |

## Shared vs block vs seed

- Shared files: `scripts/*`, `.github/workflows/*`, `.github/actions/setup/action.yml`, `.clang-format`, `.clangd`, `.vscode/settings.json`, `triplets/`, CMake helpers, `src/log_file.hpp`, and template recipes in `justfile` (`mcp/justfile` for `whatsapp-mcp`); adapt intent while preserving intentional repository customizations, extra recipes, and variable overrides (`formula`, `endpoint`, `tools`, `test_target`, `platforms`)
- Block-managed files: `AGENTS.md` and `docs/contributing.md` (both root and `mcp/` for `whatsapp-mcp`) carry `<!-- cpp-templates:begin -->` .. `<!-- cpp-templates:end -->`; everything outside those markers is repository-owned
- Alignment marker: `<!-- cpp-templates:commit <sha> -->` inside the `<!-- cpp-templates:begin/end -->` block of `AGENTS.md` (`mcp/AGENTS.md` for `whatsapp-mcp`) records the last-aligned ~/dev/slimr/cpp-templates commit
- Seed files: `src/` (except `src/log_file.hpp`), `tests/`, `README.md`, `CHANGELOG.md`, and `.clang-tidy` are copied once by `just new` and preserved during alignment unless a template diff requires a migration

## Guides

- docs/create.md -- scaffold a new repository with `just new`
- docs/align.md -- align an existing repository from `<!-- cpp-templates:commit <sha> -->`
- docs/release.md -- bump versions, trigger `release.yml`, and install via Homebrew
- docs/linux.md -- Ubuntu 24.04, Homebrew on Linux, `llvm@23`, and `enable-linger`
