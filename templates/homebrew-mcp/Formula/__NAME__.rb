class __CLASS__ < Formula
  desc "__DESC__"
  homepage "https://github.com/bdombro/__NAME__"
  version "0.1.0"

  on_macos do
    url "https://github.com/bdombro/__NAME__/releases/download/v0.1.0/__NAME__-arm64-macos.tar.gz"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end

  on_linux do
    url "https://github.com/bdombro/__NAME__/releases/download/v0.1.0/__NAME__-x64-linux.tar.gz"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end

  def install
    bin.install "__NAME__"
    chmod 0755, bin/"__NAME__"
    pkgshare.install "docs" if File.directory?("docs")
  end

  def post_install
    (var/"__NAME__").mkpath
    chmod 0700, var/"__NAME__"
    (var/"log").mkpath
  end

  service do
    run ["/bin/sh", "-c", "[ -f #{etc}/__NAME__/env ] && set -a && . #{etc}/__NAME__/env; exec #{opt_bin}/__NAME__ http --log-file #{var}/log/__NAME__.log"]
    keep_alive true
    working_dir var/"__NAME__"
    log_path var/"log/__NAME__.log"
    error_log_path var/"log/__NAME__.log"
    environment_variables PATH: "#{HOMEBREW_PREFIX}/bin:/usr/bin:/bin"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/__NAME__ --version")
    discover = '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
    out = pipe_output("#{bin}/__NAME__ mcp --skip-checks", "#{discover}\n")
    assert_match "__NAME__", out
  end
end
