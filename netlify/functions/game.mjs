import { getStore } from "@netlify/blobs";
import { api } from "../../worker/api.js";
import { blobRoomStore } from "../room-store.mjs";

export const config = { path: "/api/*" };

export default function handler(request) {
  const store = getStore({ name: "microbe-wars-rooms", consistency: "strong" });
  return api(request, blobRoomStore(store));
}
