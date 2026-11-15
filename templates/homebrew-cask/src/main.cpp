#include "cli.hpp"

#include <exception>
#include <iostream>
#include <string_view>
#include <vector>

#ifndef APP_VERSION
#error "APP_VERSION must be defined by CMake"
#endif

int main(int argc, char *argv[]) try {
    std::vector<std::string_view> args;
    if (argc > 1 && argv != nullptr) {
        args.reserve(static_cast<size_t>(argc - 1));
        for (int i = 1; i < argc; ++i) {
            if (argv[i] != nullptr)
                args.emplace_back(argv[i]);
        }
    }
    return cli::run(args, "__NAME__", APP_VERSION, std::cout, std::cerr);
} catch (const std::exception &e) {
    std::cerr << "__NAME__: fatal: " << e.what() << "\n";
    return 1;
} catch (...) {
    std::cerr << "__NAME__: fatal: unknown error\n";
    return 1;
}
