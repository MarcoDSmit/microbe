CREATE TABLE rooms (
  code TEXT PRIMARY KEY NOT NULL,
  invite_hash TEXT UNIQUE NOT NULL,
  host_hash TEXT NOT NULL,
  guest_hash TEXT,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated INTEGER NOT NULL
);
