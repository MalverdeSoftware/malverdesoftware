#!/usr/bin/env node
// Checks an app against the parts of docs/specs/SPEC-ui.md a script can check. Run it from the app, or pass its path.
//   malverdesoftware-ui-check [path/to/app]
// Exits non-zero and lists every problem. The rest of the spec is a review checklist, not something this can see.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const self = dirname(fileURLToPath(import.meta.url));
const { peerDependencies } = JSON.parse(readFileSync(join(self, "..", "package.json"), "utf8"));
const app = resolve(process.argv[2] ?? ".");
const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
const installed = { ...manifest.devDependencies, ...manifest.dependencies };
const problems = [];

// Moving any of these changes how every screen looks, so upgrades happen on purpose, across apps.
for (const name of ["@jetbrains/ring-ui-built", "@jetbrains/icons", "@fontsource-variable/mona-sans"]) {
  const version = installed[name];
  if (version !== peerDependencies[name]) problems.push(`package.json: ${name} must be exactly ${peerDependencies[name]}, found ${version ?? "nothing"}`);
}

// A second component or utility layer is how the screens drift apart again.
const OTHER_UI = ["tailwindcss", "radix-ui", "lucide-react", "@shadcn/react", "@mui/material", "bootstrap", "@chakra-ui/react", "antd"];
for (const name of OTHER_UI) if (installed[name]) problems.push(`package.json: remove ${name}; screens use Ring UI (SPEC-ui, Foundations)`);

const SKIP = new Set(["node_modules", "node_modules 2", "dist", "dist-demo", "build", "vendor", ".next", ".vinext", ".wrangler", ".sites-runtime", ".git"]);
const SOURCE = /\.(jsx?|tsx?|mjs|css|html)$/;
const isSource = (name) => SOURCE.test(name) && !/\.test\.[jt]sx?$/.test(name);
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : walk(path);
    return isSource(name) ? [path] : [];
  });
// What Git tracks, when there is a repository: stray local copies aren't part of the app.
function files(dir) {
  try {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return tracked
      .split("\0")
      .filter((name) => name && isSource(name) && !name.split("/").some((part) => SKIP.has(part)))
      .map((name) => join(dir, name));
  } catch {
    return walk(dir);
  }
}

// Hard-coded colors outside Ring's variables. White and black are fine; a line can opt out with the marker below.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const ALLOWED = new Set(["#fff", "#ffffff", "#000", "#000000"]);
const OPT_OUT = "ui-check: allow-color";

for (const path of files(app)) {
  const name = relative(app, path);
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/Malverde Software/.test(line)) problems.push(`${name}:${i + 1}: the name is one word, MalverdeSoftware`);
    if (!path.endsWith(".css")) return;
    if (/(^|[\s;{])font-family:(?!\s*var\(--ring-font-family)/.test(line) && !line.includes(OPT_OUT)) problems.push(`${name}:${i + 1}: use Ring's font variables`);
    if (line.includes(OPT_OUT)) return;
    for (const [color] of line.matchAll(HEX)) if (!ALLOWED.has(color.toLowerCase())) problems.push(`${name}:${i + 1}: ${color} is not a Ring variable (or mark the line "${OPT_OUT}")`);
  });
}

if (problems.length) {
  console.error(`UI check failed for ${app}:\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`UI check passed for ${app}.`);
