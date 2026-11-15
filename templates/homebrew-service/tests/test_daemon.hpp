#pragma once

#include "daemon.hpp"
#include "test.hpp"

#include <atomic>
#include <chrono>
#include <csignal>
#include <sstream>
#include <string>
#include <thread>

namespace app::test {

TEST_CASE("daemon - runHeartbeat returns immediately when stop is set") {
    std::atomic<bool> stop{true};
    std::ostringstream out;
    const int rc =
        app::runHeartbeat(stop, std::chrono::milliseconds{100}, out);
    CHECK_EQ(rc, 0);
    CHECK(out.str().empty());
}

TEST_CASE("daemon - runHeartbeat logs heartbeat and exits on stop") {
    std::atomic<bool> stop{false};
    std::ostringstream out;
    std::jthread stopper([&stop] {
        std::this_thread::sleep_for(std::chrono::milliseconds{50});
        stop.store(true, std::memory_order_relaxed);
    });
    const int rc =
        app::runHeartbeat(stop, std::chrono::milliseconds{10}, out);
    CHECK_EQ(rc, 0);
    CHECK(out.str().find("__NAME__ heartbeat") != std::string::npos);
}

TEST_CASE("daemon - installStopHandlers sets stopRequested on SIGTERM") {
    struct SignalRestore {
        ~SignalRestore() {
            app::stopRequested.store(false, std::memory_order_relaxed);
            (void)std::signal(SIGTERM, SIG_DFL);
            (void)std::signal(SIGINT, SIG_DFL);
        }
    } restore;

    app::stopRequested.store(false, std::memory_order_relaxed);
    auto installed = app::installStopHandlers();
    REQUIRE(installed.has_value());
    REQUIRE_EQ(std::raise(SIGTERM), 0);
    CHECK(app::stopRequested.load(std::memory_order_relaxed));
}

} // namespace app::test
