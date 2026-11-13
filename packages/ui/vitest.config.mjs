import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/*.test.{ts,tsx}"],
    // Ring's prebuilt modules use extensionless imports that Node can't resolve on its own.
    server: { deps: { inline: [/@jetbrains\/ring-ui-built/] } },
  },
});
