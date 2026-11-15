#include "daemon.hpp"
#include "log_file.hpp"

#include <chrono>
#include <exception>
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace {

void printUsage(std::ostream &out) {
    out << "Usage: __NAME__ [--log-file <path>] [--version] [--help]\n";
}

} // namespace

int main(int argc, char *argv[]) try {
    std::optional<std::string> logFile;
    std::vector<std::string_view> args;
    if (argc > 1 && argv != nullptr) {
        args.reserve(static_cast<size_t>(argc - 1));
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
                args.push_back(sv);
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

    for (const std::string_view arg : args) {
        if (arg == "--version") {
            std::cout << "__NAME__ " << APP_VERSION << "\n";
            return 0;
        }
        if (arg == "--help") {
            printUsage(std::cout);
            return 0;
        }
        printUsage(std::cerr);
        return 2;
    }

    if (const auto installed = app::installStopHandlers(); !installed) {
        std::cerr << installed.error() << "\n";
        return 1;
    }

    std::cerr << "__NAME__ " << APP_VERSION << " started\n";
    return app::runHeartbeat(app::stopRequested, std::chrono::seconds{5},
                             std::cerr);
} catch (const std::exception &e) {
    std::cerr << "__NAME__: fatal: " << e.what() << "\n";
    return 1;
} catch (...) {
    std::cerr << "__NAME__: fatal: unknown error\n";
    return 1;
}
