#define SLIMR_TEST_MAIN
#include "__NAME__.hpp"
#include "test.hpp"

TEST_CASE("add sums two integers") { CHECK(lib::add(2, 3) == 5); }

TEST_CASE("add handles negative integers") { CHECK(lib::add(-4, 1) == -3); }
