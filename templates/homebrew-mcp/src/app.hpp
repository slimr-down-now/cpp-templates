#pragma once

#include <mcp.hpp>

#include <algorithm>
#include <cctype>
#include <optional>
#include <string>
#include <string_view>
#include <utility>

namespace app {

#ifndef APP_VERSION
#error "APP_VERSION must come from CMake (VERSION)"
#endif
inline constexpr std::string_view APP_VERSION_STR = APP_VERSION;

struct HelloInput {
    slimr::Field<std::string, "Name to greet."> name;
    slimr::OptField<std::optional<bool>, "Uppercase the greeting."> shout{false};
};

inline slimr::PluginApp make_app() {
    slimr::PluginApp app("__NAME__", std::string(APP_VERSION_STR));
    app.allowCliTools = true;
    app.description = "__DESC__";
    app.instructions =
        "Read `__NAME__://guide` before calling tools for usage details.";
    app.setBugsink("", "BUGSINK_DSN",
                   std::string("__NAME__@") + std::string(APP_VERSION_STR));

    app.resources.push_back(slimr::Resource{
        .uri = "__NAME__://guide",
        .name = "guide",
        .description = "Usage guide for __NAME__.",
        .mimeType = "text/markdown",
        .load = []() -> std::string {
            return "# __NAME__ guide (v" + std::string(APP_VERSION_STR) +
                   ")\n\nCall `hello` with `{\"name\": \"world\"}`.\n";
        },
    });

    app.tool<HelloInput>(
        "hello", "Return a greeting.",
        slimr::ToolAnnotations{.readOnlyHint = true, .openWorldHint = false},
        [](const HelloInput &in) -> slimr::McpResult {
            if (in.name.get().empty()) {
                return slimr::McpResult::error("name must not be empty");
            }
            std::string greeting = "Hello, " + in.name.get() + "!";
            if (in.shout.get().value_or(false)) {
                std::transform(greeting.begin(), greeting.end(), greeting.begin(),
                               [](unsigned char c) {
                                   return static_cast<char>(std::toupper(c));
                               });
            }
            slimr::Json out = slimr::Json::object_t{{"greeting", greeting}};
            return slimr::McpResult::structured(std::move(out),
                                                std::move(greeting));
        });

    return app;
}

} // namespace app
