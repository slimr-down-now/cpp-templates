# Create a new repository

Outline
- Scaffold with `just new`
- Fill repository values
- Wire env vars, logs, and Bugsink
- Validate locally

## Scaffold with `just new`

Run from `~/dev/slimr/cpp-templates`:

```sh
just new <template> <name> <path>
```

`<name>` is always the Homebrew formula or package name (for example `gdocsmith-mcp` or `slimr-json`), never a short XDG name. `just new` substitutes three input placeholders (plus derived `__CLASS__`) across the template tree:

- `__NAME__` — formula or package name
- `__CLASS__` — derived Homebrew formula class name from `__NAME__`
- `__PORT__` — HTTP port (for `homebrew-mcp`, `10001`..`10008` in production, `2000N` for local dev runs)
- `__DESC__` — short one-line description

## Fill repository values

- In `justfile`, set `formula`, `endpoint`, `tools`, `test_target`, and `platforms` (`"macos linux"` or `"macos"` for desktop-browser / macOS-API apps and casks)
- For `homebrew-*` apps, set the initial version in `VERSION` (CMake compiles it into `--version`)
- For `library` repos, set the initial version in `ports/<name>/vcpkg.json` and run `vcpkg x-add-version`
- Seed `CHANGELOG.md` with `## Unreleased` and an initial line before the first `just release`

## Wire env vars, logs, and Bugsink

- Declare required env vars in `PluginApp` with name and purpose; the runner checks them before `mcp`, `http`, or tool commands and exits naming every missing one (`--skip-checks` bypasses the check; `--version` and `--help` never run it)
- Store app data in `$(brew --prefix)/var/<name>`, non-secret config in `$(brew --prefix)/etc/<name>/`, and service secrets in `$(brew --prefix)/etc/<name>/env` (`chmod 600`, never in the public formula)
- Pass compiled-in `VERSION` to `BugsinkReporter(dsn, envVar, "<name>@" VERSION)` so events carry `release`
- Document every env var in `README.md` with an env var table (name, required or optional, purpose)

## Validate locally

```sh
just doctor
just test
just lint
just test-mcp   # homebrew-mcp only
```
