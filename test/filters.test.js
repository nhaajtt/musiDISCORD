import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEq,
  defaultState,
  describeState,
  getState,
  resetFilters,
  setEq,
  setPitch,
  setSpeed,
  toggleEffect,
} from "../src/utils/filters.js";

/** A player whose filter manager only records what was asked of it. */
function fakePlayer() {
  const data = new Map();
  const calls = [];
  const record = (name) => async (...args) => {
    calls.push([name, ...args]);
    return fm;
  };
  const fm = {
    resetFilters: record("reset"),
    toggleNightcore: record("nightcore"),
    toggleVaporwave: record("vaporwave"),
    toggleRotation: record("rotation"),
    toggleKaraoke: record("karaoke"),
    toggleTremolo: record("tremolo"),
    toggleVibrato: record("vibrato"),
    setAudioOutput: record("output"),
    setSpeed: record("speed"),
    setPitch: record("pitch"),
    setEQ: record("eq"),
  };
  return {
    calls,
    filterManager: fm,
    getData: (key) => data.get(key),
    setData: (key, value) => (value === undefined ? data.delete(key) : data.set(key, value)),
  };
}

test("effects stack and are re-applied from scratch each time", async () => {
  const player = fakePlayer();
  assert.equal(await toggleEffect(player, "nightcore"), true);
  assert.equal(await toggleEffect(player, "8d"), true);
  assert.deepEqual(getState(player).effects, ["nightcore", "8d"]);

  const lastReset = player.calls.map((c) => c[0]).lastIndexOf("reset");
  const applied = player.calls.slice(lastReset).map((c) => c[0]);
  assert.deepEqual(applied, ["reset", "nightcore", "rotation"]);

  assert.equal(await toggleEffect(player, "nightcore"), false);
  assert.deepEqual(getState(player).effects, ["8d"]);
});

test("explicit speed and pitch are applied after effects so they win", async () => {
  const player = fakePlayer();
  await toggleEffect(player, "nightcore");
  await setSpeed(player, 0.8);
  await setPitch(player, 1.1);
  const lastReset = player.calls.map((c) => c[0]).lastIndexOf("reset");
  assert.deepEqual(
    player.calls.slice(lastReset).map((c) => c[0]),
    ["reset", "nightcore", "speed", "pitch"],
  );
});

test("equalizer gains combine the bass boost effect with manual knobs and stay in range", () => {
  const state = { ...defaultState(), effects: ["bassboost"], eq: { bass: 10, mid: -5, treble: 3 } };
  const gains = buildEq(state);
  assert.equal(gains.length, 15);
  assert.ok(gains.every((g) => g >= -0.25 && g <= 1));
  assert.equal(gains[0], 1); // 0.3 + 1.0 is clamped to the maximum
  assert.equal(gains[7], -0.25); // -0.5 is clamped to the minimum
  assert.equal(gains[12], 0.3);
});

test("reset clears the state and describeState reports it", async () => {
  const player = fakePlayer();
  await setEq(player, { bass: 4 });
  await setSpeed(player, 1.5);
  assert.match(describeState(getState(player)), /Speed: 1.5x/);
  assert.match(describeState(getState(player)), /bass 4/);

  await resetFilters(player);
  assert.equal(player.getData("filters"), undefined);
  assert.equal(describeState(getState(player)), "No filters are active.");
});
