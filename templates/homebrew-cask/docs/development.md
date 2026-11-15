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

## Packaging, Signing, and Notarization

`just build` compiles the Release binary to `build/bin/__NAME__`, runs `just sign`, zips it to `dist/__NAME__-arm64-macos.zip`, and runs `just notarize`.

- `CODESIGN_IDENTITY`: codesign identity for hardened runtime signing (`just sign`); skipped when unset.
- `NOTARIZE_PROFILE`: `xcrun notarytool` keychain profile (`just notarize`); skipped when unset.

Until CI signing and notarization are configured, Gatekeeper may block the unsigned binary after `brew install --cask`; users can clear it with `xattr -d com.apple.quarantine "$(brew --prefix)/bin/__NAME__"`.

## Release

Push changes to `main`, add an entry under `## Unreleased` in `CHANGELOG.md`, then run:

```bash
just release patch   # or minor / major
```

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch or local-publish helpers, standalone formula checks, or JS formula helpers.
