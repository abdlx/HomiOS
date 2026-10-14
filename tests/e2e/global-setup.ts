import { request } from "@playwright/test";
import fs from "node:fs";
export default async function setup() {
  fs.mkdirSync(".cache/screenshots", { recursive: true });
  const context = await request.newContext({
    baseURL: "http://127.0.0.1:3217",
  });
  const response = await context.post("/api/auth/setup", {
    data: { email: "browser-test@homios.test", password: "Browser-test-2026!" },
  });
  if (!response.ok())
    throw new Error(
      `Isolated test account setup failed: ${await response.text()}`,
    );
  await context.storageState({ path: ".cache/e2e-auth.json" });
  await context.dispose();
}
