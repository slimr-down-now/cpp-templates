#pragma once

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstring>
#include <expected>
#include <ostream>
#include <signal.h>
#include <string>
#include <thread>

namespace app {

inline std::atomic<bool> stopRequested{false};
static_assert(std::atomic<bool>::is_always_lock_free);

namespace detail {

inline void handleStopSignal(int /*signal*/) noexcept {
    stopRequested.store(true, std::memory_order_relaxed);
}

} // namespace detail

inline std::expected<void, std::string> installStopHandlers() {
    struct sigaction sa{};
    sa.sa_handler = detail::handleStopSignal;
    sigemptyset(&sa.sa_mask);
    if (::sigaction(SIGTERM, &sa, nullptr) != 0) {
        return std::unexpected("Failed to install SIGTERM handler: " +
                               std::string(std::strerror(errno)));
    }
    if (::sigaction(SIGINT, &sa, nullptr) != 0) {
        return std::unexpected("Failed to install SIGINT handler: " +
                               std::string(std::strerror(errno)));
    }
    return {};
}

inline int runHeartbeat(std::atomic<bool> &stop,
                        std::chrono::milliseconds interval,
                        std::ostream &out) {
    constexpr std::chrono::milliseconds maxSlice{100};
    while (!stop.load(std::memory_order_relaxed)) {
        out << "__NAME__ heartbeat\n"
            << std::flush;
        auto remaining = interval;
        while (remaining.count() > 0 &&
               !stop.load(std::memory_order_relaxed)) {
            const auto slice = std::min(remaining, maxSlice);
            std::this_thread::sleep_for(slice);
            remaining -= slice;
        }
    }
    return 0;
}

} // namespace app
