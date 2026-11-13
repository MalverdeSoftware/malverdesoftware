// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/check-app.mjs", import.meta.url));
const PINS = { "@jetbrains/ring-ui-built": "7.0.133", "@jetbrains/icons": "5.24.0", "@fontsource-variable/mona-sans": "5.3.0" };
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function check(dependencies: Record<string, string>, source: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ui-check-"));
  dirs.push(dir);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies }));
  for (const [name, text] of Object.entries(source)) writeFileSync(join(dir, "src", name), text);
  try {
    execFileSync(process.execPath, [script, dir], { stdio: "pipe" });
    return "";
  } catch (e) {
    return String((e as { stderr: Buffer }).stderr);
  }
}

describe("malverdesoftware-ui-check", () => {
  it("passes an app that follows the spec", () => {
    expect(check(PINS, { "a.tsx": "<Frame appName='X' />", "a.css": "a { color: var(--ring-text-color); background: #fff; }" })).toBe("");
  });

  it("requires exact versions", () => {
    expect(check({ ...PINS, "@jetbrains/ring-ui-built": "^7.0.133" })).toContain("must be exactly 7.0.133");
  });

  it("refuses a second UI layer", () => {
    expect(check({ ...PINS, tailwindcss: "4.2.1" })).toContain("remove tailwindcss");
  });

  it("catches the name as two words", () => {
    expect(check(PINS, { "a.tsx": "Malverde Software" })).toContain("one word");
  });

  it("catches hard-coded colors, unless a line opts out", () => {
    expect(check(PINS, { "a.css": "a { color: #214eaa; }" })).toContain("#214eaa");
    expect(check(PINS, { "a.css": "a { color: #214eaa; } /* ui-check: allow-color */" })).toBe("");
  });

  it("catches other fonts", () => {
    expect(check(PINS, { "a.css": "a { font-family: Georgia, serif; }" })).toContain("font variables");
  });

  it("ignores tests and dependencies", () => {
    expect(check(PINS, { "a.test.tsx": "Malverde Software" })).toBe("");
  });
});
