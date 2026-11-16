#include "app.hpp"
#include "log_file.hpp"

#include <serve_http.hpp>

#include <exception>
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

/* Entry point (all surfaces share app::make_app):
 *   __NAME__ serve [--socket <path>] [--host <addr>] [--port <n>] [--log-file <path>]
 *   __NAME__ [--remote <unix:path|http://...>] <tool> ['{"arg":"val"}']
 */
int main(int argc, char *argv[]) try {
    std::optional<std::string> logFile;
    std::vector<char *> filteredArgv;
    if (argc > 0 && argv != nullptr) {
        filteredArgv.reserve(static_cast<size_t>(argc));
        filteredArgv.push_back(argv[0]);
        for (int i = 1; i < argc; ++i) {
            const char *arg = argv[i];
            if (arg == nullptr) {
                continue;
            }
            const std::string_view sv(arg);
            if (sv == "--log-file") {
                if (i + 1 >= argc || argv[i + 1] == nullptr ||
                    argv[i + 1][0] == '\0') {
                    std::cerr << "Missing path for --log-file\n";
                    return 1;
                }
                logFile = argv[++i];
            } else if (sv.starts_with("--log-file=")) {
                const std::string_view val =
                    sv.substr(std::string_view("--log-file=").size());
                if (val.empty()) {
                    std::cerr << "Missing path for --log-file\n";
                    return 1;
                }
                logFile = std::string(val);
            } else {
                filteredArgv.push_back(argv[i]);
            }
        }
    }

    std::unique_ptr<app_log::LogFileGuard> logGuard;
    if (logFile.has_value()) {
        auto opened = app_log::LogFileGuard::open(*logFile);
        if (!opened) {
            std::cerr << opened.error() << "\n";
            return 1;
        }
        logGuard = std::move(*opened);
    }

    auto app = app::make_app();
    // Default Unix socket listener; `--socket` overrides it and `--port` opts into TCP.
    slimr::enable_serve(
        app, {.host = "127.0.0.1", .socketPath = app::default_socket_path()});
    return slimr::run_cli(app, static_cast<int>(filteredArgv.size()),
                          filteredArgv.data());
} catch (const std::exception &e) {
    std::cerr << "__NAME__: fatal: " << e.what() << "\n";
    return 1;
} catch (...) {
    std::cerr << "__NAME__: fatal: unknown error\n";
    return 1;
}
