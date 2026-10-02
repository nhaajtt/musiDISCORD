// Parsing of the settings that scale the bot out: several Lavalink nodes and Discord sharding.

/**
 * Lavalink nodes from the environment. Without LAVALINK_NODES this is the single node described by
 * LAVALINK_HOST / LAVALINK_PORT / LAVALINK_PASSWORD, exactly as before.
 *
 * LAVALINK_NODES is a comma-separated list of  [id=]host:port:password[:secure]  entries, or a JSON array of
 * { id, host, port, password, secure } objects (use JSON when a password contains ":" or ",").
 * Example:  main=lavalink:2333:secret,backup=lavalink2:2333:secret
 */
export function parseNodes(env = process.env) {
  const raw = (env.LAVALINK_NODES ?? "").trim();
  const fallback = [
    {
      id: "main",
      host: env.LAVALINK_HOST || "localhost",
      port: Number(env.LAVALINK_PORT) || 2333,
      password: env.LAVALINK_PASSWORD || "youshallnotpass",
      secure: false,
    },
  ];
  if (!raw) return fallback;

  const nodes = raw.startsWith("[") ? parseJsonNodes(raw, env) : parseListNodes(raw, env);
  if (!nodes.length) throw new Error("LAVALINK_NODES is set but contains no nodes.");

  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`LAVALINK_NODES: the node id "${node.id}" is used twice.`);
    ids.add(node.id);
  }
  return nodes;
}

function build({ id, host, port, password, secure }, index, env) {
  const nodePort = Number(port);
  if (!host) throw new Error(`LAVALINK_NODES: node ${index + 1} has no host.`);
  if (!Number.isInteger(nodePort) || nodePort < 1 || nodePort > 65535) {
    throw new Error(`LAVALINK_NODES: node "${host}" has an invalid port.`);
  }
  return {
    id: id || `node${index + 1}`,
    host: String(host),
    port: nodePort,
    // A node with no password of its own uses the shared LAVALINK_PASSWORD
    password: password || env.LAVALINK_PASSWORD || "youshallnotpass",
    secure: secure === true || secure === "true" || secure === "1",
  };
}

function parseListNodes(raw, env) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const eq = entry.indexOf("=");
      const id = eq > 0 && !entry.slice(0, eq).includes(":") ? entry.slice(0, eq).trim() : "";
      const [host, port, password, secure] = (id ? entry.slice(eq + 1) : entry).split(":").map((p) => p.trim());
      return build({ id, host, port, password, secure }, index, env);
    });
}

function parseJsonNodes(raw, env) {
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error("LAVALINK_NODES looks like JSON but could not be parsed.");
  }
  if (!Array.isArray(list)) throw new Error("LAVALINK_NODES must be a JSON array.");
  return list.map((node, index) => build(node ?? {}, index, env));
}

/**
 * Discord client sharding from SHARDS: empty = one shard (fine up to 2,500 servers), "auto" = the number Discord
 * recommends, or a number. All shards run inside this one process (see the README for what that means).
 */
export function parseShards(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return {};
  if (text === "auto") return { shards: "auto" };
  const count = Number(text);
  if (!Number.isInteger(count) || count < 1 || count > 512) {
    throw new Error(`SHARDS must be empty, "auto" or a whole number from 1 to 512 (got "${value}").`);
  }
  return count === 1 ? {} : { shardCount: count };
}

/** Nodes to move players to when `failed` goes down: every other connected node, least loaded first. */
export function failoverTargets(nodes, failed) {
  return nodes
    .filter((node) => node.id !== failed.id && node.connected)
    .sort((a, b) => (a.stats?.playingPlayers ?? 0) - (b.stats?.playingPlayers ?? 0));
}
