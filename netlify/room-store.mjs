export function blobRoomStore(store) {
  const read = (code) => store.getWithMetadata(code, { type: "json" });
  return {
    async get(code) {
      return (await read(code))?.data ?? null;
    },
    async create(row) {
      const result = await store.setJSON(row.code, row, { onlyIfNew: true });
      return result.modified;
    },
    async update(code, revision, state, guest = null) {
      const entry = await read(code);
      if (!entry || entry.data.revision !== revision) return false;
      const row = {
        ...entry.data,
        revision: revision + 1,
        state,
        updated: Date.now(),
        guest_hash: guest ?? entry.data.guest_hash,
      };
      const result = await store.setJSON(code, row, { onlyIfMatch: entry.etag });
      return result.modified;
    },
  };
}
