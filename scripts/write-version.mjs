import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hash = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return process.env.COMMIT_REF?.slice(0, 7) || "dev";
  }
})();

const content = `// Auto-generated at build time
export const BUILD_HASH = ${JSON.stringify(hash)};
export const BUILD_TIME = ${JSON.stringify(new Date().toISOString())};
`;

writeFileSync(resolve(__dirname, "..", "src", "lib", "version.ts"), content);
