cask "__NAME__" do
  version "0.1.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/bdombro/__NAME__/releases/download/v#{version}/__NAME__-arm64-macos.zip"
  name "__NAME__"
  desc "__DESC__"
  homepage "https://github.com/bdombro/__NAME__"

  depends_on arch: :arm64
  depends_on macos: :sequoia

  binary "__NAME__"
end
