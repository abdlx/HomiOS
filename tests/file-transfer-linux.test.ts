import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runFileTransfer,
  cleanupTransferJournal,
} from "../lib/file-transfers.ts";

// Real EXDEV coverage when run on a Linux host with tmpfs; no mock rename.
it.skipIf(process.platform !== "linux" || !fs.existsSync("/dev/shm"))(
  "replaces a whole directory across Linux filesystems before removing its source",
  async (context) => {
    const sourceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "homios-linux-source-"),
    );
    let destinationRoot: string | undefined;
    try {
      destinationRoot = fs.mkdtempSync("/dev/shm/homios-linux-destination-");
      if (fs.statSync(sourceRoot).dev === fs.statSync(destinationRoot).dev) {
        context.skip();
        return;
      }
      const source = path.join(sourceRoot, "incoming");
      const destination = path.join(destinationRoot, "existing");
      fs.mkdirSync(path.join(source, "empty"), { recursive: true });
      fs.mkdirSync(destination);
      fs.writeFileSync(path.join(source, "new.txt"), "incoming data");
      fs.writeFileSync(path.join(destination, "old.txt"), "original data");
      const options = {
        sourcePath: source,
        destinationPath: destination,
        rootPath: "/",
        jobId: "linux-replacement",
        move: true,
        collision: "replace" as const,
      };
      await runFileTransfer(options);
      expect(fs.existsSync(source)).toBe(false);
      expect(fs.readFileSync(path.join(destination, "new.txt"), "utf8")).toBe(
        "incoming data",
      );
      expect(fs.statSync(path.join(destination, "empty")).isDirectory()).toBe(
        true,
      );
      expect(fs.existsSync(path.join(destination, "old.txt"))).toBe(false);
      cleanupTransferJournal(options);
      expect(fs.readdirSync(destinationRoot)).toEqual(["existing"]);
    } finally {
      // Both roots are newly created temporary directories owned by this test.
      fs.rmSync(sourceRoot, { recursive: true, force: true });
      if (destinationRoot)
        fs.rmSync(destinationRoot, { recursive: true, force: true });
    }
  },
);
