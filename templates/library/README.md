# __NAME__

__DESC__

## Install

Add `bdombro/__NAME__` to `vcpkg-configuration.json`:

```json
{
  "kind": "git",
  "repository": "https://github.com/bdombro/__NAME__",
  "baseline": "<commit-sha>",
  "packages": [
    "__NAME__"
  ]
}
```

Declare `__NAME__` in `vcpkg.json` and link `__NAME__::__NAME__` in `CMakeLists.txt`:

```cmake
find_package(__NAME__ CONFIG REQUIRED)
target_link_libraries(my_target PRIVATE __NAME__::__NAME__)
```

If your library needs one implementation TU (like rapidyaml), see `slimr-yaml`'s `INTERFACE_SOURCES` pattern in `ports/slimr-yaml/slimr-yaml-config.cmake`.

## Usage

```cpp
#include <__NAME__.hpp>

int sum = lib::add(2, 3);
```

## Build & Test

```bash
just test            # Debug build (ASan + UBSan) and run tests
just lint            # Check formatting and run clang-tidy
just release patch   # Trigger release workflow and pull tag commit
```

Extra test targets go in `CMakeLists.txt` (`add_executable` and `add_test`): unfiltered `just test` runs all via `ctest`, while `just test "<case>"` runs only `test_target`.
