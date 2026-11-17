# __NAME__

__DESC__

> **Client compatibility:** MCP **2026-07-28 only**; legacy clients cannot connect.

## Install

```bash
brew tap bdombro/__NAME__ https://github.com/bdombro/__NAME__
brew install bdombro/__NAME__/__NAME__
```

## Usage

Start the Homebrew service:

```bash
brew services start __NAME__
brew services info __NAME__
```

The HTTP server binds `127.0.0.1:__PORT__` (`http://127.0.0.1:__PORT__/mcp`; pass `--host 0.0.0.0` to expose) and logs to `$(brew --prefix)/var/log/__NAME__.log`.

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "__NAME__": {
      "type": "http",
      "url": "http://127.0.0.1:__PORT__/mcp"
    }
  }
}
```

Or call a tool directly from the CLI (`__NAME__ hello '{"name":"world"}'`).

## Environment Variables

| Name | Required | Purpose |
| --- | --- | --- |
| `BUGSINK_DSN` | Optional | Error reporting DSN; unset disables reporting |

## Development

See [docs/development.md](docs/development.md) for local builds, testing, and releases.
