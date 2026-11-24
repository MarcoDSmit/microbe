import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const files = {};
const binary = {};
async function scan(dir, sub = "") {
  for (const entry of await readdir(join(dir, sub), { withFileTypes: true })) {
    const relative = join(sub, entry.name);
    if (entry.isDirectory()) await scan(dir, relative);
    else {
      const path = "/" + relative.replaceAll("\\", "/");
      if (/\.(webp|mp3)$/.test(path)) binary[path] = await readFile(join(dir, relative));
      else files[path] = await readFile(join(dir, relative), "utf8");
    }
  }
}
await scan("public");
const [data, game, api, entry] = await Promise.all(
  ["worker/data.json", "worker/game.js", "worker/api.js", "worker/site.js"].map((p) => readFile(p, "utf8")));
const flat = (source) => source.replace(/^import .+;\r?\n/gm, "").replace(/^export (?=(const|function|class|async))/gm, "");
files["/local-rules.js"] = "const data = " + data + ";\n" + game.replace(/^import .+;\r?\n/gm, "");
const { cards: libraryCards, sites: librarySites, goals: libraryGoals } = JSON.parse(data);
files["/library-data.js"] = "export default " + JSON.stringify({ cards: libraryCards, sites: librarySites, goals: libraryGoals }) + ";\n";
const mobile = process.argv.includes("--mobile");
const pages = process.argv.includes("--pages");
const basePath = process.env.PAGES_BASE_PATH ?? "/microbe/";
if (pages && !/^\/(?:[\w-]+\/)*$/.test(basePath)) throw new Error("PAGES_BASE_PATH must be an absolute directory path ending in /");
files["/mobile-catalog.js"] = "export default " + (mobile || pages ? data : "null") + ";\n";
files["/build-mode.js"] = 'export default ' + JSON.stringify(mobile ? 'mobile' : pages ? 'pages' : 'web') + ';\n';
const staticDirectory = pages ? "dist/pages" : mobile ? "dist/mobile" : process.argv.includes("--netlify") ? "dist/netlify-public" : null;
if (staticDirectory) {
  for (const [path, content] of Object.entries({...files, ...binary})) {
    const destination = join(staticDirectory, path.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    const output = pages && typeof content === 'string' ? content
      .replace(/(["'`(])\/(?=[A-Za-z0-9_.-]+[\/.?#]|#)/g, '$1' + basePath)
      .replace(/"\/"/g, JSON.stringify(basePath)) : content;
    await writeFile(destination, output);
  }
  if (pages) await writeFile(join(staticDirectory, '.nojekyll'), '');
} else {
  await mkdir("dist/server", { recursive: true });
  await mkdir("dist/.openai", { recursive: true });
  await writeFile("dist/server/index.js", "const data = " + data + ";\nconst assets = " + JSON.stringify(files) +
    ";\nconst binaryAssets = " + JSON.stringify(Object.fromEntries(Object.entries(binary).map(([path, bytes]) => [path, bytes.toString("base64")]))) +
    ";\n" + flat(game) + "\n" + flat(api) + "\n" + entry);
  await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
}
