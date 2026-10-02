import assert from "node:assert/strict";
import test from "node:test";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.DB_PATH = ":memory:";

const P = await import("../src/playlists.js");
const S = await import("../src/stats.js");
const { db } = await import("../src/db.js");

const track = (n, over = {}) => ({ key: `local:t${n}.mp3`, title: `Track ${n}`, artist: "Artist", uri: null, durationMs: 180_000, ...over });

test("create, find case-insensitively, and reject duplicates and bad names", () => {
  const p = P.createPlaylist({ scope: "user", ownerId: "u1", name: "  Road   trip ", createdBy: "u1" });
  assert.equal(p.name, "Road trip");
  assert.equal(P.findPlaylist("user", "u1", "ROAD TRIP").id, p.id);
  assert.throws(() => P.createPlaylist({ scope: "user", ownerId: "u1", name: "road trip" }), { code: "exists" });
  assert.throws(() => P.createPlaylist({ scope: "user", ownerId: "u1", name: "   " }), { code: "name" });
  assert.throws(() => P.createPlaylist({ scope: "user", ownerId: "u1", name: "x".repeat(41) }), { code: "name" });
  // The same name is fine for another owner or another scope
  P.createPlaylist({ scope: "user", ownerId: "u2", name: "Road trip" });
  P.createPlaylist({ scope: "guild", ownerId: "g1", name: "Road trip" });
});

test("playlists per owner are capped", () => {
  for (let i = 0; i < P.MAX_PLAYLISTS; i++) P.createPlaylist({ scope: "user", ownerId: "capped", name: `p${i}` });
  assert.throws(() => P.createPlaylist({ scope: "user", ownerId: "capped", name: "one more" }), { code: "limit" });
});

test("tracks keep their order, skip duplicates, and removal closes the gap", () => {
  const p = P.createPlaylist({ scope: "user", ownerId: "u3", name: "Order" });
  assert.deepEqual(P.addTracks(p.id, [track(1), track(2), track(3), track(2)]), { added: 3, duplicates: 1, full: false });
  assert.deepEqual(P.listTracks(p.id).map((t) => t.title), ["Track 1", "Track 2", "Track 3"]);

  const removed = P.removeTrack(p.id, 2);
  assert.equal(removed.title, "Track 2");
  const rows = P.listTracks(p.id);
  assert.deepEqual(rows.map((t) => [t.position, t.title]), [[1, "Track 1"], [2, "Track 3"]]);
  assert.equal(P.removeTrack(p.id, 9), null);

  P.addTracks(p.id, [track(4)]);
  assert.equal(P.listTracks(p.id).at(-1).position, 3);
});

test("a playlist stops growing at the size cap", () => {
  const p = P.createPlaylist({ scope: "user", ownerId: "u4", name: "Big" });
  const many = Array.from({ length: P.MAX_TRACKS + 5 }, (_, i) => track(i));
  const result = P.addTracks(p.id, many);
  assert.equal(result.added, P.MAX_TRACKS);
  assert.equal(result.full, true);
});

test("resolvePlaylist only hands out playlists the person may use", () => {
  const mine = P.createPlaylist({ scope: "user", ownerId: "alice", name: "Mine" });
  const shared = P.createPlaylist({ scope: "guild", ownerId: "g9", name: "Party" });
  const who = { userId: "alice", guildId: "g9" };

  assert.equal(P.resolvePlaylist(`user:${mine.id}`, who).id, mine.id);
  assert.equal(P.resolvePlaylist(`guild:${shared.id}`, who).id, shared.id);
  assert.equal(P.resolvePlaylist("mine", who).id, mine.id);
  assert.equal(P.resolvePlaylist("party", who).id, shared.id);

  // Someone else's personal playlist, another server's playlist, or a wrong scope tag
  assert.equal(P.resolvePlaylist(`user:${mine.id}`, { userId: "bob", guildId: "g9" }), null);
  assert.equal(P.resolvePlaylist(`guild:${shared.id}`, { userId: "alice", guildId: "other" }), null);
  assert.equal(P.resolvePlaylist(`guild:${mine.id}`, who), null);
  assert.equal(P.resolvePlaylist("nope", who), null);
});

test("stored tracks keep a link only for non-local sources", () => {
  const local = P.toStoredTrack({ info: { title: "A", author: "B", uri: "/music/a.mp3", duration: 1000, sourceName: "local" } }, "local:a.mp3");
  const remote = P.toStoredTrack({ info: { title: "A", author: "B", uri: "https://youtu.be/x", duration: 1000, sourceName: "youtube" } }, "youtube:x");
  assert.equal(local.uri, null);
  assert.equal(remote.uri, "https://youtu.be/x");
});

test("deleting a playlist removes its tracks, and /privacy delete removes personal playlists only", () => {
  const p = P.createPlaylist({ scope: "user", ownerId: "leaver", name: "Gone soon", createdBy: "leaver" });
  P.addTracks(p.id, [track(1)]);
  const shared = P.createPlaylist({ scope: "guild", ownerId: "g5", name: "Stays", createdBy: "leaver" });
  P.addTracks(shared.id, [track(2)]);

  S.deleteUserData("leaver");
  assert.equal(P.getPlaylist(p.id), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id = ?").get(p.id).n, 0);
  assert.equal(P.getPlaylist(shared.id).created_by, null);
  assert.equal(P.listTracks(shared.id).length, 1);

  assert.equal(P.deletePlaylist(shared.id), true);
  assert.equal(P.deletePlaylist(shared.id), false);
});
