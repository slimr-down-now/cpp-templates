# cpp-templates

Source of truth for C++26 project tooling, CI workflows, Homebrew packaging, and `AGENTS.md` conventions.

## Templates

| Template | Ships via | Use for |
| --- | --- | --- |
| `library` | vcpkg git registry (own repo) | C++26 libraries |
| `homebrew-formula` | Homebrew formula | CLI binaries |
| `homebrew-service` | Homebrew formula + `brew services` | Generic daemons |
| `homebrew-mcp` | Homebrew formula + `brew services` + MCP | MCP HTTP servers |
| `homebrew-cask` | Homebrew cask (macOS only) | `.app`, `.pkg`, or `.dmg` distributions |

## Quickstart

Scaffold a new repository:

```sh
just new homebrew-mcp my-server ~/dev/bdombro/my-server
```

Check an existing repository against a template:

```sh
just check homebrew-mcp ~/dev/bdombro/my-server
```

Propagate `base/` edits into `templates/*` and validate all five templates:

```sh
just sync
just test
```

## Agent skill

Symlink the included skill so agents can create or align repositories from any workspace:

```sh
ln -s ~/dev/slimr/cpp-templates/skills/cpp-templates ~/.agents/skills/cpp-templates
```

See `skills/cpp-templates/reference.md` for template selection, `manifest.json` rules, and operational guides (`create`, `align`, `release`, `linux`).

For release GitHub App, Actions secrets, `main` rulesets, and acting as the App, see [base/docs/contributing.md#maintainer-setup](base/docs/contributing.md#maintainer-setup).
