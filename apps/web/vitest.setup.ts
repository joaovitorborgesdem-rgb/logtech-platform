import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// `test.globals` está desligado no vitest.config.ts, então o auto-cleanup
// do Testing Library entre testes precisa ser registrado manualmente.
afterEach(() => {
  cleanup();
});
