import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const compiled = readFileSync(new URL("./dist/server/index.js", import.meta.url), "utf8");
const { default: worker } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
mkdirSync(".local", { recursive: true });
const db = new DatabaseSync(process.env.GAME_DB || ".local/matches.sqlite");
db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
db.exec("CREATE TABLE IF NOT EXISTS local_migrations (file TEXT PRIMARY KEY)");
if (!db.prepare("SELECT 1 FROM local_migrations WHERE file = ?").get("0000_rooms.sql")) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(readFileSync(new URL("./drizzle/0000_rooms.sql", import.meta.url), "utf8"));
    db.prepare("INSERT INTO local_migrations VALUES (?)").run("0000_rooms.sql");
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
const DB = { prepare(sql) {
  return { bind(...params) {
    const stmt = db.prepare(sql);
    return { first: async () => stmt.get(...params) ?? null,
      run: async () => ({ meta: { changes: Number(stmt.run(...params).changes) } }) };
  } };
} };
const server = createServer(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value != null) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const request = new Request("http://localhost" + req.url, {
      method: req.method, headers, ...(hasBody ? { body: req, duplex: "half" } : {}),
    });
    const response = await worker.fetch(request, { DB });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500).end("Server error");
  }
});
const port = Number(process.env.PORT || 4178);
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  const url = "http://" + host + ":" + server.address().port;
  console.log("Microbe Wars: " + url);
  if (process.platform === "win32" && process.argv.includes("--open-browser")) {
    execFile("rundll32.exe", ["url.dll,FileProtocolHandler", url], (error) => {
      if (error) console.log("Open " + url + " in your browser.");
    });
  }
});
