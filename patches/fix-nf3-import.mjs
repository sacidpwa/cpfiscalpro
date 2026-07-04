import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tracePath = join(__dirname, "..", "node_modules", "nf3", "dist", "_chunks", "trace.mjs");

try {
  let content = await readFile(tracePath, "utf-8");
  const original = `import { nodeFileTrace } from "@vercel/nft";`;
  const replacement = `import __nft from "@vercel/nft";\nconst { nodeFileTrace } = __nft;`;
  if (content.includes(original)) {
    content = content.replace(original, replacement);
    await writeFile(tracePath, content, "utf-8");
    console.log("[postinstall] Patched nf3 trace.mjs for CJS->ESM interop");
  } else if (content.includes(replacement)) {
    console.log("[postinstall] nf3 trace.mjs already patched");
  } else {
    console.warn("[postinstall] nf3 trace.mjs has unexpected content - could not patch");
  }
} catch (err) {
  if (err.code === "ENOENT") {
    console.warn("[postinstall] nf3 not installed, skipping patch");
  } else {
    throw err;
  }
}
