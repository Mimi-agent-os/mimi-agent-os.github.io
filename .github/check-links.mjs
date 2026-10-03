// Fails when a page, stylesheet or module points at a local file that does not exist, at an id
// missing from its page, or at a wiki route (#/<repo>) for a repo that wiki/repos.js does not list.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repos } from "../wiki/repos.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const names = new Set(repos.map((repo) => repo.name));
const files = readdirSync(root, { recursive: true })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => /\.(html|css|js)$/.test(path) && !/^(\.git|\.github|wiki\/vendor)\//.test(path));
const problems = [];
let checked = 0;

for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    const pattern = file.endsWith(".html") ? /\s(?:href|src)="([^"]+)"/g
        : file.endsWith(".css") ? /url\(\s*["']?([^"')]+)/g
        : /^\s*(?:import\s*|(?:import|export)\b[^;"']*\bfrom\s*)["']([^"']+)["']/gm;
    for (const [, link] of text.matchAll(pattern)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith("//")) continue;
        checked++;
        const [path, hash = ""] = link.split("#");
        if (hash.startsWith("/")) {
            const name = hash.slice(1).split("/")[0];
            if (name !== "" && !names.has(name)) problems.push(`${file}: ${link} names no repo in wiki/repos.js`);
        } else if (path === "" && !text.includes(`id="${hash}"`)) {
            problems.push(`${file}: ${link} has no matching id`);
        }
        if (path === "") continue;
        const target = join(root, dirname(file), path.split("?")[0]);
        const found = existsSync(target) && (!statSync(target).isDirectory() || existsSync(join(target, "index.html")));
        if (!found) problems.push(`${file}: ${link} does not exist`);
    }
}

if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
}
console.log(`${checked} local links in ${files.length} files resolve`);
