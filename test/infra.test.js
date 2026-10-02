import assert from "node:assert/strict";
import test from "node:test";
import { failoverTargets, parseNodes, parseShards } from "../src/infra.js";

test("without LAVALINK_NODES the single node comes from the old variables", () => {
  assert.deepEqual(parseNodes({}), [{ id: "main", host: "localhost", port: 2333, password: "youshallnotpass", secure: false }]);
  assert.deepEqual(parseNodes({ LAVALINK_HOST: "lavalink", LAVALINK_PORT: "2444", LAVALINK_PASSWORD: "pw" }), [
    { id: "main", host: "lavalink", port: 2444, password: "pw", secure: false },
  ]);
});

test("a list of nodes, with and without ids, passwords and TLS", () => {
  const nodes = parseNodes({ LAVALINK_PASSWORD: "shared", LAVALINK_NODES: "main=lavalink:2333:secret, backup=10.0.0.9:2334, 10.0.0.10:2335:other:true" });
  assert.deepEqual(nodes, [
    { id: "main", host: "lavalink", port: 2333, password: "secret", secure: false },
    { id: "backup", host: "10.0.0.9", port: 2334, password: "shared", secure: false },
    { id: "node3", host: "10.0.0.10", port: 2335, password: "other", secure: true },
  ]);
});

test("a JSON array handles passwords that contain separators", () => {
  const nodes = parseNodes({ LAVALINK_NODES: JSON.stringify([{ id: "a", host: "h", port: 2333, password: "p:w,d" }, { host: "h2", port: "2334", secure: true }]) });
  assert.equal(nodes[0].password, "p:w,d");
  assert.equal(nodes[1].id, "node2");
  assert.equal(nodes[1].secure, true);
});

test("bad node settings fail loudly", () => {
  assert.throws(() => parseNodes({ LAVALINK_NODES: "a=h:2333:p,a=h2:2333:p" }), /used twice/);
  assert.throws(() => parseNodes({ LAVALINK_NODES: "h:notaport:p" }), /invalid port/);
  assert.throws(() => parseNodes({ LAVALINK_NODES: ":2333:p" }), /no host/);
  assert.throws(() => parseNodes({ LAVALINK_NODES: "[oops" }), /JSON/);
  assert.throws(() => parseNodes({ LAVALINK_NODES: "[1]" }), /no host/);
  assert.throws(() => parseNodes({ LAVALINK_NODES: " , " }), /no nodes/);
});

test("shards: empty, auto, or a number", () => {
  assert.deepEqual(parseShards(""), {});
  assert.deepEqual(parseShards(undefined), {});
  assert.deepEqual(parseShards("1"), {});
  assert.deepEqual(parseShards("AUTO"), { shards: "auto" });
  assert.deepEqual(parseShards("4"), { shardCount: 4 });
  assert.throws(() => parseShards("0"), /SHARDS must be/);
  assert.throws(() => parseShards("many"), /SHARDS must be/);
  assert.throws(() => parseShards("2.5"), /SHARDS must be/);
});

test("failover goes to a connected node with the fewest players, never back to the failed one", () => {
  const nodes = [
    { id: "a", connected: false, stats: { playingPlayers: 0 } },
    { id: "b", connected: true, stats: { playingPlayers: 7 } },
    { id: "c", connected: true, stats: { playingPlayers: 2 } },
    { id: "d", connected: true },
  ];
  assert.deepEqual(failoverTargets(nodes, nodes[0]).map((n) => n.id), ["d", "c", "b"]);
  assert.deepEqual(failoverTargets([nodes[0]], nodes[0]), []);
});
