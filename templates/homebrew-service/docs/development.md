# __NAME__: Developer Reference

User installation and configuration are in [README.md](../README.md).

## Development Loop

```bash
just doctor
just test
just lint
```

Iterate quickly on a single doctest case with `just test "<case>"`. Run the server and call a tool locally (defaulting to the Unix socket, or opt into TCP with `--port __PORT__`):

```bash
./build/bin/__NAME__ serve --socket ./build/__NAME__.sock
./build/bin/__NAME__ --remote unix:./build/__NAME__.sock status

./build/bin/__NAME__ serve --port __PORT__
./build/bin/__NAME__ --remote http://127.0.0.1:__PORT__ status
```

## Develop against an unreleased lib

Add `"overlay-ports"` to the consumer's `vcpkg-configuration.json`, then run `just test` or `just build` as usual (add one entry per unreleased lib):

```json
{
  "overlay-ports": [
    "<relative path to ~/dev/slimr/<name>/ports/slimr-<name>>"
  ]
}
```

Remove `"overlay-ports"` and bump the registry baseline once the lib is released. Never commit or release with `overlay-ports` set.

## Release

Push changes to `main`, add an entry under `## Unreleased` in `CHANGELOG.md`, then run:

```bash
just release patch   # or minor / major
```

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula checks, or JS formula helpers.
