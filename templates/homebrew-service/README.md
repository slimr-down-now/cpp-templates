# __NAME__

__DESC__

## Install

```bash
brew tap bdombro/__NAME__ https://github.com/bdombro/__NAME__
brew install bdombro/__NAME__/__NAME__
```

## Usage

Manage the Homebrew service:

```bash
just daemon-start
just daemon-status
just daemon-logs
```

Or with Homebrew directly:

```bash
brew services start __NAME__
brew services info __NAME__
```

The service runs `__NAME__ serve`, listening on `http://127.0.0.1:__PORT__` (`--host`/`--port` override it). It logs to `$(brew --prefix)/var/log/__NAME__.log` with 10 MB rotation (keeping one `.1` backup).

Call a tool in-process, or relay it to the running service:

```bash
__NAME__ status
__NAME__ --remote http://127.0.0.1:__PORT__ status
```

Each tool is also `POST /<tool>` on the server (JSON body in, result JSON out). A relayed call exits 69 when the service is down. The server rejects clients built for a newer tool API version; restart the service after upgrading.

## Environment Variables

Services load `$(brew --prefix)/etc/__NAME__/env` (`chmod 600`) before starting.

| Name | Required | Purpose |
| --- | --- | --- |
| `<NAME>_REMOTE` | No | Default relay target for CLI tool calls (`unix:<path>` or `http://...`); `<NAME>` is the app name upper-cased with `-` as `_` |
| `BUGSINK_DSN` | No | Report errors to Bugsink |

## Development

See [docs/development.md](docs/development.md) for local builds, testing, and releases.
