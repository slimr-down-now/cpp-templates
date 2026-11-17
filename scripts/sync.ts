import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const BEGIN_MARKER = "<!-- cpp-templates:begin -->";
const END_MARKER = "<!-- cpp-templates:end -->";
const BLOCK_FILES = new Set(["AGENTS.md", "docs/contributing.md"]);
const TEMPLATE_OWNED = new Set([
  "justfile",
  "CMakeLists.txt",
  "vcpkg.json",
  "vcpkg-configuration.json",
  "README.md",
  "CHANGELOG.md",
  "manifest.json",
]);

function die(msg: string): never {
  console.error(`sync: ${msg}`);
  process.exit(1);
}

function findBlockRange(text: string): { start: number; end: number } | null {
  const begins = [...text.matchAll(/^<!-- cpp-templates:begin -->$/gm)];
  const ends = [...text.matchAll(/^<!-- cpp-templates:end -->$/gm)];
  if (begins.length !== 1 || ends.length !== 1) {
    return null;
  }
  const start = begins[0].index!;
  const end = ends[0].index! + ends[0][0].length;
  if (start >= end) {
    return null;
  }
  return { start, end };
}

const args = process.argv.slice(2);
let checkOnly = false;
for (const arg of args) {
  if (arg === "--check") {
    checkOnly = true;
  } else {
    die(`unknown argument: ${arg}`);
  }
}

const rootDir = process.env.CPP_TEMPLATES_ROOT ?? path.resolve(import.meta.dir, "..");
const baseDir = path.join(rootDir, "base");
const templatesDir = path.join(rootDir, "templates");

if (!existsSync(baseDir) || !existsSync(templatesDir)) {
  process.exit(0);
}

const templates = readdirSync(templatesDir)
  .filter((name) => statSync(path.join(templatesDir, name)).isDirectory())
  .sort();
if (templates.length === 0) {
  process.exit(0);
}

const baseFiles = [...new Bun.Glob("**/*").scanSync({ cwd: baseDir, dot: true, onlyFiles: true })].sort();
const drifts: string[] = [];

for (const tmpl of templates) {
  const tmplDir = path.join(templatesDir, tmpl);
  for (const rel of baseFiles) {
    if (TEMPLATE_OWNED.has(rel) || (rel.startsWith("scripts/") && rel.endsWith(".test.ts"))) {
      continue;
    }
    const srcPath = path.join(baseDir, rel);
    const destPath = path.join(tmplDir, rel);
    const srcContent = readFileSync(srcPath, "utf8");
    const srcMode = statSync(srcPath).mode & 0o777;

    if (BLOCK_FILES.has(rel)) {
      const baseRange = findBlockRange(srcContent);
      if (!baseRange) {
        die(`base/${rel} is missing valid cpp-templates block markers`);
      }
      const baseBlock = srcContent.slice(baseRange.start, baseRange.end);
      if (!existsSync(destPath)) {
        if (checkOnly) {
          drifts.push(`missing ${tmpl}/${rel}`);
        } else {
          mkdirSync(path.dirname(destPath), { recursive: true });
          writeFileSync(destPath, srcContent, "utf8");
          chmodSync(destPath, srcMode);
        }
        continue;
      }
      const destContent = readFileSync(destPath, "utf8");
      const destRange = findBlockRange(destContent);
      if (!destRange) {
        drifts.push(`${tmpl}/${rel} is missing valid cpp-templates block markers`);
        continue;
      }
      const destBlock = destContent.slice(destRange.start, destRange.end);
      if (destBlock !== baseBlock) {
        if (checkOnly) {
          drifts.push(`block drift in ${tmpl}/${rel}`);
        } else {
          const updated = destContent.slice(0, destRange.start) + baseBlock + destContent.slice(destRange.end);
          writeFileSync(destPath, updated, "utf8");
        }
      }
      continue;
    }

    if (!existsSync(destPath)) {
      if (checkOnly) {
        drifts.push(`missing ${tmpl}/${rel}`);
      } else {
        mkdirSync(path.dirname(destPath), { recursive: true });
        writeFileSync(destPath, srcContent, "utf8");
        chmodSync(destPath, srcMode);
      }
      continue;
    }

    const destContent = readFileSync(destPath, "utf8");
    const srcExec = (srcMode & 0o111) !== 0;
    const destExec = (statSync(destPath).mode & 0o111) !== 0;
    if (destContent !== srcContent || srcExec !== destExec) {
      if (checkOnly) {
        drifts.push(`drift in ${tmpl}/${rel}`);
      } else {
        writeFileSync(destPath, srcContent, "utf8");
        chmodSync(destPath, srcMode);
      }
    }
  }
}

if (drifts.length > 0) {
  for (const d of drifts) {
    console.error(d);
  }
  process.exit(1);
}
