# Release and install

Outline
- Release workflow
- App assets and formulas
- Library releases
- Install after release

## Release workflow

Every repository ships via:

```sh
just release major|minor|patch
```

`just release` triggers `.github/workflows/release.yml` with `bump`, watches the run, and pulls the release commit. Never run `test.yml` manually before `just release` (since `release.yml` runs `test.yml` first); run `test.yml` manually only when asked or to reproduce a Linux-only failure.

`scripts/release.ts next <bump>` fails if `CHANGELOG.md` under `## Unreleased` is empty. `scripts/release.ts publish` promotes `## Unreleased` to `## vX.Y.Z - <date>`, adds a fresh `## Unreleased`, commits, tags, pushes atomically, and only then runs `gh release create`.

## App assets and formulas

- `homebrew-formula`, `homebrew-service`, and `homebrew-mcp` publish `<name>-arm64-macos.tar.gz` and `<name>-x64-linux.tar.gz` for enabled `platforms`, with matching `on_macos` and `on_linux` URL + sha256 blocks in `Formula/<name>.rb`
- `homebrew-cask` publishes `<name>-arm64-macos.{pkg,dmg,zip}` for macOS only
- Libraries publish no release assets

## Library releases

- `library` repos bump `ports/<name>/vcpkg.json` and record the version with `vcpkg x-add-version`
- Release shared libraries leaf-first (for example `slimr-json` before `slimr-mcp`), then run `just upgrade-deps` in each dependent repository to move baselines to latest

## Install after release

```sh
just install
```

`just install` runs `uninstall`, taps `bdombro/<name>` with its explicit GitHub URL (`brew tap bdombro/<name> https://github.com/bdombro/<name>`), installs the released binary, runs `brew test`, and calls `just daemon-start` for services.
