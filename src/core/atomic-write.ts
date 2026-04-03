import fs from "node:fs/promises";
import path from "node:path";

export async function atomicWriteText(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  await fs.mkdir(dir, { recursive: true });
  const handle = await fs.open(tempPath, "w");

  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  await handle.close();
  await fs.rename(tempPath, filePath);

  try {
    const dirHandle = await fs.open(dir, "r");
    await dirHandle.sync();
    await dirHandle.close();
  } catch {
    // Directory fsync is a best-effort durability improvement.
  }
}
