# __NAME__: Developer Reference

User installation and configuration are in [README.md](../README.md).

## Development Loop

```bash
just doctor
just test
just lint
just build
```

Iterate quickly on a single doctest case with `just test "<case>"`. Run the built binary directly:

```bash
./build/bin/__NAME__ hello
```

## Release

Push changes to `main`, add an entry under `## Unreleased` in `CHANGELOG.md`, then run:

```bash
just release patch   # or minor / major
```

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch or local-publish helpers, standalone formula checks, or JS formula helpers.
