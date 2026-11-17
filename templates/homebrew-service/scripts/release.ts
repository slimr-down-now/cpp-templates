import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { $ } from "bun";
import {
  applyBump, assertSemver, assetFilename, type Bump, bumpFromLabels, detectRepo, errorMessage,
  extractChangelogNotes, isDocsOnlyFiles, type PlatformAsset, promoteChangelog, readPlatforms,
  readVersion, type RepoInfo, resolveGitHubRepo, retargetChangelog, sha256File, updateCaskRuby,
  updateFormulaRuby,
} from "./formula-shared.ts";

type Command =
  | { kind: "classify"; files: string[] }
  | { kind: "next"; bump: Bump }
  | { kind: "prep"; base?: string; labels: string[]; commit: boolean }
  | { kind: "publish"; version: string; assetsDir: string };

export function parseArgs(args: string[]): Command {
  if (args[0] === "classify") {
    return { kind: "classify", files: args.slice(1) };
  }
  if (args[0] === "next" && args.length === 2) {
    const bump = args[1];
    if (bump === "major" || bump === "minor" || bump === "patch") {
      return { kind: "next", bump };
    }
  }
  if (args[0] === "prep") {
    let base: string | undefined;
    let labels: string[] = [];
    let commit = false;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--base") {
        base = args[++i];
        if (!base) throw new Error("--base requires a value");
      } else if (args[i] === "--labels") {
        const raw = args[++i] ?? "";
        labels = raw.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (args[i] === "--commit") {
        commit = true;
      } else {
        throw new Error(`Unknown prep argument: ${args[i]}`);
      }
    }
    return { kind: "prep", base, labels, commit };
  }
  if (args[0] === "publish" && (args.length === 2 || args.length === 3)) {
    return { kind: "publish", version: args[1], assetsDir: args[2] ?? "dist" };
  }
  throw new Error(
    "Usage: release.ts <classify <files...> | next <major|minor|patch> | prep [--base <ref>] [--labels <csv>] [--commit] | publish <version> [assets-dir]>",
  );
}

function readVersionText(repo: RepoInfo, raw: string, label: string): string {
  if (repo.kind === "library") {
    const manifest = JSON.parse(raw) as { version?: unknown };
    if (typeof manifest.version !== "string") {
      throw new Error(`${label} must contain a string "version" field.`);
    }
    return assertSemver(manifest.version, label);
  }
  return assertSemver(raw, label);
}

function readCurrentVersion(repoRoot: string, repo: RepoInfo): string {
  const versionPath = repo.kind === "library" ? repo.portManifestPath! : join(repoRoot, "VERSION");
  return readVersionText(repo, readFileSync(versionPath, "utf8"), versionPath);
}

async function readBaseVersion(repoRoot: string, repo: RepoInfo, baseRef?: string): Promise<string> {
  if (!baseRef) return readCurrentVersion(repoRoot, repo);
  const relPath = repo.kind === "library" ? relative(repoRoot, repo.portManifestPath!) : "VERSION";
  const res = await $`git show ${`${baseRef}:${relPath}`}`.cwd(repoRoot).nothrow().quiet();
  if (res.exitCode !== 0) {
    return readCurrentVersion(repoRoot, repo);
  }
  return readVersionText(repo, res.stdout.toString(), `${baseRef}:${relPath}`);
}

async function readBaseChangelogNotes(repoRoot: string, baseRef: string | undefined, version: string): Promise<string | null> {
  if (!baseRef) return null;
  const res = await $`git show ${`${baseRef}:CHANGELOG.md`}`.cwd(repoRoot).nothrow().quiet();
  if (res.exitCode !== 0) return null;
  try {
    return extractChangelogNotes(res.stdout.toString(), version);
  } catch {
    return null;
  }
}

async function readPortTreeSha(repoRoot: string, name: string): Promise<string | null> {
  const res = await $`git rev-parse ${`HEAD:ports/${name}`}`.cwd(repoRoot).nothrow().quiet();
  if (res.exitCode !== 0) return null;
  return res.stdout.toString().trim() || null;
}

function hasLibraryVersionEntry(repoRoot: string, name: string, version: string, portTreeSha: string | null): boolean {
  const baselinePath = join(repoRoot, "versions", "baseline.json");
  const entryPath = join(repoRoot, "versions", `${name.charAt(0)}-`, `${name}.json`);
  if (!existsSync(baselinePath) || !existsSync(entryPath)) return false;
  try {
    const entry = JSON.parse(readFileSync(entryPath, "utf8")) as {
      versions?: Array<{ version?: string; "git-tree"?: string }>;
    };
    return (
      Array.isArray(entry.versions) &&
      entry.versions.some((v) => v.version === version && (portTreeSha === null || v["git-tree"] === portTreeSha))
    );
  } catch {
    return false;
  }
}

function removeLibraryVersionEntry(repoRoot: string, name: string, version: string): void {
  const entryPath = join(repoRoot, "versions", `${name.charAt(0)}-`, `${name}.json`);
  if (!existsSync(entryPath)) return;
  const entry = JSON.parse(readFileSync(entryPath, "utf8")) as {
    versions?: Array<{ version?: string; [k: string]: unknown }>;
  };
  if (!Array.isArray(entry.versions)) return;
  const filtered = entry.versions.filter((v) => v.version !== version);
  if (filtered.length !== entry.versions.length) {
    writeFileSync(entryPath, `${JSON.stringify({ versions: filtered }, null, 2)}\n`);
  }
}

async function runNext(repoRoot: string, bump: Bump): Promise<void> {
  const repo = detectRepo(repoRoot);
  const current = readCurrentVersion(repoRoot, repo);
  const nextVersion = applyBump(current, bump);
  const changelogPath = join(repoRoot, "CHANGELOG.md");
  promoteChangelog(readFileSync(changelogPath, "utf8"), nextVersion, new Date().toISOString().slice(0, 10));
  process.stdout.write(`${nextVersion}\n`);
}

async function runPrep(repoRoot: string, base: string | undefined, labels: string[], commit: boolean): Promise<void> {
  const repo = detectRepo(repoRoot);
  const bump = bumpFromLabels(labels);
  const baseVersion = await readBaseVersion(repoRoot, repo, base);
  const expectedVersion = applyBump(baseVersion, bump);
  const currentVersion = readCurrentVersion(repoRoot, repo);
  const changelogPath = join(repoRoot, "CHANGELOG.md");
  const changelogRaw = readFileSync(changelogPath, "utf8");
  const date = new Date().toISOString().slice(0, 10);

  let changelogReady = false;
  try {
    extractChangelogNotes(changelogRaw, expectedVersion);
    changelogReady = true;
  } catch {
    changelogReady = false;
  }

  const portTreeSha = repo.kind === "library" ? await readPortTreeSha(repoRoot, repo.name) : null;
  const versionsReady =
    repo.kind !== "library" || hasLibraryVersionEntry(repoRoot, repo.name, expectedVersion, portTreeSha);
  if (currentVersion === expectedVersion && changelogReady && versionsReady) {
    console.log(`already_prepped=${expectedVersion}`);
    return;
  }

  if (currentVersion === expectedVersion && changelogReady && !versionsReady && repo.kind === "library") {
    if (commit) {
      mkdirSync(join(repoRoot, "versions"), { recursive: true });
      await $`vcpkg x-add-version ${repo.name} ${`--x-builtin-ports-root=${join(repoRoot, "ports")}`} ${`--x-builtin-registry-versions-dir=${join(repoRoot, "versions")}`} --overwrite-version --verbose`
        .cwd(repoRoot)
        .quiet();
      await $`git add -- versions`.cwd(repoRoot).quiet();
      await $`git commit -m ${`Release prep v${expectedVersion}`}`.cwd(repoRoot).quiet();
    }
    console.log(`bumped=${expectedVersion}`);
    return;
  }

  let currentNotes: string | null = null;
  try {
    currentNotes = extractChangelogNotes(changelogRaw, currentVersion);
  } catch {
    currentNotes = null;
  }
  const baseCurrentNotes = base ? await readBaseChangelogNotes(repoRoot, base, currentVersion) : currentNotes;
  const canRetarget =
    currentVersion !== expectedVersion &&
    currentNotes !== null &&
    (currentVersion !== baseVersion || (baseCurrentNotes !== null && baseCurrentNotes !== currentNotes));
  const changelog = canRetarget
    ? retargetChangelog(changelogRaw, currentVersion, expectedVersion, date)
    : promoteChangelog(changelogRaw, expectedVersion, date).changelog;
  writeFileSync(changelogPath, changelog);

  if (repo.kind === "library") {
    const manifestPath = repo.portManifestPath!;
    const manifestRaw = readFileSync(manifestPath, "utf8");
    if (!/"version"\s*:\s*"[^"]*"/.test(manifestRaw)) {
      throw new Error(`${manifestPath} must contain a "version" field.`);
    }
    writeFileSync(manifestPath, manifestRaw.replace(/("version"\s*:\s*)"[^"]*"/, `$1${JSON.stringify(expectedVersion)}`));
    if (canRetarget) {
      removeLibraryVersionEntry(repoRoot, repo.name, currentVersion);
    }
    if (commit) {
      const toStage = [relative(repoRoot, manifestPath), "CHANGELOG.md"];
      if (canRetarget && existsSync(join(repoRoot, "versions"))) {
        toStage.push("versions");
      }
      await $`git add -- ${toStage}`.cwd(repoRoot).quiet();
      await $`git commit -m ${`Release prep v${expectedVersion}`}`.cwd(repoRoot).quiet();
      mkdirSync(join(repoRoot, "versions"), { recursive: true });
      await $`vcpkg x-add-version ${repo.name} ${`--x-builtin-ports-root=${join(repoRoot, "ports")}`} ${`--x-builtin-registry-versions-dir=${join(repoRoot, "versions")}`} --overwrite-version --verbose`
        .cwd(repoRoot)
        .quiet();
      await $`git add -- versions`.cwd(repoRoot).quiet();
      await $`git commit --amend --no-edit`.cwd(repoRoot).quiet();
    }
  } else {
    writeFileSync(join(repoRoot, "VERSION"), `${expectedVersion}\n`);
    if (commit) {
      await $`git add -- VERSION CHANGELOG.md`.cwd(repoRoot).quiet();
      await $`git commit -m ${`Release prep v${expectedVersion}`}`.cwd(repoRoot).quiet();
    }
  }
  console.log(`bumped=${expectedVersion}`);
}

async function runPublish(repoRoot: string, versionArg: string, assetsDirArg: string): Promise<void> {
  const version = assertSemver(versionArg, "Release version");
  const tag = `v${version}`;
  const repo = detectRepo(repoRoot);
  const currentVersion = readCurrentVersion(repoRoot, repo);
  if (currentVersion !== version) {
    throw new Error(`Expected repo version ${version}, found ${currentVersion}. Run prep in the PR before publishing.`);
  }

  const changelogPath = join(repoRoot, "CHANGELOG.md");
  const notes = extractChangelogNotes(readFileSync(changelogPath, "utf8"), version);

  const top = (await $`git rev-parse --show-toplevel`.cwd(repoRoot).quiet().text()).trim();
  if (realpathSync(top) !== realpathSync(repoRoot)) {
    throw new Error("Run releases from the repository root.");
  }
  await $`git rev-parse --verify HEAD`.cwd(repoRoot).quiet();
  const origin = (await $`git remote get-url origin`.cwd(repoRoot).quiet().text()).trim();
  const branch = (await $`git symbolic-ref --short HEAD`.cwd(repoRoot).quiet().text()).trim();

  const localTag = await $`git show-ref --verify --quiet ${`refs/tags/${tag}`}`.cwd(repoRoot).nothrow().quiet();
  if (localTag.exitCode === 0) throw new Error(`${tag} already exists locally.`);
  if (localTag.exitCode !== 1) throw new Error(`Cannot check local tag ${tag}.`);
  const remoteTag = await $`git ls-remote --exit-code origin ${`refs/tags/${tag}`}`.cwd(repoRoot).nothrow().quiet();
  if (remoteTag.exitCode === 0) throw new Error(`${tag} already exists on origin.`);
  if (remoteTag.exitCode !== 2) throw new Error(`Cannot check remote tag ${tag}: ${remoteTag.stderr.toString()}`);

  const assetsDir = resolve(repoRoot, assetsDirArg);
  const assetPaths: string[] = [];
  let ownerRepo: string | null = null;

  if (repo.kind === "formula") {
    const platforms = readPlatforms(repoRoot, "formula");
    const rubyPath = repo.rubyPath!;
    const rubyContent = readFileSync(rubyPath, "utf8");
    ownerRepo = resolveGitHubRepo(origin, rubyContent);
    if (!ownerRepo) throw new Error("Cannot determine GitHub owner/repo from origin or Formula homepage.");
    const repoUrl = `https://github.com/${ownerRepo}`;

    let macosAsset: PlatformAsset | undefined;
    let linuxAsset: PlatformAsset | undefined;
    for (const platform of platforms) {
      const assetName = assetFilename(repo.name, "formula", platform);
      const assetPath = join(assetsDir, assetName);
      if (!existsSync(assetPath)) throw new Error(`Missing release asset: ${assetPath}`);
      assetPaths.push(assetPath);
      const asset = { assetName, sha256: sha256File(assetPath) };
      if (platform === "macos") macosAsset = asset;
      else linuxAsset = asset;
    }

    writeFileSync(rubyPath, updateFormulaRuby(rubyContent, { version, repoUrl, macos: macosAsset, linux: linuxAsset }));
    await $`git add -- ${`Formula/${repo.name}.rb`}`.cwd(repoRoot).quiet();
    await $`git commit -m ${`Release ${tag}`}`.cwd(repoRoot).quiet();
    await $`git tag -a ${tag} -m ${tag}`.cwd(repoRoot).quiet();
    await $`git push --atomic origin ${`HEAD:refs/heads/${branch}`} ${`refs/tags/${tag}`}`.cwd(repoRoot).quiet();
  } else if (repo.kind === "cask") {
    readPlatforms(repoRoot, "cask");
    const rubyPath = repo.rubyPath!;
    const rubyContent = readFileSync(rubyPath, "utf8");
    ownerRepo = resolveGitHubRepo(origin, rubyContent);
    if (!ownerRepo) throw new Error("Cannot determine GitHub owner/repo from origin or Cask homepage.");
    const repoUrl = `https://github.com/${ownerRepo}`;

    const matches = (["pkg", "dmg", "zip"] as const)
      .map((ext) => assetFilename(repo.name, "cask", "macos", ext))
      .filter((name) => existsSync(join(assetsDir, name)));
    if (matches.length !== 1) {
      throw new Error(`Expected exactly 1 cask asset (.pkg/.dmg/.zip) in ${assetsDir}, found ${matches.length}.`);
    }
    const assetName = matches[0];
    const assetPath = join(assetsDir, assetName);
    assetPaths.push(assetPath);

    writeFileSync(rubyPath, updateCaskRuby(rubyContent, { version, repoUrl, assetName, sha256: sha256File(assetPath) }));
    await $`git add -- ${`Casks/${repo.name}.rb`}`.cwd(repoRoot).quiet();
    await $`git commit -m ${`Release ${tag}`}`.cwd(repoRoot).quiet();
    await $`git tag -a ${tag} -m ${tag}`.cwd(repoRoot).quiet();
    await $`git push --atomic origin ${`HEAD:refs/heads/${branch}`} ${`refs/tags/${tag}`}`.cwd(repoRoot).quiet();
  } else {
    ownerRepo = resolveGitHubRepo(origin);
    await $`git tag -a ${tag} -m ${tag}`.cwd(repoRoot).quiet();
    await $`git push origin ${`refs/tags/${tag}`}`.cwd(repoRoot).quiet();
  }

  const notesPath = join(repoRoot, ".git", "release-notes.md");
  writeFileSync(notesPath, notes);
  try {
    const ghArgs = [
      "release",
      "create",
      tag,
      ...assetPaths,
      ...(ownerRepo ? ["--repo", ownerRepo] : []),
      "--verify-tag",
      "--title",
      tag,
      "--notes-file",
      notesPath,
    ];
    await $`gh ${ghArgs}`.cwd(repoRoot).quiet();
  } finally {
    rmSync(notesPath, { force: true });
  }
  console.log(`Released ${tag}`);
}

async function main(): Promise<void> {
  const command = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  if (command.kind === "classify") {
    process.stdout.write(`${isDocsOnlyFiles(command.files)}\n`);
  } else if (command.kind === "next") {
    await runNext(repoRoot, command.bump);
  } else if (command.kind === "prep") {
    await runPrep(repoRoot, command.base, command.labels, command.commit);
  } else {
    await runPublish(repoRoot, command.version, command.assetsDir);
  }
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(`Release stopped: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
