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

vcpkg reads extra port dirs from `VCPKG_OVERLAY_PORTS`, and an overlay wins over the registry. Point it at a dir of symlinks, one per unreleased lib; manifests never change:

```sh
mkdir -p ~/.vcpkg/overlays/dev
ln -s ~/dev/slimr/<name>/ports/slimr-<name> ~/.vcpkg/overlays/dev/slimr-<name>
export VCPKG_OVERLAY_PORTS=~/.vcpkg/overlays/dev
just test
```

Remove the symlink (or `unset VCPKG_OVERLAY_PORTS`) to build against the released lib again. Keep the export out of shell startup files. `just release` refuses to run while `VCPKG_OVERLAY_PORTS` is set.

## Release

Push changes to `main`, add an entry under `## Unreleased` in `CHANGELOG.md`, then run:

```bash
just release patch   # or minor / major
```

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula checks, or JS formula helpers.
