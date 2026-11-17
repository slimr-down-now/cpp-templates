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

The service runs `__NAME__ serve`, listening on `$(brew --prefix)/var/__NAME__/__NAME__.sock` (`--socket` overrides it; pass `--port __PORT__` and optional `--host` to opt into TCP). It logs to `$(brew --prefix)/var/log/__NAME__.log` with 10 MB rotation (keeping one `.1` backup).

Call tools over the Unix socket (or `http://127.0.0.1:__PORT__/<tool>` when TCP is enabled):

```bash
curl --unix-socket "$(brew --prefix)/var/__NAME__/__NAME__.sock" -X POST http://localhost/status -d '{}'
```

Each tool is `POST /<tool>` on the server (raw JSON body in, result JSON out).

## Environment Variables

Services load `$(brew --prefix)/etc/__NAME__/env` (`chmod 600`) before starting.

| Name | Required | Purpose |
| --- | --- | --- |
| `BUGSINK_DSN` | No | Report errors to Bugsink |

## Development

See [docs/contributing.md](docs/contributing.md) for local builds, testing, and releases.
