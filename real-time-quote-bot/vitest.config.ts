import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config propia (no usa la de Lovable/TanStack): las pruebas son de lógica pura, en Node.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
