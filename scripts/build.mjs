import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const files = {};
async function scan(dir, sub = "") {
  for (const entry of await readdir(join(dir, sub), { withFileTypes: true })) {
    const relative = join(sub, entry.name);
    if (entry.isDirectory()) await scan(dir, relative);
    else files["/" + relative.replaceAll("\\", "/")] = await readFile(join(dir, relative), "utf8");
  }
}
await scan("public");
const [data, game, api, entry] = await Promise.all(
  ["worker/data.json", "worker/game.js", "worker/api.js", "worker/site.js"].map((p) => readFile(p, "utf8")));
const flat = (source) => source.replace(/^import .+;\r?\n/gm, "").replace(/^export (?=(const|function|class|async))/gm, "");
files["/local-rules.js"] = "const data = " + data + ";\n" + game.replace(/^import .+;\r?\n/gm, "");
const { cards: libraryCards, sites: librarySites, goals: libraryGoals } = JSON.parse(data);
files["/library-data.js"] = "export default " + JSON.stringify({ cards: libraryCards, sites: librarySites, goals: libraryGoals }) + ";\n";
if (process.argv.includes("--netlify")) {
  for (const [path, content] of Object.entries(files)) {
    const destination = join("dist/netlify-public", path.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
} else {
  await mkdir("dist/server", { recursive: true });
  await mkdir("dist/.openai", { recursive: true });
  await writeFile("dist/server/index.js", "const data = " + data + ";\nconst assets = " + JSON.stringify(files) +
    ";\n" + flat(game) + "\n" + flat(api) + "\n" + entry);
  await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
}
