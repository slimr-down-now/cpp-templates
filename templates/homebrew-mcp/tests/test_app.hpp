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

    const auto normal = hello->handler(slimr::Json::object_t{{"name", "world"}},
                                       slimr::RequestContext{});
    CHECK(!normal.isError);
    REQUIRE(normal.structuredContent.has_value());
    CHECK_EQ((*normal.structuredContent)["greeting"].get<std::string>(),
             "Hello, world!");

    const auto shouted =
        hello->handler(slimr::Json::object_t{{"name", "world"}, {"shout", true}},
                       slimr::RequestContext{});
    CHECK(!shouted.isError);
    REQUIRE(shouted.structuredContent.has_value());
    CHECK_EQ((*shouted.structuredContent)["greeting"].get<std::string>(),
             "HELLO, WORLD!");

    const auto missing =
        hello->handler(slimr::Json::object_t{}, slimr::RequestContext{});
    CHECK(missing.isError);
}

} // namespace app::test
