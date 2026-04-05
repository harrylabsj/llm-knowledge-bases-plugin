import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const pluginDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(pluginDir, "dist");

async function run() {
  await fs.rm(distDir, { recursive: true, force: true });

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsc", "-p", "tsconfig.build.json"],
      {
        cwd: pluginDir,
        stdio: "inherit",
      },
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`build failed with exit code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
