import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function die(msg: string): never {
  console.error(`new: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const positional: string[] = [];
let port = "10000";
let desc: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--port") {
    port = args[++i] ?? die("--port requires a value");
  } else if (arg === "--desc") {
    desc = args[++i] ?? die("--desc requires a value");
  } else if (arg.startsWith("-")) {
    die(`unknown flag: ${arg}`);
  } else {
    positional.push(arg);
  }
}

if (positional.length !== 3) {
  die("usage: bun scripts/new.ts <template> <name> <target-dir> [--port <port>] [--desc <desc>]");
}

const [templateName, name, targetArg] = positional;
if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
  die(`invalid project name: ${JSON.stringify(name)}`);
}
const finalDesc = desc ?? name;

const rootDir = process.env.CPP_TEMPLATES_ROOT ?? path.resolve(import.meta.dir, "..");
const templateDir = path.join(rootDir, "templates", templateName);
const manifestPath = path.join(templateDir, "manifest.json");
if (!existsSync(manifestPath)) {
  die(`template not found or missing manifest.json: ${manifestPath}`);
}

const targetDir = path.resolve(process.cwd(), targetArg);
if (existsSync(targetDir)) {
  if (!statSync(targetDir).isDirectory()) {
    die(`target exists and is not a directory: ${targetDir}`);
  }
  if (readdirSync(targetDir).length > 0) {
    die(`target directory is not empty: ${targetDir}`);
  }
}

const sub = (input: string): string =>
  input.replaceAll("__NAME__", name).replaceAll("__PORT__", port).replaceAll("__DESC__", finalDesc);

mkdirSync(targetDir, { recursive: true });

const files = [...new Bun.Glob("**/*").scanSync({ cwd: templateDir, dot: true, onlyFiles: true })].sort();
for (const rel of files) {
  if (rel === "manifest.json" || rel.startsWith(".git/") || rel.startsWith("build/")) {
    continue;
  }
  const srcPath = path.join(templateDir, rel);
  const destPath = path.join(targetDir, sub(rel));
  const content = sub(readFileSync(srcPath, "utf8"));
  mkdirSync(path.dirname(destPath), { recursive: true });
  writeFileSync(destPath, content, "utf8");
  chmodSync(destPath, statSync(srcPath).mode & 0o777);
}
