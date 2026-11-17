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
      if (path.endsWith(".webp")) binary[path] = await readFile(join(dir, relative));
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
files["/mobile-catalog.js"] = "export default " + (mobile ? data : "null") + ";\n";
const staticDirectory = mobile ? "dist/mobile" : process.argv.includes("--netlify") ? "dist/netlify-public" : null;
if (staticDirectory) {
  for (const [path, content] of Object.entries({...files, ...binary})) {
    const destination = join(staticDirectory, path.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
} else {
  await mkdir("dist/server", { recursive: true });
  await mkdir("dist/.openai", { recursive: true });
  await writeFile("dist/server/index.js", "const data = " + data + ";\nconst assets = " + JSON.stringify(files) +
    ";\nconst images = " + JSON.stringify(Object.fromEntries(Object.entries(binary).map(([path, bytes]) => [path, bytes.toString("base64")]))) +
    ";\n" + flat(game) + "\n" + flat(api) + "\n" + entry);
  await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
}
