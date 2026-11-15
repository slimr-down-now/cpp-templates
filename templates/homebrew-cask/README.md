# __NAME__

__DESC__

## Install

```bash
brew tap bdombro/__NAME__ https://github.com/bdombro/__NAME__
brew install --cask bdombro/__NAME__/__NAME__
```

Until CI signing and notarization are configured, Gatekeeper may block the unsigned binary after `brew install --cask`. Clear the quarantine attribute if prompted:

```bash
xattr -d com.apple.quarantine "$(brew --prefix)/bin/__NAME__"
```

## Usage

```bash
__NAME__ --version
__NAME__ hello [name]
__NAME__ --help
```

## Environment Variables

| Name | Required | Purpose |
| --- | --- | --- |
| *(none)* | — | — |

## Development

See [docs/development.md](docs/development.md) for local builds, testing, and releases.
