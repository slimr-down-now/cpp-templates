# Release and install

Outline
- Release workflow
- App assets and formulas
- Library releases
- Install after release

## Release workflow

Releases run automatically after squash-merge to `main` (one release at a time):

1. Open a PR without touching `VERSION`, `CHANGELOG.md`, or `versions/`. Write the PR title (plus optional body) as the changelog entry.
2. On merge to `main`, `release.yml` runs `scripts/release.ts plan` over commits since the last tag (skipping docs-only ranges or already-tagged `HEAD`), picks the bump from merged PR labels (`patch` default, or `release:minor` / `release:major`), writes `VERSION` / `ports/<name>/vcpkg.json`, `CHANGELOG.md` (and `vcpkg x-add-version` for libraries), commits as the GitHub App, tags `vX.Y.Z`, and runs `gh release create` (plus assets and `Formula/*.rb` / `Casks/*.rb` updates).

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
