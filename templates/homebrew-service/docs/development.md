# __NAME__: Developer Reference

User installation and configuration are in [README.md](../README.md).

## Development Loop

```bash
just doctor
just test
just lint
```

Iterate quickly on a single doctest case with `just test "<case>"`. Run the server and call a tool locally:

```bash
./build/bin/__NAME__ serve --port __PORT__
./build/bin/__NAME__ --remote http://127.0.0.1:__PORT__ status
```

## Release

Push changes to `main`, add an entry under `## Unreleased` in `CHANGELOG.md`, then run:

```bash
just release patch   # or minor / major
```

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula checks, or JS formula helpers.
