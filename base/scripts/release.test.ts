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

  test("plan computes version from labels, skips docs-only ranges and already-tagged HEAD", () => {
    const fixture = createFixture("demo-plan");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "src"), { recursive: true });
    writeFileSync(join(fixture.repoDir, "Formula", "demo-plan.rb"), `class DemoPlan < Formula\n  homepage "https://github.com/example/demo-plan"\nend\n`);
    writeFileSync(join(fixture.repoDir, "VERSION"), "1.2.3\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
    writeFileSync(join(fixture.repoDir, "README.md"), "# demo\n");
    commitAndPushInitial(fixture);
    runGit(fixture.repoDir, ["tag", "-a", "v1.2.3", "-m", "v1.2.3"]);

    // Already-tagged HEAD is a no-op
    const tagged = runRelease(fixture, ["plan"]);
    expect(tagged.exitCode).toBe(0);
    expect(JSON.parse(tagged.stdout.toString())).toEqual({ should_release: false, version: "" });

    // Docs-only commit since tag skips
    writeFileSync(join(fixture.repoDir, "README.md"), "# demo updated\n");
    runGit(fixture.repoDir, ["add", "README.md"]);
    runGit(fixture.repoDir, ["commit", "-m", "docs: update readme"]);
    const docsOnly = runRelease(fixture, ["plan"]);
    expect(docsOnly.exitCode).toBe(0);
    expect(JSON.parse(docsOnly.stdout.toString())).toEqual({ should_release: false, version: "" });

    // Code commit since tag triggers patch by default, minor/major via labels, error on conflict
    writeFileSync(join(fixture.repoDir, "src", "main.cpp"), "int main() { return 0; }\n");
    runGit(fixture.repoDir, ["add", "src/main.cpp"]);
    runGit(fixture.repoDir, ["commit", "-m", "feat: add main"]);

    const patch = runRelease(fixture, ["plan", "--labels", ""]);
    expect(patch.exitCode).toBe(0);
    expect(JSON.parse(patch.stdout.toString())).toEqual({ should_release: true, version: "1.2.4" });

    const minor = runRelease(fixture, ["plan", "--labels", "bug,release:minor"]);
    expect(minor.exitCode).toBe(0);
    expect(JSON.parse(minor.stdout.toString())).toEqual({ should_release: true, version: "1.3.0" });

    const major = runRelease(fixture, ["plan", "--labels", "release:major"]);
    expect(major.exitCode).toBe(0);
    expect(JSON.parse(major.stdout.toString())).toEqual({ should_release: true, version: "2.0.0" });

    const conflict = runRelease(fixture, ["plan", "--labels", "release:minor,release:major"]);
    expect(conflict.exitCode).not.toBe(0);

    // GitHub remote without --labels fails when gh api exits non-zero (never silently defaults to patch)
    runGit(fixture.repoDir, ["remote", "set-url", "origin", "https://github.com/example/demo-plan.git"]);
    writeFileSync(
      join(fixture.binDir, "gh"),
      "#!/usr/bin/env bash\necho 'gh api error' >&2\nexit 1\n",
    );
    chmodSync(join(fixture.binDir, "gh"), 0o755);
    const apiFail = runRelease(fixture, ["plan"]);
    expect(apiFail.exitCode).not.toBe(0);
    expect(apiFail.stderr.toString()).toContain("Failed to fetch PR labels");
  });

  test("publish formula (macos linux) batches squash commits into changelog, updates formula, tags, pushes, and is a no-op when already tagged", () => {
    const fixture = createFixture("demo-mcp");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "assets"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "src"), { recursive: true });

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
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
    commitAndPushInitial(fixture);
    runGit(fixture.repoDir, ["tag", "-a", "v0.1.0", "-m", "v0.1.0"]);

    // Batch two squash merges since v0.1.0
    writeFileSync(join(fixture.repoDir, "src", "a.cpp"), "// a\n");
    runGit(fixture.repoDir, ["add", "src/a.cpp"]);
    runGit(fixture.repoDir, ["commit", "-m", "feat: add Linux support", "-m", "Includes static libc++ linking."]);

    writeFileSync(join(fixture.repoDir, "src", "b.cpp"), "// b\n");
    runGit(fixture.repoDir, ["add", "src/b.cpp"]);
    runGit(fixture.repoDir, ["commit", "-m", "fix: handle empty config"]);

    const macBytes = "mac-tar-gz";
    const linuxBytes = "linux-tar-gz";
    writeFileSync(join(fixture.repoDir, "assets", "demo-mcp-arm64-macos.tar.gz"), macBytes);
    writeFileSync(join(fixture.repoDir, "assets", "demo-mcp-x64-linux.tar.gz"), linuxBytes);

    const res = runRelease(fixture, ["publish", "0.1.1", "assets"]);
    expect(res.exitCode).toBe(0);

    expect(readFileSync(join(fixture.repoDir, "VERSION"), "utf8")).toBe("0.1.1\n");
    const changelog = readFileSync(join(fixture.repoDir, "CHANGELOG.md"), "utf8");
    expect(changelog).toMatch(/^# Changelog\n\n## Unreleased\n\n## v0\.1\.1 - \d{4}-\d{2}-\d{2}\n\n/);
    expect(changelog).toContain("- fix: handle empty config");
    expect(changelog).toContain("- feat: add Linux support\n  Includes static libc++ linking.");

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

    // Repeated publish on already-tagged HEAD is a no-op
    const headAfterRelease = runGit(fixture.repoDir, ["rev-parse", "HEAD"]);
    const repeat = runRelease(fixture, ["publish", "0.1.1", "assets"]);
    expect(repeat.exitCode).toBe(0);
    expect(runGit(fixture.repoDir, ["rev-parse", "HEAD"])).toBe(headAfterRelease);
    expect(readGhCalls(fixture).length).toBe(1);
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
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
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
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
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

  test("publish library (single-port and multi-port) adds new versions entry without touching earlier entries", () => {
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

      // Seed an existing 1.0.0 versions entry to verify it is preserved
      mkdirSync(join(fixture.repoDir, "versions", "s-"), { recursive: true });
      const priorEntry = { "git-tree": "1111111111111111111111111111111111111111", version: "1.0.0", "port-version": 0 };
      writeFileSync(
        join(fixture.repoDir, "versions", "baseline.json"),
        `${JSON.stringify({ default: { "slimr-demo": { baseline: "1.0.0", "port-version": 0 } } }, null, 2)}\n`,
      );
      writeFileSync(
        join(fixture.repoDir, "versions", "s-", "slimr-demo.json"),
        `${JSON.stringify({ versions: [priorEntry] }, null, 2)}\n`,
      );
      writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos linux"\n`);
      writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
      commitAndPushInitial(fixture);
      runGit(fixture.repoDir, ["tag", "-a", "v1.0.0", "-m", "v1.0.0"]);

      writeFileSync(join(fixture.repoDir, "ports", "slimr-demo", "portfile.cmake"), "# updated portfile\n");
      runGit(fixture.repoDir, ["add", "ports/slimr-demo/portfile.cmake"]);
      runGit(fixture.repoDir, ["commit", "-m", "feat: add new API"]);

      const pubRes = runRelease(fixture, ["publish", "1.1.0"]);
      expect(pubRes.exitCode).toBe(0);

      const updatedManifest = readFileSync(join(fixture.repoDir, "ports", "slimr-demo", "vcpkg.json"), "utf8");
      expect(updatedManifest).toContain('"version": "1.1.0"');
      expect(readFileSync(join(fixture.repoDir, "CHANGELOG.md"), "utf8")).toContain("- feat: add new API");

      const versionFile = JSON.parse(
        readFileSync(join(fixture.repoDir, "versions", "s-", "slimr-demo.json"), "utf8"),
      ) as { versions: Array<{ version: string; "git-tree": string }> };
      expect(versionFile.versions.find((v) => v.version === "1.0.0")?.["git-tree"]).toBe(priorEntry["git-tree"]);
      expect(versionFile.versions.some((v) => v.version === "1.1.0")).toBe(true);

      const committedFiles = runGit(fixture.repoDir, ["show", "--name-only", "--format=", "HEAD"]).split("\n");
      expect(committedFiles).toContain("ports/slimr-demo/vcpkg.json");
      expect(committedFiles).toContain("CHANGELOG.md");
      expect(committedFiles).toContain("versions/baseline.json");
      expect(committedFiles).toContain("versions/s-/slimr-demo.json");

      const remoteTags = runGit(fixture.remoteDir, ["--git-dir=.", "tag"]);
      expect(remoteTags).toContain("v1.1.0");

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
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
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
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");

    const macBytes = "formula-mac-tar";
    writeFileSync(join(fixture.repoDir, "assets", "demo-formula-arm64-macos.tar.gz"), macBytes);
    commitAndPushInitial(fixture);

    const pubRes = runRelease(fixture, ["publish", "0.1.1", "assets"]);
    expect(pubRes.exitCode).toBe(0);

    const updatedFormula = readFileSync(join(fixture.repoDir, "Formula", "demo-formula.rb"), "utf8");
    expect(updatedFormula).toContain('version "0.1.1"');
    expect(updatedFormula).toContain(`sha256 "${sha256(macBytes)}"`);
    expect(readFileSync(join(fixture.repoDir, "Casks", "driver.rb"), "utf8")).toBe(caskInitial);

    const committedFiles = runGit(fixture.repoDir, ["show", "--name-only", "--format=", "HEAD"]).split("\n").sort();
    expect(committedFiles).toEqual(["CHANGELOG.md", "Formula/demo-formula.rb", "VERSION"]);

    const ghCalls = readGhCalls(fixture);
    expect(ghCalls.length).toBe(1);
    expect(ghCalls[0]).toContain("demo-formula-arm64-macos.tar.gz");
  }, 30_000);

  test("plan rejects multiple Formula/*.rb files even when Casks/*.rb exists", () => {
    const fixture = createFixture("multi-formula");
    mkdirSync(join(fixture.repoDir, "Formula"), { recursive: true });
    mkdirSync(join(fixture.repoDir, "Casks"), { recursive: true });
    writeFileSync(join(fixture.repoDir, "Formula", "one.rb"), "class One < Formula\nend\n");
    writeFileSync(join(fixture.repoDir, "Formula", "two.rb"), "class Two < Formula\nend\n");
    writeFileSync(join(fixture.repoDir, "Casks", "driver.rb"), 'cask "driver" do\nend\n');
    writeFileSync(join(fixture.repoDir, "VERSION"), "0.1.0\n");
    writeFileSync(join(fixture.repoDir, "justfile"), `platforms := "macos"\n`);
    writeFileSync(join(fixture.repoDir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
    commitAndPushInitial(fixture);

    const res = runRelease(fixture, ["plan"]);
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toContain("Expected exactly 1 Formula/*.rb file, found 2");
  });
});
