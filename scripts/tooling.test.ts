import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const SCRIPTS_DIR = import.meta.dir;

function runScript(script: string, args: string[], rootDir: string, cwd?: string) {
  const proc = Bun.spawnSync(["bun", path.join(SCRIPTS_DIR, script), ...args], {
    cwd: cwd ?? REPO_ROOT,
    env: { ...process.env, CPP_TEMPLATES_ROOT: rootDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString("utf8"),
    stderr: proc.stderr.toString("utf8"),
  };
}

function makeFixtureRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "cpp-templates-test-"));
  const baseDir = path.join(root, "base");
  const tmplDir = path.join(root, "templates", "fixture");

  mkdirSync(path.join(baseDir, ".github", "workflows"), { recursive: true });
  mkdirSync(path.join(baseDir, "scripts"), { recursive: true });
  writeFileSync(path.join(baseDir, ".clang-format"), "BasedOnStyle: LLVM\nIndentWidth: 4\n");
  writeFileSync(path.join(baseDir, ".github", "workflows", "test.yml"), "name: test\non: [workflow_dispatch, pull_request]\n");
  writeFileSync(path.join(baseDir, "scripts", "release.test.ts"), "// should not sync\n");
  writeFileSync(path.join(baseDir, "justfile"), "# base justfile should not overwrite template justfile\n");
  writeFileSync(
    path.join(baseDir, "AGENTS.md"),
    "# Base\n\n<!-- cpp-templates:begin -->\n## Template rules v2\n- rule one\n<!-- cpp-templates:end -->\n",
  );

  mkdirSync(path.join(tmplDir, "config"), { recursive: true });
  mkdirSync(path.join(tmplDir, "scripts"), { recursive: true });
  mkdirSync(path.join(tmplDir, "src"), { recursive: true });
  writeFileSync(
    path.join(tmplDir, "manifest.json"),
    JSON.stringify({
      verbatim: [".clang-format", "config/__NAME__.txt", "scripts/run.sh"],
      blocks: ["AGENTS.md"],
      seed: ["src/main.cpp"],
      recipes: ["build", "hello"],
    }),
  );
  writeFileSync(path.join(tmplDir, ".clang-format"), "BasedOnStyle: LLVM\nIndentWidth: 4\n");
  writeFileSync(path.join(tmplDir, "config", "__NAME__.txt"), "name=__NAME__\ndesc=__DESC__\n");
  writeFileSync(path.join(tmplDir, "scripts", "run.sh"), "#!/usr/bin/env bash\necho __NAME__\n");
  chmodSync(path.join(tmplDir, "scripts", "run.sh"), 0o755);
  writeFileSync(path.join(tmplDir, "src", "main.cpp"), "// seed __NAME__ __PORT__\n");
  writeFileSync(
    path.join(tmplDir, "AGENTS.md"),
    "# Repo notes\n\n<!-- cpp-templates:begin -->\n## Template rules v2\n- rule one\n<!-- cpp-templates:end -->\n\nKeep me.\n",
  );
  writeFileSync(
    path.join(tmplDir, "justfile"),
    [
      'formula := "__NAME__"',
      'endpoint := "http://127.0.0.1:__PORT__/mcp"',
      "",
      "# Build the project",
      "build:",
      '    echo "building {{formula}}"',
      "",
      "# Say hello",
      "hello:",
      '    echo "hello {{formula}} at {{endpoint}}"',
      "",
    ].join("\n"),
  );

  return root;
}

describe("cpp-templates tooling", () => {
  test("new renders fixture with substitutions, mode preservation, and non-empty guard", () => {
    const root = makeFixtureRoot();
    try {
      const target = path.join(root, "out", "demo-app");
      const res = runScript("new.ts", ["fixture", "demo-app", target, "--port", "10042", "--desc", "Demo App"], root);
      expect(res.exitCode).toBe(0);
      expect(existsSync(path.join(target, "manifest.json"))).toBe(false);
      expect(readFileSync(path.join(target, "config", "demo-app.txt"), "utf8")).toBe("name=demo-app\ndesc=Demo App\n");
      expect(readFileSync(path.join(target, "src", "main.cpp"), "utf8")).toBe("// seed demo-app 10042\n");
      expect(readFileSync(path.join(target, ".clang-format"), "utf8")).toBe("BasedOnStyle: LLVM\nIndentWidth: 4\n");
      expect((statSync(path.join(target, "scripts", "run.sh")).mode & 0o111) !== 0).toBe(true);

      const nonEmpty = runScript("new.ts", ["fixture", "demo-app", target], root);
      expect(nonEmpty.exitCode).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("check passes on rendered tree, seed edits, extra recipes, var edits, and just --fmt", () => {
    const root = makeFixtureRoot();
    try {
      const target = path.join(root, "out", "demo-app");
      expect(runScript("new.ts", ["fixture", "demo-app", target, "--port", "10042"], root).exitCode).toBe(0);
      expect(runScript("check.ts", ["fixture", target], root).exitCode).toBe(0);

      writeFileSync(path.join(target, "src", "main.cpp"), "// customized seed\n");
      const justPath = path.join(target, "justfile");
      writeFileSync(
        justPath,
        readFileSync(justPath, "utf8").replace("10042", "10099") + "\n# Repo-specific recipe\nextra:\n    echo ok\n",
      );
      const fmtProc = Bun.spawnSync(["just", "--fmt", "--unstable", "--justfile", justPath], { stdout: "pipe", stderr: "pipe" });
      expect(fmtProc.exitCode).toBe(0);

      const clean = runScript("check.ts", ["fixture", target], root);
      expect(clean.exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("check fails with diff on verbatim, block, and recipe mutations", () => {
    const root = makeFixtureRoot();
    try {
      const target = path.join(root, "out", "demo-app");
      expect(runScript("new.ts", ["fixture", "demo-app", target], root).exitCode).toBe(0);

      // Verbatim dotfile mutation
      writeFileSync(path.join(target, ".clang-format"), "BasedOnStyle: Google\n");
      let res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain(".clang-format");

      // Missing verbatim file
      rmSync(path.join(target, "config", "demo-app.txt"));
      res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("missing verbatim file");

      // Block mutation and missing marker
      writeFileSync(path.join(target, "AGENTS.md"), "# Repo notes\n\n<!-- cpp-templates:begin -->\nchanged\n<!-- cpp-templates:end -->\n");
      res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("block mismatch");

      writeFileSync(path.join(target, "AGENTS.md"), "# Repo notes\nno markers\n");
      res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("block error");

      // Recipe body/doc mutation and missing recipe
      const justPath = path.join(target, "justfile");
      const origJust = readFileSync(justPath, "utf8");
      writeFileSync(justPath, origJust.replace("# Say hello", "# Changed doc").replace("hello {{formula}}", "bye {{formula}}"));
      res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("recipe mismatch for 'hello'");

      writeFileSync(justPath, 'formula := "demo-app"\nbuild:\n    echo ok\n');
      res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("missing recipe");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("sync propagates base files and AGENTS block while skipping tests and template-owned files", () => {
    const root = makeFixtureRoot();
    try {
      const tmplDir = path.join(root, "templates", "fixture");
      writeFileSync(path.join(tmplDir, "AGENTS.md"), "# Repo notes\n\n<!-- cpp-templates:begin -->\nold\n<!-- cpp-templates:end -->\n\nKeep me.\n");
      const origJust = readFileSync(path.join(tmplDir, "justfile"), "utf8");

      const beforeCheck = runScript("sync.ts", ["--check"], root);
      expect(beforeCheck.exitCode).toBe(1);

      const syncRes = runScript("sync.ts", [], root);
      expect(syncRes.exitCode).toBe(0);

      expect(readFileSync(path.join(tmplDir, ".github", "workflows", "test.yml"), "utf8")).toContain("workflow_dispatch");
      expect(existsSync(path.join(tmplDir, "scripts", "release.test.ts"))).toBe(false);
      expect(readFileSync(path.join(tmplDir, "justfile"), "utf8")).toBe(origJust);
      const agents = readFileSync(path.join(tmplDir, "AGENTS.md"), "utf8");
      expect(agents).toContain("## Template rules v2");
      expect(agents).toContain("Keep me.");

      const afterCheck = runScript("sync.ts", ["--check"], root);
      expect(afterCheck.exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("derives __CLASS__ from __NAME__ in new and check", () => {
    const root = makeFixtureRoot();
    try {
      const tmplDir = path.join(root, "templates", "fixture");
      mkdirSync(path.join(tmplDir, "Formula"), { recursive: true });
      writeFileSync(path.join(tmplDir, "Formula", "__NAME__.rb"), "class __CLASS__ < Formula\nend\n");
      const manifest = JSON.parse(readFileSync(path.join(tmplDir, "manifest.json"), "utf8")) as {
        verbatim: string[];
        blocks: string[];
        seed: string[];
        recipes: string[];
      };
      manifest.verbatim.push("Formula/__NAME__.rb");
      writeFileSync(path.join(tmplDir, "manifest.json"), JSON.stringify(manifest));

      for (const [pkg, expectedClass] of [
        ["gdocsmith-mcp", "GdocsmithMcp"],
        ["fixture", "Fixture"],
        ["foo_bar.baz", "FooBarBaz"],
        ["foo+bar@2", "FooxbarAT2"],
      ]) {
        const target = path.join(root, "out", pkg);
        expect(runScript("new.ts", ["fixture", pkg, target], root).exitCode).toBe(0);
        expect(readFileSync(path.join(target, "Formula", `${pkg}.rb`), "utf8")).toBe(
          `class ${expectedClass} < Formula\nend\n`,
        );
        expect(runScript("check.ts", ["fixture", target], root).exitCode).toBe(0);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ignores inline block markers in prose during sync and check", () => {
    const root = makeFixtureRoot();
    try {
      const block = [
        "<!-- cpp-templates:begin -->",
        "Keep rules outside `<!-- cpp-templates:begin -->` and `<!-- cpp-templates:end -->`.",
        "<!-- cpp-templates:end -->",
      ].join("\n");
      writeFileSync(path.join(root, "base", "AGENTS.md"), `# Base\n\n${block}\n`);
      writeFileSync(
        path.join(root, "templates", "fixture", "AGENTS.md"),
        "# Repo\n\n<!-- cpp-templates:begin -->\nold\n<!-- cpp-templates:end -->\n\nKeep me.\n",
      );

      expect(runScript("sync.ts", [], root).exitCode).toBe(0);
      expect(runScript("sync.ts", ["--check"], root).exitCode).toBe(0);

      const target = path.join(root, "out", "demo-app");
      expect(runScript("new.ts", ["fixture", "demo-app", target], root).exitCode).toBe(0);
      expect(runScript("check.ts", ["fixture", target], root).exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("enforces template-owned assignments and settings while ignoring per-repo vars", () => {
    const root = makeFixtureRoot();
    try {
      const tmplJust = path.join(root, "templates", "fixture", "justfile");
      const baseJust = [
        'set shell := ["bash", "-eu", "-o", "pipefail", "-c"]',
        "set positional-arguments",
        "",
        'formula := "__NAME__"',
        'platforms := "macos linux"',
        'llvm := env("LLVM_BIN", "/opt/homebrew/opt/llvm@23/bin")',
        "",
        "build:",
        '    echo "building {{formula}}"',
        "",
        "hello:",
        '    echo "hello {{formula}}"',
        "",
      ].join("\n");
      writeFileSync(tmplJust, baseJust);

      const target = path.join(root, "out", "demo-app");
      expect(runScript("new.ts", ["fixture", "demo-app", target], root).exitCode).toBe(0);
      expect(runScript("check.ts", ["fixture", target], root).exitCode).toBe(0);

      // Mutating per-repo var `platforms` stays clean
      const targetJust = path.join(target, "justfile");
      const origTarget = readFileSync(targetJust, "utf8");
      writeFileSync(targetJust, origTarget.replace('platforms := "macos linux"', 'platforms := "macos"'));
      expect(runScript("check.ts", ["fixture", target], root).exitCode).toBe(0);

      // Mutating template-owned `llvm` fails naming `llvm`
      writeFileSync(targetJust, origTarget.replace("llvm@23", "llvm@22"));
      let res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("llvm");

      // Mutating `set shell` fails naming `shell`
      writeFileSync(targetJust, origTarget.replace('"-eu", "-o", "pipefail", ', ""));
      res = runScript("check.ts", ["fixture", target], root);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("shell");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
