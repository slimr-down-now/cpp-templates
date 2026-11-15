set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set positional-arguments

_:
    @just --list

# Check a repository against a template
check template path:
    bun scripts/check.ts "$1" "$2"

# Format the justfile
fmt:
    just --fmt --unstable

# Type-check scripts and verify justfile formatting
lint:
    ./node_modules/.bin/tsc --noEmit
    just --fmt --check --unstable

# Render a template into a target directory
new template name path *args:
    bun scripts/new.ts "$@"

# Propagate base/ files and AGENTS blocks into templates/*/
sync:
    bun scripts/sync.ts

# Run tooling tests, check base/ drift, and validate rendered templates
test:
    bun test
    bun scripts/sync.ts --check
    bash scripts/test-templates.sh
