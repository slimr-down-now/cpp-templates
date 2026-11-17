# Release and install

Outline
- Release workflow
- App assets and formulas
- Library releases
- Install after release

## Release workflow

Releases run automatically on merge to `main`:

1. Add release notes under `## Unreleased` in `CHANGELOG.md` on the PR branch.
2. On `pull_request`, `test.yml` runs `scripts/release.ts prep` (`patch` by default, or `release:minor` / `release:major` PR labels) to bump `VERSION` or `ports/<name>/vcpkg.json`, promote `CHANGELOG.md` to `## vX.Y.Z - <date>`, and run `vcpkg x-add-version` for libraries. Docs-only PRs skip builds and release nothing.
3. On merge to `main`, `release.yml` tags `vX.Y.Z`, runs `gh release create`, and (for formulas/casks) updates `Formula/*.rb` or `Casks/*.rb`.

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
