#pragma once

#include "app.hpp"
#include "test.hpp"

#include <httplib.h>
#include <serve_http.hpp>

#include <atomic>
#include <chrono>
#include <csignal>
#include <filesystem>
#include <sstream>
#include <stop_token>
#include <string>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>
#include <vector>

namespace app::test {

TEST_CASE("app - status returns typed versions") {
    auto app = app::make_app();
    CHECK_EQ(app.remote, "unix:" + app::default_socket_path());
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

// Verify onServe exits promptly when stop is requested.
TEST_CASE("app - onServe returns when stop is requested") {
    auto app = app::make_app();
    REQUIRE(static_cast<bool>(app.onServe));
    std::jthread worker([&app](std::stop_token st) { app.onServe(st); });
    std::this_thread::sleep_for(std::chrono::milliseconds{20});
    worker.request_stop();
    worker.join();
    CHECK(!worker.joinable());
}

TEST_CASE("app - serve runs onServe, relays status over temp socket, and stops on shutdown") {
    const auto tmpDir =
        std::filesystem::path("build") / ("t-" + std::to_string(::getpid()));
    std::filesystem::remove_all(tmpDir);
    std::filesystem::create_directories(tmpDir);
    struct TempCleanup {
        std::filesystem::path dir;
        ~TempCleanup() {
            std::error_code ec;
            std::filesystem::remove_all(dir, ec);
        }
    } cleanup{tmpDir};
    const std::string sockPath = (tmpDir / "s.sock").string();

    auto app = app::make_app();
    std::atomic<bool> onServeStarted{false};
    std::atomic<bool> onServeStopped{false};
    auto innerOnServe = app.onServe;
    app.onServe = [&onServeStarted, &onServeStopped,
                   innerOnServe](std::stop_token st) {
        onServeStarted.store(true);
        innerOnServe(st);
        onServeStopped.store(true);
    };
    slimr::enable_serve(
        app, {.host = "127.0.0.1", .socketPath = app::default_socket_path()});

    std::atomic<int> serveRc{-1};
    std::thread serverThread([&app, &sockPath, &serveRc]() {
        std::vector<std::string> args{"__NAME__", "serve", "--socket", sockPath};
        std::vector<char *> argv;
        for (auto &a : args) {
            argv.push_back(a.data());
        }
        std::ostringstream out;
        std::ostringstream err;
        serveRc.store(slimr::run_cli(app, static_cast<int>(argv.size()),
                                     argv.data(), out, err));
    });
    struct ServerGuard {
        std::thread &th;
        std::atomic<int> &rc;
        void stop() {
            for (int i = 0; i < 300 && th.joinable() && rc.load() == -1; ++i) {
                struct sigaction sa{};
                ::sigaction(SIGTERM, nullptr, &sa);
                if (sa.sa_handler != SIG_DFL) {
                    std::raise(SIGTERM);
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds{10});
            }
            if (th.joinable()) {
                th.join();
            }
        }
        ~ServerGuard() { stop(); }
    } guard{serverThread, serveRc};

    httplib::Client cli(sockPath);
    cli.set_address_family(AF_UNIX);
    bool healthy = false;
    for (int i = 0; i < 300; ++i) {
        auto res = cli.Get("/health");
        if (res && res->status == 200) {
            healthy = true;
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds{10});
    }
    REQUIRE(healthy);
    CHECK(onServeStarted.load());

    const slimr::ToolDef *def = app.findTool("status");
    REQUIRE(def != nullptr);
    const std::string remote = "unix:" + sockPath;
    std::vector<std::string> relayArgs{"__NAME__", "--remote", remote, "status"};
    std::vector<char *> relayArgv;
    for (auto &a : relayArgs) {
        relayArgv.push_back(a.data());
    }
    std::ostringstream relayOut;
    std::ostringstream relayErr;
    const int relayRc = slimr::run_cli_relay(
        app, *def, slimr::json_obj(), slimr::RequestContext{},
        static_cast<int>(relayArgv.size()), relayArgv.data(), relayOut,
        relayErr);
    CHECK_EQ(relayRc, 0);
    CHECK(relayOut.str().find("\"apiVersion\":1") != std::string::npos);

    guard.stop();
    CHECK_EQ(serveRc.load(), 0);
    CHECK(onServeStopped.load());
    CHECK_FALSE(std::filesystem::exists(sockPath));
}

} // namespace app::test
