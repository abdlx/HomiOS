import fs from "node:fs";
import path from "node:path";
// Long browser runs must not lose empty fixtures to OS temporary-folder cleanup.
const fixtureBase = path.join(process.cwd(), ".cache", "browser-fixtures");
fs.mkdirSync(fixtureBase, { recursive: true });
const root = fs.mkdtempSync(path.join(fixtureBase, "run-"));
process.env.HOMIOS_DATABASE_PATH = path.join(root, "test.db");
process.env.ROOT_DIR = path.join(root, "files");
process.env.APP_KEY = "0".repeat(64);
process.env.BCRYPT_COST = "4";
process.env.HOMIOS_PORT = "3217";
process.env.HOST = "127.0.0.1";
process.env.HOMIOS_NEXT_DIST_DIR = ".next-e2e";
process.env.HOMIOS_DISABLE_PWA = "true";
for (const project of ["desktop", "mobile", "tablet"]) {
  for (const folder of ["Source", "Target", "Empty", "MoveSource"])
    fs.mkdirSync(path.join(process.env.ROOT_DIR, project, folder), {
      recursive: true,
    });
  for (const name of ["alpha.txt", "bravo.txt"])
    fs.writeFileSync(
      path.join(process.env.ROOT_DIR, project, "Source", name),
      `Test ${name}`,
    );
  for (const name of ["alpha.txt", "bravo.txt"])
    fs.writeFileSync(
      path.join(process.env.ROOT_DIR, project, "MoveSource", name),
      `Move ${name}`,
    );
  fs.mkdirSync(path.join(process.env.ROOT_DIR, project, "Source", "Nested"));
}
// This server uses an isolated, ignored database and filesystem; it never opens user data.
await import("../../server.js");
