import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const offline = path.join(root, ".offline-build");
const dist = path.join(root, "dist");
fs.rmSync(offline, { recursive: true, force: true });
fs.rmSync(dist, { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.offline.json"], { cwd: root, stdio: "inherit" });
fs.cpSync(path.join(root, "public"), dist, { recursive: true });
fs.mkdirSync(path.join(dist, "src/styles"), { recursive: true });
fs.copyFileSync(path.join(root, "src/styles/main.css"), path.join(dist, "src/styles/main.css"));
fs.cpSync(path.join(offline, "src"), path.join(dist, "src"), { recursive: true });
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace('/src/app.tsx', '/src/app.js');
fs.writeFileSync(path.join(dist, "index.html"), html);
console.log("Offline production snapshot built in dist/.");
