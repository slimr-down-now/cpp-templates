import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

interface Manifest {
  verbatim: string[];
  blocks: string[];
  seed: string[];
  recipes: string[];
}

interface JustAssignment {
  value?: unknown;
}

interface JustRecipe {
  body?: unknown;
  dependencies?: unknown;
  parameters?: unknown;
  shebang?: unknown;
  doc?: unknown;
  private?: unknown;
  quiet?: unknown;
}

interface JustDump {
  assignments?: Record<string, JustAssignment>;
  recipes?: Record<string, JustRecipe>;
}

const BEGIN_MARKER = "<!-- cpp-templates:begin -->";
const END_MARKER = "<!-- cpp-templates:end -->";

function die(msg: string): never {
  console.error(`check: ${msg}`);
  process.exit(1);
}

function lineDiff(label: string, expected: string, actual: string): string {
  const expLines = expected.split("\n");
  const actLines = actual.split("\n");
  const max = Math.max(expLines.length, actLines.length);
  const out: string[] = [`--- expected (${label})`, `+++ actual (${label})`];
  for (let i = 0; i < max; i++) {
    const e = expLines[i];
    const a = actLines[i];
    if (e !== a) {
      if (e !== undefined) out.push(`-${i + 1}: ${e}`);
      if (a !== undefined) out.push(`+${i + 1}: ${a}`);
    }
  }
  return out.join("\n");
}

function extractBlock(text: string): { ok: true; block: string } | { ok: false; error: string } {
  const begins = [...text.matchAll(/^<!-- cpp-templates:begin -->$/gm)];
  const ends = [...text.matchAll(/^<!-- cpp-templates:end -->$/gm)];
  if (begins.length === 0 || ends.length === 0) {
    return { ok: false, error: `missing ${BEGIN_MARKER} or ${END_MARKER}` };
  }
  if (begins.length !== 1 || ends.length !== 1 || begins[0].index! >= ends[0].index!) {
    return { ok: false, error: "malformed or duplicate cpp-templates block markers" };
  }
  const start = begins[0].index!;
  const end = ends[0].index! + ends[0][0].length;
  return { ok: true, block: text.slice(start, end) };
}

function dumpJustfile(args: string[], stdin?: string): JustDump {
  const proc = Bun.spawnSync(["just", "--dump", "--dump-format", "json", ...args], {
    stdin: stdin !== undefined ? Buffer.from(stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    die(`just --dump failed: ${proc.stderr.toString("utf8").trim()}`);
  }
  try {
    return JSON.parse(proc.stdout.toString("utf8")) as JustDump;
  } catch (err) {
    die(`failed to parse just --dump JSON: ${String(err)}`);
  }
}

function inferName(targetDir: string, assignments: Record<string, JustAssignment>): string {
  for (const key of ["formula", "cask", "name"]) {
    const val = assignments[key]?.value;
    if (typeof val === "string" && val.length > 0) return val;
  }
  const ports = [...new Bun.Glob("ports/*/vcpkg.json").scanSync({ cwd: targetDir, onlyFiles: true })];
  if (ports.length === 1) return path.basename(path.dirname(ports[0]));
  const formulas = [...new Bun.Glob("Formula/*.rb").scanSync({ cwd: targetDir, onlyFiles: true })];
  if (formulas.length === 1) return path.basename(formulas[0], ".rb");
  const casks = [...new Bun.Glob("Casks/*.rb").scanSync({ cwd: targetDir, onlyFiles: true })];
  if (casks.length === 1) return path.basename(casks[0], ".rb");
  return path.basename(targetDir);
}

function inferPort(assignments: Record<string, JustAssignment>): string {
  const endpoint = assignments.endpoint?.value;
  if (typeof endpoint === "string") {
    const match = endpoint.match(/:(\d+)/);
    if (match) return match[1];
  }
  return "10000";
}

function recipeShape(r: JustRecipe): JustRecipe {
  return {
    body: r.body,
    dependencies: r.dependencies,
    parameters: r.parameters,
    shebang: r.shebang,
    doc: r.doc,
    private: r.private,
    quiet: r.quiet,
  };
}

const args = process.argv.slice(2);
const positional: string[] = [];
let nameOverride: string | undefined;
let portOverride: string | undefined;
let descOverride: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--name") {
    nameOverride = args[++i] ?? die("--name requires a value");
  } else if (arg === "--port") {
    portOverride = args[++i] ?? die("--port requires a value");
  } else if (arg === "--desc") {
    descOverride = args[++i] ?? die("--desc requires a value");
  } else if (arg.startsWith("-")) {
    die(`unknown flag: ${arg}`);
  } else {
    positional.push(arg);
  }
}

if (positional.length !== 2) {
  die("usage: bun scripts/check.ts <template> <target-dir> [--name <name>] [--port <port>] [--desc <desc>]");
}

const [templateName, targetArg] = positional;
const rootDir = process.env.CPP_TEMPLATES_ROOT ?? path.resolve(import.meta.dir, "..");
const templateDir = path.join(rootDir, "templates", templateName);
const manifestPath = path.join(templateDir, "manifest.json");
if (!existsSync(manifestPath)) {
  die(`template not found or missing manifest.json: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
for (const key of ["verbatim", "blocks", "seed", "recipes"] as const) {
  if (!Array.isArray(manifest[key])) {
    die(`invalid manifest.json: ${key} must be an array`);
  }
}

const targetDir = path.resolve(process.cwd(), targetArg);
const targetJustfile = path.join(targetDir, "justfile");
if (!existsSync(targetJustfile)) {
  die(`target justfile not found: ${targetJustfile}`);
}

const targetDump = dumpJustfile(["--justfile", targetJustfile]);
const assignments = targetDump.assignments ?? {};
const name = nameOverride ?? inferName(targetDir, assignments);
const port = portOverride ?? inferPort(assignments);
const desc = descOverride ?? name;

const className = (name.charAt(0).toUpperCase() + name.slice(1).toLowerCase())
  .replace(/[-_.\s]([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase())
  .replaceAll("+", "x")
  .replace(/(.)@(\d)/, "$1AT$2");

const sub = (input: string): string =>
  input
    .replaceAll("__NAME__", name)
    .replaceAll("__CLASS__", className)
    .replaceAll("__PORT__", port)
    .replaceAll("__DESC__", desc);

const errors: string[] = [];

for (const pattern of manifest.verbatim) {
  const matches = [...new Bun.Glob(pattern).scanSync({ cwd: templateDir, dot: true, onlyFiles: true })].sort();
  if (matches.length === 0) {
    errors.push(`verbatim glob matched 0 files in template: ${pattern}`);
    continue;
  }
  for (const rel of matches) {
    const expected = sub(readFileSync(path.join(templateDir, rel), "utf8"));
    const targetRel = sub(rel);
    const targetPath = path.join(targetDir, targetRel);
    if (!existsSync(targetPath)) {
      errors.push(`missing verbatim file: ${targetRel}`);
      continue;
    }
    const actual = readFileSync(targetPath, "utf8");
    if (actual !== expected) {
      errors.push(`verbatim mismatch in ${targetRel}:\n${lineDiff(targetRel, expected, actual)}`);
    }
  }
}

for (const rel of manifest.blocks) {
  const templatePath = path.join(templateDir, rel);
  if (!existsSync(templatePath)) {
    errors.push(`missing block file in template: ${rel}`);
    continue;
  }
  const expectedRes = extractBlock(sub(readFileSync(templatePath, "utf8")));
  if (!expectedRes.ok) {
    errors.push(`template block error in ${rel}: ${expectedRes.error}`);
    continue;
  }
  const targetRel = sub(rel);
  const targetPath = path.join(targetDir, targetRel);
  if (!existsSync(targetPath)) {
    errors.push(`missing block file: ${targetRel}`);
    continue;
  }
  const actualRes = extractBlock(readFileSync(targetPath, "utf8"));
  if (!actualRes.ok) {
    errors.push(`block error in ${targetRel}: ${actualRes.error}`);
    continue;
  }
  if (actualRes.block !== expectedRes.block) {
    errors.push(`block mismatch in ${targetRel}:\n${lineDiff(targetRel, expectedRes.block, actualRes.block)}`);
  }
}

if (manifest.recipes.length > 0) {
  const templateJustfile = path.join(templateDir, "justfile");
  if (!existsSync(templateJustfile)) {
    errors.push("missing template justfile");
  } else {
    const renderedJustfile = sub(readFileSync(templateJustfile, "utf8"));
    const templateDump = dumpJustfile(["--justfile", "/dev/stdin"], renderedJustfile);
    const tmplRecipes = templateDump.recipes ?? {};
    const tgtRecipes = targetDump.recipes ?? {};
    for (const recipeName of manifest.recipes) {
      const expectedRecipe = tmplRecipes[recipeName];
      if (!expectedRecipe) {
        errors.push(`recipe listed in manifest missing from template justfile: ${recipeName}`);
        continue;
      }
      const actualRecipe = tgtRecipes[recipeName];
      if (!actualRecipe) {
        errors.push(`missing recipe in ${targetJustfile}: ${recipeName}`);
        continue;
      }
      const expJson = JSON.stringify(recipeShape(expectedRecipe), null, 2);
      const actJson = JSON.stringify(recipeShape(actualRecipe), null, 2);
      if (expJson !== actJson) {
        errors.push(`recipe mismatch for '${recipeName}':\n${lineDiff(`recipe:${recipeName}`, expJson, actJson)}`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const err of errors) {
    console.error(err);
  }
  process.exit(1);
}
