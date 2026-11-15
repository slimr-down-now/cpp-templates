import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RELEASE_SCRIPT = join(import.meta.dir, "release.ts");
const SHARED_SCRIPT = join(import.meta.dir, "formula-shared.ts");

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length) {
    const dir = tempRoots.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Fixture {
  tempDir: string;
  repoDir: string;
  remoteDir: string;
  binDir: string;
  ghLogPath: string;
}

function runGit(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

function runRelease(fixture: Fixture, args: string[]) {
  return Bun.spawnSync(["bun", join(fixture.repoDir, "scripts", "release.ts"), ...args], {
    cwd: fixture.repoDir,
    env: {
      ...process.env,
      PATH: `${fixture.binDir}:${process.env.PATH ?? ""}`,
      GH_STUB_LOG: fixture.ghLogPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

function createFixture(name: string): Fixture {
  const tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
  tempRoots.push(tempDir);

  const remoteDir = join(tempDir, "remote.git");
  const repoDir = join(tempDir, name);
  const binDir = join(tempDir, "bin");
  const ghLogPath = join(tempDir, "gh-calls.jsonl");

  mkdirSync(remoteDir, { recursive: true });
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  runGit(remoteDir, ["init", "--bare", "--initial-branch=main"]);
  runGit(repoDir, ["init", "--initial-branch=main"]);
  runGit(repoDir, ["config", "user.name", "Test User"]);
  runGit(repoDir, ["config", "user.email", "test@example.com"]);
  runGit(repoDir, ["remote", "add", "origin", remoteDir]);

  mkdirSync(join(repoDir, "scripts"), { recursive: true });
  writeFileSync(join(repoDir, "scripts", "release.ts"), readFileSync(RELEASE_SCRIPT, "utf8"));
  writeFileSync(join(repoDir, "scripts", "formula-shared.ts"), readFileSync(SHARED_SCRIPT, "utf8"));

  const ghStub = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$GH_STUB_LOG"
`;
  const ghPath = join(binDir, "gh");
  writeFileSync(ghPath, ghStub);
  chmodSync(ghPath, 0o755);

  return { tempDir, repoDir, remoteDir, binDir, ghLogPath };
}

function commitAndPushInitial(fixture: Fixture): void {
  runGit(fixture.repoDir, ["add", "."]);
  runGit(fixture.repoDir, ["commit", "-m", "init"]);
  runGit(fixture.repoDir, ["push", "-u", "origin", "main"]);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readGhCalls(fixture: Fixture): string[] {
  if (!existsSync(fixture.ghLogPath)) return [];
  return readFileSync(fixture.ghLogPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("release.ts", () => {
  test("next bumps patch/minor/major and fails on empty or missing Unreleased", () => {
    const fixture = createFixture("demo-tool");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    writeFileSync(join(fixture.repoDir, "Formula", "demo-tool.rb"), `class DemoTool < Formula\n  homepage "https://github.com/example/demo-tool"\nend\n`);
    writeFileSync(join(fixture.repoDir, "VERSION"), "1.2.3\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Added thing\n");
    commitAndPushInitial(fixture);

    const patch = runRelease(fixture, ["next", "patch"]);
    expect(patch.exitCode).toBe(0);
    expect(patch.stdout.toString()).toBe("1.2.4\n");

    const minor = runRelease(fixture, ["next", "minor"]);
    expect(minor.exitCode).toBe(0);
    expect(minor.stdout.toString()).toBe("1.3.0\n");

    const major = runRelease(fixture, ["next", "major"]);
    expect(major.exitCode).toBe(0);
    expect(major.stdout.toString()).toBe("2.0.0\n");

    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v1.2.3 - 2026-01-01\n\n- Old\n");
    const empty = runRelease(fixture, ["next", "patch"]);
    expect(empty.exitCode).not.toBe(0);

    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## v1.2.3 - 2026-01-01\n\n- Old\n");
    const missing = runRelease(fixture, ["next", "patch"]);
    expect(missing.exitCode).not.toBe(0);
  });

  test("publish formula (macos linux) updates formula/version/changelog, commits, tags, pushes, and creates release", () => {
    const fixture = createFixture("demo-mcp");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "assets"), { recursive: true });

    const formulaInitial = `class DemoMcp < Formula
  desc "Demo MCP"
  homepage "https://github.com/example/demo-mcp"
  url "https://github.com/example/demo-mcp/releases/download/v0.1.0/demo-mcp-arm64-macos.tar.gz"
  sha256 "0000"
  version "0.1.0"

  def install
    bin.install "demo-mcp"
  end

  service do
    run [opt_bin/"demo-mcp", "http"]
    keep_alive true
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/demo-mcp --version")
  end
end
`;
    writeFileSync(join(fixture.repoDir, "Formula", "demo-mcp.rb"), formulaInitial);
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Ship Linux support\n");
    commitAndPushInitial(fixture);

    const macBytes = "mac-tar-gz";
    const linuxBytes = "linux-tar-gz";
    writeFileSync(join(fixture.repoDir, "assets", "demo-mcp-arm64-macos.tar.gz"), macBytes);
    writeFileSync(join(fixture.repoDir, "assets", "demo-mcp-x64-linux.tar.gz"), linuxBytes);

    const res = runRelease(fixture, ["publish", "0.1.1", "assets"]);
    expect(res.exitCode).toBe(0);

    expect(readFileSync(join(fixture.repoDir, "VERSION"), "utf8")).toBe("0.1.1\n");
    const changelog = readFileSync(join(fixture.repoDir, "CHANGELOG.md"), "utf8");
    expect(changelog).toMatch(/^# Changelog\n\n## Unreleased\n\n## v0\.1\.1 - \d{4}-\d{2}-\d{2}\n\n- Ship Linux support\n/);

    const updatedFormula = readFileSync(join(fixture.repoDir, "Formula", "demo-mcp.rb"), "utf8");
    expect(updatedFormula).toContain('version "0.1.1"');
    expect(updatedFormula).toContain("on_macos do");
    expect(updatedFormula).toContain('url "https://github.com/example/demo-mcp/releases/download/v0.1.1/demo-mcp-arm64-macos.tar.gz"');
    expect(updatedFormula).toContain(`sha256 "${sha256(macBytes)}"`);
    expect(updatedFormula).toContain("on_linux do");
    expect(updatedFormula).toContain('url "https://github.com/example/demo-mcp/releases/download/v0.1.1/demo-mcp-x64-linux.tar.gz"');
    expect(updatedFormula).toContain(`sha256 "${sha256(linuxBytes)}"`);
    expect(updatedFormula).toContain("def install");
    expect(updatedFormula).toContain("service do");
    expect(updatedFormula).toContain("test do");

    expect(runGit(fixture.repoDir, ["log", "-1", "--format=%s"])).toBe("Release v0.1.1");
    const committedFiles = runGit(fixture.repoDir, ["show", "--name-only", "--format=", "HEAD"]).split("\n").sort();
    expect(committedFiles).toEqual(["CHANGELOG.md", "Formula/demo-mcp.rb", "VERSION"]);

    const remoteTags = runGit(fixture.remoteDir, ["--git-dir=.", "tag"]);
    expect(remoteTags).toContain("v0.1.1");

    const ghCalls = readGhCalls(fixture);
    expect(ghCalls.length).toBe(1);
    expect(ghCalls[0]).toContain("release create v0.1.1");
    expect(ghCalls[0]).toContain("demo-mcp-arm64-macos.tar.gz");
    expect(ghCalls[0]).toContain("demo-mcp-x64-linux.tar.gz");
    expect(ghCalls[0]).toContain("--repo example/demo-mcp");
  }, 30_000);

  test("publish formula toggled from macos+linux to macos removes stale on_linux block", () => {
    const fixture = createFixture("demo-mac");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "assets"), { recursive: true });

    const formulaInitial = `class DemoMac < Formula
  desc "Demo Mac"
  homepage "https://github.com/example/demo-mac"
  version "1.0.0"

  on_macos do
    url "https://github.com/example/demo-mac/releases/download/v1.0.0/demo-mac-arm64-macos.tar.gz"
    sha256 "aaaa"
  end

  on_linux do
    url "https://github.com/example/demo-mac/releases/download/v1.0.0/demo-mac-x64-linux.tar.gz"
    sha256 "bbbb"
  end

  def install
    bin.install "demo-mac"
  end
end
`;
    writeFileSync(join(fixture.repoDir, "Formula", "demo-mac.rb"), formulaInitial);
    writeFileSync(join(fixture.repoDir, "VERSION"), "1.0.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Drop Linux\n");
    commitAndPushInitial(fixture);

    const macBytes = "mac-only-tar";
    writeFileSync(join(fixture.repoDir, "assets", "demo-mac-arm64-macos.tar.gz"), macBytes);

    const res = runRelease(fixture, ["publish", "1.0.1", "assets"]);
    expect(res.exitCode).toBe(0);

    const updatedFormula = readFileSync(join(fixture.repoDir, "Formula", "demo-mac.rb"), "utf8");
    expect(updatedFormula).toContain("on_macos do");
    expect(updatedFormula).not.toContain("on_linux do");
    expect(updatedFormula).not.toContain("bbbb");

    const ghCalls = readGhCalls(fixture);
    expect(ghCalls.length).toBe(1);
    expect(ghCalls[0]).toContain("demo-mac-arm64-macos.tar.gz");
    expect(ghCalls[0]).not.toContain("demo-mac-x64-linux.tar.gz");
  }, 30_000);

  test("publish cask updates Casks/<name>.rb and publishes dmg asset", () => {
    const fixture = createFixture("demo-cask");
    mkdirSync(join(fixture.repoDir, "Casks"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "assets"), { recursive: true });

    const caskInitial = `cask "demo-cask" do
  version "0.2.0"
  sha256 "0000"

  url "https://github.com/example/demo-cask/releases/download/v0.2.0/demo-cask-arm64-macos.dmg"
  name "Demo Cask"
  desc "Demo macOS cask"
  homepage "https://github.com/example/demo-cask"

  app "Demo.app"
end
`;
    writeFileSync(join(fixture.repoDir, "Casks", "demo-cask.rb"), caskInitial);
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.2.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Update app\n");
    commitAndPushInitial(fixture);

    const dmgBytes = "dmg-binary";
    writeFileSync(join(fixture.repoDir, "assets", "demo-cask-arm64-macos.dmg"), dmgBytes);

    const res = runRelease(fixture, ["publish", "0.3.0", "assets"]);
    expect(res.exitCode).toBe(0);

    const updatedCask = readFileSync(join(fixture.repoDir, "Casks", "demo-cask.rb"), "utf8");
    expect(updatedCask).toContain('version "0.3.0"');
    expect(updatedCask).toContain(`sha256 "${sha256(dmgBytes)}"`);
    expect(updatedCask).toContain('url "https://github.com/example/demo-cask/releases/download/v0.3.0/demo-cask-arm64-macos.dmg"');
    expect(updatedCask).toContain('app "Demo.app"');

    const ghCalls = readGhCalls(fixture);
    expect(ghCalls.length).toBe(1);
    expect(ghCalls[0]).toContain("demo-cask-arm64-macos.dmg");
  }, 30_000);

  test("publish library (single-port and multi-port) runs vcpkg x-add-version and amends into Release commit", () => {
    for (const multiPort of [false, true]) {
      const fixture = createFixture("slimr-demo");
      mkdirSync(join(fixture.repoDir, "ports", "slimr-demo"), { recursive: true });
      writeFileSync(
        join(fixture.repoDir, "ports", "slimr-demo", "vcpkg.json"),
        `{\n  "name": "slimr-demo",\n  "version": "1.0.0",\n  "description": "Demo library"\n}\n`,
      );
      writeFileSync(join(fixture.repoDir, "ports", "slimr-demo", "portfile.cmake"), "# demo portfile\n");

      if (multiPort) {
        mkdirSync(join(fixture.repoDir, "ports", "libhv"), { recursive: true });
        writeFileSync(
          join(fixture.repoDir, "ports", "libhv", "vcpkg.json"),
          `{\n  "name": "libhv",\n  "version": "1.3.3"\n}\n`,
        );
        writeFileSync(join(fixture.repoDir, "ports", "libhv", "portfile.cmake"), "# libhv portfile\n");
        writeFileSync(join(fixture.repoDir, "vcpkg.json"), `{\n  "name": "slimr-demo"\n}\n`);
      }

      writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
      writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Bump demo lib\n");
      commitAndPushInitial(fixture);

      const res = runRelease(fixture, ["publish", "1.1.0"]);
      expect(res.exitCode).toBe(0);

      const updatedManifest = readFileSync(join(fixture.repoDir, "ports", "slimr-demo", "vcpkg.json"), "utf8");
      expect(updatedManifest).toContain('"version": "1.1.0"');
      expect(existsSync(join(fixture.repoDir, "versions", "baseline.json"))).toBe(true);
      expect(existsSync(join(fixture.repoDir, "versions", "s-", "slimr-demo.json"))).toBe(true);

      const committedFiles = runGit(fixture.repoDir, ["show", "--name-only", "--format=", "HEAD"]).split("\n");
      expect(committedFiles).toContain("ports/slimr-demo/vcpkg.json");
      expect(committedFiles).toContain("CHANGELOG.md");
      expect(committedFiles).toContain("versions/baseline.json");
      expect(committedFiles).toContain("versions/s-/slimr-demo.json");
      expect(runGit(fixture.repoDir, ["rev-list", "--count", "HEAD"])).toBe("2");

      const ghCalls = readGhCalls(fixture);
      expect(ghCalls.length).toBe(1);
      expect(ghCalls[0]).toContain("release create v1.1.0 --verify-tag --title v1.1.0");
      expect(ghCalls[0]).not.toContain(".tar.gz");
    }
  }, 30_000);

  test("publish fails atomically without calling gh when git push is rejected", () => {
    const fixture = createFixture("demo-fail");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "assets"), { recursive: true });
    writeFileSync(
      join(fixture.repoDir, "Formula", "demo-fail.rb"),
      `class DemoFail < Formula\n  homepage "https://github.com/example/demo-fail"\n  version "0.1.0"\nend\n`,
    );
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Attempt release\n");
    writeFileSync(join(fixture.repoDir, "assets", "demo-fail-arm64-macos.tar.gz"), "mac-tar");
    commitAndPushInitial(fixture);

    // Advance remote main independently so non-fast-forward push is rejected.
    const otherDir = join(fixture.tempDir, "other");
    runGit(fixture.tempDir, ["clone", fixture.remoteDir, otherDir]);
    runGit(otherDir, ["config", "user.name", "Other"]);
    runGit(otherDir, ["config", "user.email", "other@example.com"]);
    writeFileSync(join(otherDir, "README.md"), "advance remote\n");
    runGit(otherDir, ["add", "README.md"]);
    runGit(otherDir, ["commit", "-m", "advance"]);
    runGit(otherDir, ["push", "origin", "main"]);

    const res = runRelease(fixture, ["publish", "0.1.1", "assets"]);
    expect(res.exitCode).not.toBe(0);
    expect(readGhCalls(fixture).length).toBe(0);
    expect(runGit(fixture.remoteDir, ["--git-dir=.", "tag"])).toBe("");
  }, 30_000);
});
