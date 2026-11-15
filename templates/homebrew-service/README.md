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

The service logs to `$(brew --prefix)/var/log/__NAME__.log` with 10 MB rotation (keeping one `.1` backup).

## Environment Variables

This seed reads no environment variables. Services load `$(brew --prefix)/etc/__NAME__/env` (`chmod 600`) before starting.

| Name | Required | Purpose |
| --- | --- | --- |
| *(none)* | — | — |

## Development

See [docs/development.md](docs/development.md) for local builds, testing, and releases.
