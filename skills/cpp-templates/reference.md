# cpp-templates reference

Outline
- Which template
- Verbatim vs block vs seed
- Guides

## Which template

| Template | Ships via | Key additions | Examples |
| --- | --- | --- | --- |
| `library` | vcpkg git registry (own repo) | `ports/<name>/`, `versions/`, no brew recipes | `slimr-json`, `slimr-mcp`, `slimr-sqlite` |
| `homebrew-formula` | Homebrew formula (CLI binary) | `VERSION`, `Formula/<name>.rb`, `install` / `uninstall` | `virtual-hid/clients/macos-input` |
| `homebrew-service` | Homebrew formula + `brew services` | `log`, `src/log_file.hpp`, `daemon-*`, `service do` | generic daemon |
| `homebrew-mcp` | Homebrew formula + `brew services` + MCP | `endpoint`, `test-mcp`, `server/discover` `_probe`, plugin manifests | `gdocsmith-mcp`, `personal-log-mcp`, `whatsapp-mcp/mcp` |
| `homebrew-cask` | Homebrew cask (macOS only) | `dist/` artifact hook, optional `sign` / `notarize`, `--cask` | `virtual-hid` root |

## Verbatim vs block vs seed

Each `templates/<name>/manifest.json` declares `{ verbatim, blocks, seed, recipes }`:

- `verbatim` globs must match byte-for-byte after substituting `__NAME__`, `__PORT__`, `__DESC__`, and derived `__CLASS__` (`scripts/*`, `.github/workflows/*`, `.github/actions/setup/action.yml`, `.clang-format`, `.clangd`, `.vscode/settings.json`, CMake helpers, `src/log_file.hpp`)
- `blocks` paths (`AGENTS.md`) must match only inside `<!-- cpp-templates:begin -->` and `<!-- cpp-templates:end -->`; everything outside is repository-owned
- `seed` globs (`src/` except `src/log_file.hpp`, `tests/`, `README.md`, `CHANGELOG.md`, `.clang-tidy`) are copied once by `just new` and ignored by `just check`
- `recipes` are checked per recipe via `just --dump --dump-format json`; template recipes must match, while repositories may add extra recipes or override variable values (`formula`, `endpoint`, `tools`, `test_target`, `platforms`)
- `check_skip`: optional justfile variable holding whitespace-separated globs; `just check` skips matching `verbatim` paths and `recipes` names and prints each skipped item (unskipped mismatches still fail)

## Guides

- docs/create.md — scaffold a new repository with `just new`
- docs/align.md — align an existing repository with `just check`
- docs/release.md — bump versions, trigger `release.yml`, and install via Homebrew
- docs/linux.md — Ubuntu 24.04, Homebrew on Linux, `llvm@23`, and `enable-linger`
