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
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/__NAME__ --version")
    assert_match "Hello, world!", shell_output("#{bin}/__NAME__ hello")
  end
end
