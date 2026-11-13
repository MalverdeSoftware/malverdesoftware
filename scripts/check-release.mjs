// Release dry run for the shared packages (docs/specs/SPEC-distribution.md, Phase 0).
// Checks that every package carries the root LICENSE and NOTICE unchanged, declares Apache-2.0,
// and that `npm pack` would put both files in its tarball. Uploads nothing.
// Run after `npm run build`. `--fix` copies LICENSE and NOTICE from the root into each package first.
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fix = process.argv.includes('--fix');
const shared = ['LICENSE', 'NOTICE'];
const problems = [];

const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join('packages', entry.name));

for (const dir of packages) {
  for (const file of shared) {
    if (fix) copyFileSync(join(root, file), join(root, dir, file));
    let copy = null;
    try {
      copy = readFileSync(join(root, dir, file));
    } catch {
      problems.push(`${dir}/${file} is missing (run: node scripts/check-release.mjs --fix)`);
      continue;
    }
    if (!copy.equals(readFileSync(join(root, file)))) {
      problems.push(`${dir}/${file} differs from the root ${file} (run: node scripts/check-release.mjs --fix)`);
    }
  }
  const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  if (manifest.license !== 'Apache-2.0') problems.push(`${manifest.name}: license is ${manifest.license ?? 'missing'}, not Apache-2.0`);
}

const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--workspaces', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);
for (const tarball of packed) {
  const paths = new Set(tarball.files.map((entry) => entry.path));
  for (const file of shared) {
    if (!paths.has(file)) problems.push(`${tarball.name}@${tarball.version}: ${file} would not be in the tarball`);
  }
  if (![...paths].some((path) => path.startsWith('dist/'))) {
    problems.push(`${tarball.name}@${tarball.version}: no dist/ files; run npm run build first`);
  }
  console.log(`${tarball.name}@${tarball.version}: ${tarball.entryCount} files, ${(tarball.size / 1024).toFixed(1)} kB packed`);
}

if (problems.length) {
  console.error(`\nRelease dry run failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nRelease dry run passed for ${packed.length} packages. Nothing was uploaded.`);
