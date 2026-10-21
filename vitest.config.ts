import { defineConfig } from "vitest/config";

/** Pure decisions and a mocked resolver: no test here may reach the network. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
  },
});
