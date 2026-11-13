// @vitest-environment node
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Frame } from "../src/index.ts";

describe("Frame", () => {
  const html = renderToStaticMarkup(<Frame appName="ExampleApp"><main>Page</main></Frame>);

  it("names the app at the top, and MalverdeSoftware as one word at the top and in the footer", () => {
    expect(html).toContain(">ExampleApp</a>");
    expect(html).toContain(">MalverdeSoftware</a>");
    expect(html).toContain("MalverdeSoftware · Indigenous-led software development");
    expect(html).not.toContain("Malverde Software");
  });

  it("keeps the page between the header and the footer", () => {
    expect(html.indexOf("</header>")).toBeLessThan(html.indexOf("<main>"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
  });

  it("stays free of Ring, so it can render on a server", () => {
    for (const file of ["../src/index.ts", "../src/frame.tsx"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toContain("ring-ui-built");
    }
  });
});
