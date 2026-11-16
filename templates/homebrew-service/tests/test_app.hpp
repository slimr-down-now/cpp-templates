#pragma once

#include "app.hpp"
#include "test.hpp"

#include <serve_http.hpp>

#include <chrono>
#include <sstream>
#include <stop_token>
#include <string>
#include <thread>
#include <vector>

namespace app::test {

TEST_CASE("app - status returns typed versions") {
    auto app = app::make_app();
    std::vector<std::string> args{"__NAME__", "status"};
    std::vector<char *> argv;
    for (auto &a : args) {
        argv.push_back(a.data());
    }
    std::ostringstream out;
    std::ostringstream err;
    const int rc = slimr::run_cli(app, static_cast<int>(argv.size()),
                                  argv.data(), out, err);
    CHECK_EQ(rc, 0);
    CHECK(out.str().find("\"name\":\"__NAME__\"") != std::string::npos);
    CHECK(out.str().find("\"apiVersion\":1") != std::string::npos);
}

TEST_CASE("app - CLI relays status to a running server") {
    auto app = app::make_app();
    slimr::ServeHttpServer server(app, {.host = "127.0.0.1", .port = 0});
    std::string startErr;
    REQUIRE(server.start(&startErr));

    std::vector<std::string> args{"__NAME__", "--remote", server.baseUrl(),
                                  "status"};
    std::vector<char *> argv;
    for (auto &a : args) {
        argv.push_back(a.data());
    }
    const slimr::ToolDef *def = app.findTool("status");
    REQUIRE(def != nullptr);
    std::ostringstream out;
    std::ostringstream err;
    const int rc = slimr::run_cli_relay(
        app, *def, slimr::json_obj(), slimr::RequestContext{},
        static_cast<int>(argv.size()), argv.data(), out, err);
    CHECK_EQ(rc, 0);
    CHECK(out.str().find("\"apiVersion\":1") != std::string::npos);
    server.stop();
}

TEST_CASE("app - onServe returns when stop is requested") {
    auto app = app::make_app();
    REQUIRE(static_cast<bool>(app.onServe));
    std::jthread worker([&app](std::stop_token st) { app.onServe(st); });
    std::this_thread::sleep_for(std::chrono::milliseconds{20});
    worker.request_stop();
    worker.join();
    CHECK(!worker.joinable());
}

} // namespace app::test
