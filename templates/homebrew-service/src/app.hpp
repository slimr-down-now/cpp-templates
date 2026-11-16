#pragma once

#include <serve.hpp>

#include <condition_variable>
#include <cstdlib>
#include <mutex>
#include <stop_token>
#include <string>
#include <string_view>

namespace app {

#ifndef APP_VERSION
#error "APP_VERSION must come from CMake (VERSION)"
#endif
inline constexpr std::string_view APP_VERSION_STR = APP_VERSION;

// Bump only on breaking tool changes; the server rejects newer clients.
inline constexpr int API_VERSION = 1;

inline std::string default_socket_path() {
    const char *envPrefix = std::getenv("HOMEBREW_PREFIX");
    std::string prefix = (envPrefix != nullptr && envPrefix[0] != '\0')
                             ? std::string(envPrefix)
                             :
#if defined(__APPLE__) && defined(__aarch64__)
                             std::string("/opt/homebrew");
#elif defined(__APPLE__)
                             std::string("/usr/local");
#else
                             std::string("/home/linuxbrew/.linuxbrew");
#endif
    while (prefix.size() > 1 && prefix.back() == '/') {
        prefix.pop_back();
    }
    return prefix + "/var/__NAME__/__NAME__.sock";
}

struct StatusInput {};

struct StatusOutput {
    slimr::Field<std::string, "App name."> name;
    slimr::Field<std::string, "Binary version."> version;
    slimr::Field<int, "Tool API version."> apiVersion;
};

inline slimr::ServeApp make_app() {
    slimr::ServeApp app("__NAME__", std::string(APP_VERSION_STR));
    app.description = "__DESC__";
    app.apiVersion = API_VERSION;
    app.remote = "unix:" + default_socket_path();
    app.setBugsink("", "BUGSINK_DSN",
                   std::string("__NAME__@") + std::string(APP_VERSION_STR));

    // Background work while serving; return once stop is requested.
    app.onServe = [](std::stop_token stop) {
        std::mutex mu;
        std::condition_variable_any cv;
        std::unique_lock lock(mu);
        cv.wait(lock, stop, [] { return false; });
    };

    app.tool<StatusInput>(
        "status", "Report the app name and versions.",
        slimr::ToolAnnotations{.readOnlyHint = true, .openWorldHint = false},
        [](const StatusInput &) {
            return StatusOutput{.name = std::string("__NAME__"),
                                .version = std::string(APP_VERSION_STR),
                                .apiVersion = API_VERSION};
        });

    return app;
}

} // namespace app
