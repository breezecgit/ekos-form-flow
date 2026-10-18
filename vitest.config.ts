import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit-test server action bodies without the application bundler's RPC transform.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node" },
});