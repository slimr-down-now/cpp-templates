#pragma once

#include <ostream>
#include <span>
#include <string_view>

namespace cli {

inline void write_usage(std::string_view name, std::ostream &out) {
    out << "Usage:\n"
        << "  " << name << " --version\n"
        << "  " << name << " --help | -h\n"
        << "  " << name << " hello [name]\n";
}

inline int run(std::span<const std::string_view> args, std::string_view name,
               std::string_view version, std::ostream &out, std::ostream &err) {
    if (args.size() == 1 && (args[0] == "--help" || args[0] == "-h")) {
        write_usage(name, out);
        return 0;
    }
    if (args.size() == 1 && args[0] == "--version") {
        out << name << ' ' << version << '\n';
        return 0;
    }
    if (!args.empty() && args[0] == "hello") {
        if (args.size() == 1) {
            out << "Hello, world!\n";
            return 0;
        }
        if (args.size() == 2) {
            out << "Hello, " << args[1] << "!\n";
            return 0;
        }
    }
    write_usage(name, err);
    return 2;
}

} // namespace cli
