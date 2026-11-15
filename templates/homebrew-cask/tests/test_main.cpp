#define SLIMR_TEST_MAIN
#include "cli.hpp"
#include "test.hpp"

#include <array>
#include <sstream>
#include <string_view>

TEST_CASE("cli --version prints name and version") {
    std::ostringstream out;
    std::ostringstream err;
    const std::array<std::string_view, 1> args{"--version"};
    CHECK(cli::run(args, "demo-cli", "1.2.3", out, err) == 0);
    CHECK(out.str() == "demo-cli 1.2.3\n");
    CHECK(err.str().empty());
}

TEST_CASE("cli --help and -h print usage") {
    for (const std::string_view flag : {"--help", "-h"}) {
        std::ostringstream out;
        std::ostringstream err;
        const std::array<std::string_view, 1> args{flag};
        CHECK(cli::run(args, "demo-cli", "1.2.3", out, err) == 0);
        CHECK(out.str().find("Usage:") != std::string::npos);
        CHECK(out.str().find("demo-cli hello [name]") != std::string::npos);
        CHECK(err.str().empty());
    }
}

TEST_CASE("cli hello prints default and named greetings") {
    {
        std::ostringstream out;
        std::ostringstream err;
        const std::array<std::string_view, 1> args{"hello"};
        CHECK(cli::run(args, "demo-cli", "1.2.3", out, err) == 0);
        CHECK(out.str() == "Hello, world!\n");
        CHECK(err.str().empty());
    }
    {
        std::ostringstream out;
        std::ostringstream err;
        const std::array<std::string_view, 2> args{"hello", "Ada"};
        CHECK(cli::run(args, "demo-cli", "1.2.3", out, err) == 0);
        CHECK(out.str() == "Hello, Ada!\n");
        CHECK(err.str().empty());
    }
}

TEST_CASE("cli unknown or empty args exit 2 with usage on stderr") {
    {
        std::ostringstream out;
        std::ostringstream err;
        const std::array<std::string_view, 1> args{"bogus"};
        CHECK(cli::run(args, "demo-cli", "1.2.3", out, err) == 2);
        CHECK(out.str().empty());
        CHECK(err.str().find("Usage:") != std::string::npos);
    }
    {
        std::ostringstream out;
        std::ostringstream err;
        CHECK(cli::run({}, "demo-cli", "1.2.3", out, err) == 2);
        CHECK(out.str().empty());
        CHECK(err.str().find("Usage:") != std::string::npos);
    }
}
