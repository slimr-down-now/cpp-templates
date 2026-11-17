# Contributing

User installation and configuration are in [README.md](../README.md).

<!-- cpp-templates:begin -->
## Contents

- [Develop and test](#develop-and-test)
- [Unreleased libraries](#unreleased-libraries)
- [Rules](#rules)
- [PR, CI, and release flow](#pr-ci-and-release-flow)
- [Dependency bumps](#dependency-bumps)

## Develop and test

```bash
just doctor
just test
just lint
```

Iterate on a single doctest case with `just test "<case>"` (Debug build with ASan + UBSan, `BUGSINK_DSN=""`). For `homebrew-mcp` repos, run `just test-mcp` as well.

## Unreleased libraries

vcpkg reads extra port dirs from `VCPKG_OVERLAY_PORTS`, and an overlay wins over the registry. Point it at a dir of symlinks, one per unreleased lib; manifests never change:

```sh
mkdir -p ~/.vcpkg/overlays/dev
ln -s ~/dev/slimr/<lib>/ports/slimr-<lib> ~/.vcpkg/overlays/dev/slimr-<lib>
export VCPKG_OVERLAY_PORTS=~/.vcpkg/overlays/dev
just test
```

Remove the symlink (or `unset VCPKG_OVERLAY_PORTS`) to build against the released lib again. Keep the export out of shell startup files.

## Rules

- Never push directly to `main`; all changes land through pull requests.
- Sanitize everything (no secrets, tokens, DSNs, or personal data in commits, logs, or docs).
- Run `just test` (ASan + UBSan) and `just lint` before opening or updating a PR.
- Add an entry under `## Unreleased` in `CHANGELOG.md` for every non-docs-only change (`Internal: ...` for internal changes).

## PR, CI, and release flow

- Every PR runs `test.yml`: a `gate` job skips macOS/Linux builds on docs-only PRs, and a single `ci` summary job gates merge.
- Non-docs PRs automatically prepare the version bump (`patch` by default, or `release:minor` / `release:major` PR labels) and promote `## Unreleased` in `CHANGELOG.md` (plus `vcpkg x-add-version` for libraries). Agents must ask before adding `release:minor` or `release:major` labels.
- Merging to `main` triggers `release.yml`, which tags `vX.Y.Z`, publishes the GitHub Release, and (for formulas/casks) updates `Formula/*.rb` or `Casks/*.rb`. Docs-only merges release nothing.
- Pre-releases are a known option (tag/channel), not currently built.

## Dependency bumps

Bump a library baseline in `vcpkg-configuration.json` only when a bug fix, new API, or security fix requires it; otherwise wait for the next `just upgrade-deps`.
<!-- cpp-templates:end -->

## Repository tips
