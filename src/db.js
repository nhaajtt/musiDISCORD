import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const file = process.env.DB_PATH || path.join(config.dataDir, "musidiscord.db");
if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });

export const db = new DatabaseSync(file);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 3000;

  CREATE TABLE IF NOT EXISTS plays (
    id           INTEGER PRIMARY KEY,
    guild_id     TEXT NOT NULL,
    requester_id TEXT,
    skipped_by   TEXT,
    track_key    TEXT NOT NULL,
    title        TEXT NOT NULL,
    artist       TEXT,
    duration_ms  INTEGER,
    listened_ms  INTEGER NOT NULL,
    played_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS plays_guild_time ON plays (guild_id, played_at);
  CREATE INDEX IF NOT EXISTS plays_requester ON plays (requester_id);

  CREATE TABLE IF NOT EXISTS listeners (
    play_id INTEGER NOT NULL REFERENCES plays (id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    PRIMARY KEY (play_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS listeners_user ON listeners (user_id);

  CREATE TABLE IF NOT EXISTS ratings (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    track_key TEXT NOT NULL,
    value     INTEGER NOT NULL,
    rated_at  INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, track_key)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id   TEXT NOT NULL,
    track_key TEXT NOT NULL,
    title     TEXT NOT NULL,
    artist    TEXT,
    added_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, track_key)
  );

  CREATE TABLE IF NOT EXISTS quiz_scores (
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    points      INTEGER NOT NULL DEFAULT 0,
    games       INTEGER NOT NULL DEFAULT 0,
    correct     INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS badges (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    badge     TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, badge)
  );

  CREATE TABLE IF NOT EXISTS optout (
    user_id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS contributions (
    id            INTEGER PRIMARY KEY,
    guild_id      TEXT,
    user_id       TEXT,
    original_name TEXT NOT NULL,
    ext           TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    sha256        TEXT NOT NULL,
    title         TEXT,
    artist        TEXT,
    duration_ms   INTEGER,
    status        TEXT NOT NULL DEFAULT 'pending',
    reason        TEXT,
    created_at    INTEGER NOT NULL,
    reviewed_by   TEXT,
    reviewed_at   INTEGER,
    final_path    TEXT
  );
  CREATE INDEX IF NOT EXISTS contributions_status ON contributions (status, created_at);
  CREATE INDEX IF NOT EXISTS contributions_user ON contributions (user_id, created_at);
  CREATE INDEX IF NOT EXISTS contributions_hash ON contributions (sha256);

  CREATE TABLE IF NOT EXISTS song_requests (
    id             INTEGER PRIMARY KEY,
    key            TEXT NOT NULL UNIQUE,
    display        TEXT NOT NULL,
    guild_id       TEXT,
    channel_id     TEXT,
    created_by     TEXT,
    created_at     INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'open',
    fulfilled_file TEXT
  );

  CREATE TABLE IF NOT EXISTS request_votes (
    request_id INTEGER NOT NULL REFERENCES song_requests (id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    PRIMARY KEY (request_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id         INTEGER PRIMARY KEY,
    scope      TEXT NOT NULL CHECK (scope IN ('user', 'guild')),
    owner_id   TEXT NOT NULL,
    name       TEXT NOT NULL COLLATE NOCASE,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (scope, owner_id, name)
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    track_key   TEXT NOT NULL,
    title       TEXT NOT NULL,
    artist      TEXT,
    uri         TEXT,
    duration_ms INTEGER,
    PRIMARY KEY (playlist_id, position)
  );

  CREATE TABLE IF NOT EXISTS lyrics_cache (
    track_key  TEXT PRIMARY KEY,
    synced     TEXT,
    plain      TEXT,
    fetched_at INTEGER NOT NULL
  );
`);
