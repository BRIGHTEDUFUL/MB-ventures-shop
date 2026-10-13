import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const targetZip = path.resolve("deploy.zip");
if (fs.existsSync(targetZip)) {
  fs.unlinkSync(targetZip);
}

// Use git archive if possible to get pure tracked files!
console.log("Creating deploy.zip using git archive...");
try {
  execSync("git archive -o deploy.zip HEAD", { stdio: "inherit" });
  console.log("git archive succeeded! Size:", fs.statSync(targetZip).size);
} catch (e) {
  console.error("git archive failed, falling back to tar:", e.message);
  execSync(
    'tar -a -c -f deploy.zip --exclude="node_modules" --exclude=".git" --exclude=".output" --exclude=".agents" src public convex package.json package-lock.json vite.config.ts tsconfig.json components.json ecosystem.config.js .env.production',
    { stdio: "inherit" },
  );
  console.log("tar succeeded! Size:", fs.statSync(targetZip).size);
}
