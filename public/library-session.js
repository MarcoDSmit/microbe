const prefix = "microbe-wars.library.";

export function librarySession() {
  try {
    let id = sessionStorage.getItem(prefix + "session");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(prefix + "session", id);
    }
    return id;
  } catch { return ""; }
}

export function libraryStorageKey(id) {
  return /^[a-f0-9-]{36}$/.test(id) ? prefix + id : null;
}

export function readPlayedCards(key) {
  if (!key) return new Set();
  try {
    const ids = JSON.parse(localStorage.getItem(key));
    return new Set(Array.isArray(ids) ? ids : []);
  } catch { return new Set(); }
}

export function recordPlayedCards(key, plays) {
  if (!key || !plays?.length) return;
  const played = readPlayedCards(key);
  const previousCount = played.size;
  for (const {id} of plays) played.add(id.split(":")[0]);
  if (played.size === previousCount) return;
  try { localStorage.setItem(key, JSON.stringify([...played])); } catch {}
}
