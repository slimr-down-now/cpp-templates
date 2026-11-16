#pragma once

#include "app.hpp"
#include "test.hpp"

#include <string>

namespace app::test {

TEST_CASE("app - registers guide resource and hello tool") {
    auto application = app::make_app();

    bool hasGuide = false;
    for (const auto &res : application.resources) {
        if (res.uri == "__NAME__://guide") {
            hasGuide = true;
            CHECK(!res.load().empty());
        }
    }
    CHECK(hasGuide);

    const auto *hello = application.findTool("hello");
    REQUIRE(hello != nullptr);

    const auto normalSr =
        hello->handler(slimr::Json::object_t{{"name", "world"}},
                       slimr::RequestContext{});
    const auto normal = slimr::serve_result_to_mcp_result(normalSr);
    CHECK(!normal.isError);
    REQUIRE(normal.structuredContent.has_value());
    CHECK_EQ((*normal.structuredContent)["greeting"].get<std::string>(),
             "Hello, world!");

    const auto shoutedSr =
        hello->handler(slimr::Json::object_t{{"name", "world"}, {"shout", true}},
                       slimr::RequestContext{});
    const auto shouted = slimr::serve_result_to_mcp_result(shoutedSr);
    CHECK(!shouted.isError);
    REQUIRE(shouted.structuredContent.has_value());
    CHECK_EQ((*shouted.structuredContent)["greeting"].get<std::string>(),
             "HELLO, WORLD!");

    const auto missing =
        hello->handler(slimr::Json::object_t{}, slimr::RequestContext{});
    CHECK(missing.isError);
}

} // namespace app::test
