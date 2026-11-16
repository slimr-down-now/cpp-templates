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
    require "net/http"
    assert_match version.to_s, shell_output("#{bin}/__NAME__ --version")
    r, w = IO.pipe
    pid = spawn("#{bin}/__NAME__", "--skip-checks", "http", "--host", "127.0.0.1", "--port", "0", err: w)
    w.close
    begin
      port = nil
      r.each_line { |line| break if (port = line[%r{listening on http://[\d.]+:(\d+)/mcp}, 1]) }
      assert port, "server did not report a listening port"
      discover = '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
      res = Net::HTTP.post(URI("http://127.0.0.1:#{port}/mcp"), discover,
                           "Content-Type"         => "application/json",
                           "Accept"               => "application/json, text/event-stream",
                           "MCP-Protocol-Version" => "2026-07-28",
                           "Mcp-Method"           => "server/discover")
      assert_match "__NAME__", res.body
    ensure
      Process.kill("TERM", pid)
      Process.wait(pid)
    end
  end
end
