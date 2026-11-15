# Linux setup and platform targets

Outline
- Platform targets
- Ubuntu 24.04 and Homebrew on Linux
- Toolchain and static libc++
- Services and lingering
- Doctor and install

## Platform targets

Every template supports `platforms := "macos linux"` by default. Set `platforms := "macos"` in `justfile` for desktop-browser or macOS-API apps (`brave-history-mcp`, `shop-assistant-mcp`, `virtual-hid`) and for `homebrew-cask` (Homebrew on Linux has no casks).

## Ubuntu 24.04 and Homebrew on Linux

- GitHub Actions and Linux hosts target Ubuntu 24.04 (glibc >= 2.39 floor) with Homebrew on Linux
- `$(brew --prefix)` is resolved dynamically instead of hardcoding `/opt/homebrew`
- Template scripts avoid BSD-only flags (for example `wc -c` instead of `stat -f%z`)

## Toolchain and static libc++

- Linux builds use Homebrew `llvm@23` (`LLVM_BIN` and `CXX`), while macOS uses `/usr/bin/clang++` (`CXX` overrides both)
- Linux Release binaries link `libc++` statically so `ldd build/bin/<name>` has no dynamic `libc++.so` dependency

## Services and lingering

`brew services` on Linux creates systemd user units. Enable lingering once per user so services stay up after logout:

```sh
loginctl enable-linger "$USER"
```

## Doctor and install

`just doctor` checks required tools on `PATH`, `-std=c++26` compilation, `llvm@23` `clang-format` and `clang-tidy` in `LLVM_BIN`, `VCPKG_ROOT`, and `loginctl enable-linger` on Linux. Once green, run root `just install` to tap, install, test, and start enabled services.
