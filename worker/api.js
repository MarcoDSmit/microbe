import data from "./data.json" with { type: "json" };
import { act, newGame, RuleError, view } from "./game.js";

const tokenPattern = /^[a-f0-9]{48}$/;
const TTL = 14 * 86400000;
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((n) => n.toString(16).padStart(2, "0")).join("");
const hash = async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
  .map((n) => n.toString(16).padStart(2, "0")).join("");
const flip = (faction) => faction === "Host" ? "Bacteria" : "Host";
const json = (payload, status = 200) => Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
const problem = (message, status) => json({ error: message }, status);

export function d1Store(db) {
  return {
    get: (code) => db.prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first(),
    async create(row) {
      const result = await db.prepare("INSERT OR IGNORE INTO rooms (code, invite_hash, host_hash, revision, state, updated) VALUES (?, ?, ?, 0, ?, ?)")
        .bind(row.code, row.invite_hash, row.host_hash, row.state, row.updated).run();
      return result.meta.changes === 1;
    },
    async update(code, rev, state, guest = null) {
      const result = await db.prepare("UPDATE rooms SET revision = revision + 1, state = ?, updated = ?, guest_hash = COALESCE(?, guest_hash) WHERE code = ? AND revision = ?")
        .bind(state, Date.now(), guest, code, rev).run();
      return result.meta.changes === 1;
    },
  };
}

async function input(request) {
  if (Number(request.headers.get("content-length")) > 8192) throw new RuleError("The action is too large.");
  const raw = await request.text();
  if (raw.length > 8192) throw new RuleError("The action is too large.");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RuleError("Expected a request object.");
  return value;
}
const publicState = (room, state, faction, rev = room.revision) => ({
  code: room.code, revision: rev, ...view(state, faction),
});

export async function api(request, store) {
  const url = new URL(request.url), path = url.pathname;
  try {
    if (path === "/api/cards" && request.method === "GET") return json(data);
    if (path === "/api/rooms" && request.method === "POST") {
      const { faction = "Bacteria" } = await input(request);
      if (!["Host", "Bacteria"].includes(faction)) return problem("Choose a faction.", 400);
      const seat = token(), invite = token(), state = { ...newGame(), creatorFaction: faction };
      const row = { code: token().slice(0, 10).toUpperCase(), invite_hash: await hash(invite),
        host_hash: await hash(seat), state: JSON.stringify(state), updated: Date.now(), revision: 0 };
      if (!await store.create(row)) return problem("Could not allocate a room. Try again.", 503);
      return json({ token: seat, invite, game: publicState(row, state, faction) }, 201);
    }
    const match = path.match(/^\/api\/rooms\/([A-Z0-9]{10})(?:\/(join|action))?$/);
    if (!match) return problem("Unknown endpoint.", 404);
    const [, code, command] = match;
    const room = await store.get(code);
    if (!room || Date.now() - room.updated >= TTL) return problem("Room not found or expired.", 404);
    const state = JSON.parse(room.state);
    if (command === "join" && request.method === "POST") {
      const { invite } = await input(request);
      if (typeof invite !== "string" || !tokenPattern.test(invite) || await hash(invite) !== room.invite_hash) {
        return problem("A valid private invitation is required.", 403);
      }
      if (room.guest_hash) return problem("Both seats are taken. Use the tab you joined from.", 409);
      const seat = token();
      state.status = "objectives";
      if (!await store.update(code, room.revision, JSON.stringify(state), await hash(seat))) {
        return problem("Someone just joined. Refresh your lobby.", 409);
      }
      return json({ token: seat, game: publicState(room, state, flip(state.creatorFaction), room.revision + 1) });
    }
    const seat = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{48})$/)?.[1];
    const key = seat && await hash(seat);
    const faction = key === room.host_hash ? state.creatorFaction : key && key === room.guest_hash ? flip(state.creatorFaction) : null;
    if (!faction) return problem("This room needs your player seat.", 403);
    if (!command && request.method === "GET") {
      if (url.searchParams.get("since") === String(room.revision)) return new Response(null, { status: 204, headers: {"Cache-Control":"no-store"} });
      return json(publicState(room, state, faction));
    }
    if (command === "action" && request.method === "POST") {
      const { revision, action } = await input(request);
      if (revision !== room.revision) return problem("The board changed. Review it and retry.", 409);
      act(state, faction, action);
      if (!await store.update(code, room.revision, JSON.stringify(state))) return problem("The board changed. Review it and retry.", 409);
      return json(publicState(room, state, faction, room.revision + 1));
    }
    return problem("Method not allowed.", 405);
  } catch (error) {
    if (error instanceof RuleError || error instanceof SyntaxError) return problem(error instanceof RuleError ? error.message : "Invalid request.", 400);
    console.error(error.name + ": " + error.message);
    return problem("The game server could not complete that action.", 500);
  }
}
