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
  test("classify distinguishes docs-only files from code and runtime docs", () => {
    const fixture = createFixture("demo-classify");
    const docsOnly = runRelease(fixture, [
      "classify",
      "README.md",
      "AGENTS.md",
      "mcp/AGENTS.md",
      "docs/contributing.md",
      "CHANGELOG.md",
      ".vscode/settings.json",
    ]);
    expect(docsOnly.exitCode).toBe(0);
    expect(docsOnly.stdout.toString().trim()).toBe("true");

    const runtimeDoc = runRelease(fixture, ["classify", "docs/conventions.md"]);
    expect(runtimeDoc.exitCode).toBe(0);
    expect(runtimeDoc.stdout.toString().trim()).toBe("false");

    const code = runRelease(fixture, ["classify", "tests/test_main.cpp"]);
    expect(code.exitCode).toBe(0);
    expect(code.stdout.toString().trim()).toBe("false");

    const mixed = runRelease(fixture, ["classify", "README.md", "ports/slimr-json/json.hpp"]);
    expect(mixed.exitCode).toBe(0);
    expect(mixed.stdout.toString().trim()).toBe("false");

    const empty = runRelease(fixture, ["classify"]);
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout.toString().trim()).toBe("false");
  });

  test("prep bumps patch/minor/major from labels, is idempotent, and rejects conflicts or empty Unreleased", () => {
    const fixture = createFixture("demo-prep");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    writeFileSync(join(fixture.repoDir, "Formula", "demo-prep.rb"), `class DemoPrep < Formula\n  homepage "https://github.com/example/demo-prep"\nend\n`);
    writeFileSync(join(fixture.repoDir, "VERSION"), "1.2.3\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Added thing\n");
    commitAndPushInitial(fixture);

    runGit(fixture.repoDir, ["checkout", "-b", "feat/thing"]);

    // Empty Unreleased fails
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v1.2.3 - 2026-01-01\n\n- Old\n");
    const empty = runRelease(fixture, ["prep", "--base", "origin/main"]);
    expect(empty.exitCode).not.toBe(0);

    // Conflicting labels fail
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Added thing\n");
    const conflict = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "release:minor,release:major"]);
    expect(conflict.exitCode).not.toBe(0);

    // Patch prep with --commit
    const patch = runRelease(fixture, ["prep", "--base", "origin/main", "--commit"]);
    expect(patch.exitCode).toBe(0);
    expect(patch.stdout.toString()).toContain("bumped=1.2.4");
    expect(readFileSync(join(fixture.repoDir, "VERSION"), "utf8")).toBe("1.2.4\n");
    expect(readFileSync(join(fixture.repoDir, "CHANGELOG.md"), "utf8")).toContain("## v1.2.4 - ");

    // Idempotent second run
    const countBefore = runGit(fixture.repoDir, ["rev-list", "--count", "HEAD"]);
    const second = runRelease(fixture, ["prep", "--base", "origin/main", "--commit"]);
    expect(second.exitCode).toBe(0);
    expect(second.stdout.toString()).toContain("already_prepped=1.2.4");
    expect(runGit(fixture.repoDir, ["rev-list", "--count", "HEAD"])).toBe(countBefore);

    // Label added after initial prep re-targets 1.2.4 -> 1.3.0 and folds new Unreleased notes
    const changelogWithExtra = readFileSync(join(fixture.repoDir, "CHANGELOG.md"), "utf8").replace(
      "## Unreleased\n",
      "## Unreleased\n\n- Extra note\n",
    );
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), changelogWithExtra);
    runGit(fixture.repoDir, ["add", "CHANGELOG.md"]);
    runGit(fixture.repoDir, ["commit", "-m", "add extra note"]);

    const retargetMinor = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "release:minor", "--commit"]);
    expect(retargetMinor.exitCode).toBe(0);
    expect(retargetMinor.stdout.toString()).toContain("bumped=1.3.0");
    expect(readFileSync(join(fixture.repoDir, "VERSION"), "utf8")).toBe("1.3.0\n");
    const retargetedChangelog = readFileSync(join(fixture.repoDir, "CHANGELOG.md"), "utf8");
    expect(retargetedChangelog).toContain("## v1.3.0 - ");
    expect(retargetedChangelog).not.toContain("## v1.2.4 - ");
    expect(retargetedChangelog).toContain("- Extra note");
    expect(retargetedChangelog).toContain("- Added thing");

    // Minor and major labels against base
    runGit(fixture.repoDir, ["reset", "--hard", "origin/main"]);
    const minor = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "bug,release:minor"]);
    expect(minor.exitCode).toBe(0);
    expect(minor.stdout.toString()).toContain("bumped=1.3.0");

    runGit(fixture.repoDir, ["reset", "--hard", "origin/main"]);
    const major = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "release:major"]);
    expect(major.exitCode).toBe(0);
    expect(major.stdout.toString()).toContain("bumped=2.0.0");

    // Advancing origin/main to match PR's already-prepped version (e.g. 1.2.4) re-targets 1.2.4 -> 1.2.5
    runGit(fixture.repoDir, ["checkout", "-B", "feat/base-advance", "origin/main"]);
    const advPrep = runRelease(fixture, ["prep", "--base", "origin/main", "--commit"]);
    expect(advPrep.exitCode).toBe(0);
    expect(advPrep.stdout.toString()).toContain("bumped=1.2.4");

    const otherDir = join(fixture.tempDir, "other-main");
    runGit(fixture.tempDir, ["clone", fixture.remoteDir, otherDir]);
    runGit(otherDir, ["config", "user.name", "Other"]);
    runGit(otherDir, ["config", "user.email", "other@example.com"]);
    writeFileSync(join(otherDir, "VERSION"), "1.2.4\n");
    writeFileSync(join(otherDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v1.2.4 - 2026-11-17\n\n- Other PR\n");
    runGit(otherDir, ["add", "VERSION", "CHANGELOG.md"]);
    runGit(otherDir, ["commit", "-m", "other PR 1.2.4"]);
    runGit(otherDir, ["push", "origin", "main"]);
    runGit(fixture.repoDir, ["fetch", "origin", "main"]);

    const retargetAfterBaseAdvance = runRelease(fixture, ["prep", "--base", "origin/main", "--commit"]);
    expect(retargetAfterBaseAdvance.exitCode).toBe(0);
    expect(retargetAfterBaseAdvance.stdout.toString()).toContain("bumped=1.2.5");
    expect(readFileSync(join(fixture.repoDir, "VERSION"), "utf8")).toBe("1.2.5\n");
    const advChangelog = readFileSync(join(fixture.repoDir, "CHANGELOG.md"), "utf8");
    expect(advChangelog).toContain("## v1.2.5 - ");
    expect(advChangelog).toContain("- Added thing");
    expect(advChangelog).not.toContain("- Other PR");

    // A fresh PR branched from 1.2.4 with empty Unreleased still fails (never steals 1.2.4 notes)
    runGit(fixture.repoDir, ["checkout", "-B", "feat/fresh-empty", "origin/main"]);
    const freshEmpty = runRelease(fixture, ["prep", "--base", "origin/main"]);
    expect(freshEmpty.exitCode).not.toBe(0);
  });

  test("publish formula (macos linux) updates formula, commits, tags, pushes, and creates release", () => {
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
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.1\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v0.1.1 - 2026-11-17\n\n- Ship Linux support\n");
    commitAndPushInitial(fixture);

    const macBytes = "mac-tar-gz";
    const linuxBytes = "linux-tar-gz";
    writeFileSync(join(fixture.repoDir, "assets", "demo-mcp-arm64-macos.tar.gz"), macBytes);
    writeFileSync(join(fixture.repoDir, "assets", "demo-mcp-x64-linux.tar.gz"), linuxBytes);

    const res = runRelease(fixture, ["publish", "0.1.1", "assets"]);
    expect(res.exitCode).toBe(0);

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
    expect(committedFiles).toEqual(["Formula/demo-mcp.rb"]);

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
    writeFileSync(join(fixture.repoDir, "VERSION"), "1.0.1\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v1.0.1 - 2026-11-17\n\n- Drop Linux\n");
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
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.3.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v0.3.0 - 2026-11-17\n\n- Update app\n");
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

  test("prep --commit and publish library (single-port and multi-port) runs vcpkg x-add-version in PR and only tags+releases on publish", () => {
    for (const multiPort of [false, true]) {
      const fixture = createFixture("slimr-demo");
      mkdirSync(join(fixture.repoDir, "ports", "slimr-demo"), { recursive: true });
      writeFileSync(
        join(fixture.repoDir, "ports", "slimr-demo", "vcpkg.json"),
        `{\n  "name": "slimr-demo",\n  "version": "1.0.0",\n  "description": "Demo library"\n}\n`,
      );
      writeFileSync(join(fixture.repoDir, "ports", "slimr-demo", "portfile.cmake"), "# demo portfile\n");

      if (multiPort) {
        mkdirSync(join(fixture.repoDir, "ports", "slimr-extra"), { recursive: true });
        writeFileSync(
          join(fixture.repoDir, "ports", "slimr-extra", "vcpkg.json"),
          `{\n  "name": "slimr-extra",\n  "version": "1.3.3"\n}\n`,
        );
        writeFileSync(join(fixture.repoDir, "ports", "slimr-extra", "portfile.cmake"), "# slimr-extra portfile\n");
        writeFileSync(join(fixture.repoDir, "vcpkg.json"), `{\n  "name": "slimr-demo"\n}\n`);
      }

      writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
      writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Bump demo lib\n");
      commitAndPushInitial(fixture);

      const prepRes = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "release:minor", "--commit"]);
      expect(prepRes.exitCode).toBe(0);
      expect(prepRes.stdout.toString()).toContain("bumped=1.1.0");

      const updatedManifest = readFileSync(join(fixture.repoDir, "ports", "slimr-demo", "vcpkg.json"), "utf8");
      expect(updatedManifest).toContain('"version": "1.1.0"');
      expect(existsSync(join(fixture.repoDir, "versions", "baseline.json"))).toBe(true);
      expect(existsSync(join(fixture.repoDir, "versions", "s-", "slimr-demo.json"))).toBe(true);

      const committedFiles = runGit(fixture.repoDir, ["show", "--name-only", "--format=", "HEAD"]).split("\n");
      expect(committedFiles).toContain("ports/slimr-demo/vcpkg.json");
      expect(committedFiles).toContain("CHANGELOG.md");
      expect(committedFiles).toContain("versions/baseline.json");
      expect(committedFiles).toContain("versions/s-/slimr-demo.json");

      // Idempotent second prep after commit
      const prepAgain = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "release:minor", "--commit"]);
      expect(prepAgain.exitCode).toBe(0);
      expect(prepAgain.stdout.toString()).toContain("already_prepped=1.1.0");

      // Post-prep port edit updates git-tree in versions/<x>-/<name>.json
      writeFileSync(join(fixture.repoDir, "ports", "slimr-demo", "portfile.cmake"), "# updated portfile\n");
      runGit(fixture.repoDir, ["add", "ports/slimr-demo/portfile.cmake"]);
      runGit(fixture.repoDir, ["commit", "-m", "edit portfile after prep"]);
      const expectedTree = runGit(fixture.repoDir, ["rev-parse", "HEAD:ports/slimr-demo"]);

      const prepTree = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "release:minor", "--commit"]);
      expect(prepTree.exitCode).toBe(0);
      expect(prepTree.stdout.toString()).toContain("bumped=1.1.0");
      const versionEntry = JSON.parse(
        readFileSync(join(fixture.repoDir, "versions", "s-", "slimr-demo.json"), "utf8"),
      ) as { versions: Array<{ version: string; "git-tree": string }> };
      expect(versionEntry.versions.find((v) => v.version === "1.1.0")?.["git-tree"]).toBe(expectedTree);

      // Re-targeting library from 1.1.0 -> 2.0.0 removes superseded 1.1.0 entry
      const prepMajor = runRelease(fixture, ["prep", "--base", "origin/main", "--labels", "release:major", "--commit"]);
      expect(prepMajor.exitCode).toBe(0);
      expect(prepMajor.stdout.toString()).toContain("bumped=2.0.0");
      const majorTree = runGit(fixture.repoDir, ["rev-parse", "HEAD:ports/slimr-demo"]);
      const majorEntry = JSON.parse(
        readFileSync(join(fixture.repoDir, "versions", "s-", "slimr-demo.json"), "utf8"),
      ) as { versions: Array<{ version: string; "git-tree": string }> };
      expect(majorEntry.versions.some((v) => v.version === "1.1.0")).toBe(false);
      expect(majorEntry.versions.find((v) => v.version === "2.0.0")?.["git-tree"]).toBe(majorTree);

      const headBeforePublish = runGit(fixture.repoDir, ["rev-parse", "HEAD"]);
      const pubRes = runRelease(fixture, ["publish", "2.0.0"]);
      expect(pubRes.exitCode).toBe(0);
      expect(runGit(fixture.repoDir, ["rev-parse", "HEAD"])).toBe(headBeforePublish);

      const remoteTags = runGit(fixture.remoteDir, ["--git-dir=.", "tag"]);
      expect(remoteTags).toContain("v2.0.0");

      const ghCalls = readGhCalls(fixture);
      expect(ghCalls.length).toBe(1);
      expect(ghCalls[0]).toContain("release create v2.0.0 --verify-tag --title v2.0.0");
      expect(ghCalls[0]).not.toContain(".tar.gz");

      // Re-running publish fails when tag already exists
      const dupPub = runRelease(fixture, ["publish", "2.0.0"]);
      expect(dupPub.exitCode).not.toBe(0);
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
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.1\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v0.1.1 - 2026-11-17\n\n- Attempt release\n");
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

  test("publish resolves Formula over Casks without touching Casks", () => {
    const fixture = createFixture("demo-formula");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "Casks"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "assets"), { recursive: true });

    const formulaInitial = `class DemoFormula < Formula
  homepage "https://github.com/example/demo-formula"
  version "0.1.0"

  def install
    bin.install "demo-formula"
  end
end
`;
    const caskInitial = `cask "driver" do
  version "0.0.1"
  sha256 "deadbeef"
  url "https://example.com/driver.pkg"
end
`;
    writeFileSync(join(fixture.repoDir, "Formula", "demo-formula.rb"), formulaInitial);
    writeFileSync(join(fixture.repoDir, "Casks", "driver.rb"), caskInitial);
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.1\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## v0.1.1 - 2026-11-17\n\n- Formula release\n");

    const macBytes = "formula-mac-tar";
    writeFileSync(join(fixture.repoDir, "assets", "demo-formula-arm64-macos.tar.gz"), macBytes);
    commitAndPushInitial(fixture);

    const nextRes = runRelease(fixture, ["next", "patch"]);
    expect(nextRes.exitCode).not.toBe(0); // Unreleased is empty after prep

    const pubRes = runRelease(fixture, ["publish", "0.1.1", "assets"]);
    expect(pubRes.exitCode).toBe(0);

    const updatedFormula = readFileSync(join(fixture.repoDir, "Formula", "demo-formula.rb"), "utf8");
    expect(updatedFormula).toContain('version "0.1.1"');
    expect(updatedFormula).toContain(`sha256 "${sha256(macBytes)}"`);
    expect(readFileSync(join(fixture.repoDir, "Casks", "driver.rb"), "utf8")).toBe(caskInitial);

    const committedFiles = runGit(fixture.repoDir, ["show", "--name-only", "--format=", "HEAD"]).split("\n").sort();
    expect(committedFiles).toEqual(["Formula/demo-formula.rb"]);

    const ghCalls = readGhCalls(fixture);
    expect(ghCalls.length).toBe(1);
    expect(ghCalls[0]).toContain("demo-formula-arm64-macos.tar.gz");
  }, 30_000);

  test("next rejects multiple Formula/*.rb files even when Casks/*.rb exists", () => {
    const fixture = createFixture("multi-formula");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "Casks"), { recursive: true });
    writeFileSync(join(fixture.repoDir, "Formula", "one.rb"), "class One < Formula\nend\n");
    writeFileSync(join(fixture.repoDir, "Formula", "two.rb"), "class Two < Formula\nend\n");
    writeFileSync(join(fixture.repoDir, "Casks", "driver.rb"), 'cask "driver" do\nend\n');
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Test\n");
    commitAndPushInitial(fixture);

    const res = runRelease(fixture, ["next", "patch"]);
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toContain("Expected exactly 1 Formula/*.rb file, found 2");
  });
});
