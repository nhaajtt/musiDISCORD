/**
 * Audio filters. The state lives on the player (`player.getData("filters")`) and every change re-applies the
 * whole state from scratch, so effects can be stacked and removed independently.
 */

export const EQ_BANDS = 15;
const MIN_GAIN = -0.25;
const MAX_GAIN = 1;

/** Effects that can be switched on and off independently. `eq` adds gain to the equalizer bands. */
export const EFFECTS = {
  bassboost: { label: "Bass boost", eq: [0.3, 0.25, 0.2, 0.1, 0.05] },
  nightcore: { label: "Nightcore", apply: (fm) => fm.toggleNightcore(1.25, 1.25, 1) },
  vaporwave: { label: "Vaporwave", apply: (fm) => fm.toggleVaporwave(0.85, 0.8, 1) },
  "8d": { label: "8D audio", apply: (fm) => fm.toggleRotation(0.2) },
  karaoke: { label: "Karaoke (reduce vocals)", apply: (fm) => fm.toggleKaraoke() },
  tremolo: { label: "Tremolo", apply: (fm) => fm.toggleTremolo(4, 0.6) },
  vibrato: { label: "Vibrato", apply: (fm) => fm.toggleVibrato(6, 0.5) },
  mono: { label: "Mono", apply: (fm) => fm.setAudioOutput("mono") },
};

export const EFFECT_CHOICES = Object.entries(EFFECTS).map(([value, { label }]) => ({ name: label, value }));

/** Each manual EQ knob (bass, mid, treble) covers five of the 15 bands; one level step is 0.1 gain. */
const KNOB_BANDS = { bass: [0, 5], mid: [5, 10], treble: [10, 15] };
export const KNOB_MIN = -2;
export const KNOB_MAX = 10;

export const defaultState = () => ({ effects: [], speed: 1, pitch: 1, eq: { bass: 0, mid: 0, treble: 0 } });

export function getState(player) {
  return player.getData("filters") ?? defaultState();
}

export function isDefault(state) {
  return !state.effects.length && state.speed === 1 && state.pitch === 1 && !Object.values(state.eq).some(Boolean);
}

/** Computes the 15 equalizer gains from the active effects plus the manual knobs, clamped to Lavalink's range. */
export function buildEq(state) {
  const gains = new Array(EQ_BANDS).fill(0);
  for (const name of state.effects) {
    (EFFECTS[name]?.eq ?? []).forEach((gain, band) => (gains[band] += gain));
  }
  for (const [knob, [from, to]] of Object.entries(KNOB_BANDS)) {
    for (let band = from; band < to; band++) gains[band] += (state.eq[knob] ?? 0) * 0.1;
  }
  return gains.map((gain) => Math.min(MAX_GAIN, Math.max(MIN_GAIN, Math.round(gain * 100) / 100)));
}

/** Resets the player's filters and applies `state` on top. */
export async function applyState(player, state) {
  const fm = player.filterManager;
  await fm.resetFilters();

  for (const name of state.effects) await EFFECTS[name]?.apply?.(fm);
  // Explicit speed and pitch win over whatever an effect such as nightcore set
  if (state.speed !== 1) await fm.setSpeed(state.speed);
  if (state.pitch !== 1) await fm.setPitch(state.pitch);

  const gains = buildEq(state);
  if (gains.some(Boolean)) await fm.setEQ(gains.map((gain, band) => ({ band, gain })));

  player.setData("filters", isDefault(state) ? undefined : state);
}

export async function toggleEffect(player, name) {
  const state = structuredClone(getState(player));
  const wasOn = state.effects.includes(name);
  state.effects = wasOn ? state.effects.filter((e) => e !== name) : [...state.effects, name];
  await applyState(player, state);
  return !wasOn;
}

export async function setSpeed(player, speed) {
  await applyState(player, { ...structuredClone(getState(player)), speed });
}

export async function setPitch(player, pitch) {
  await applyState(player, { ...structuredClone(getState(player)), pitch });
}

export async function setEq(player, eq) {
  const state = structuredClone(getState(player));
  state.eq = { ...state.eq, ...eq };
  await applyState(player, state);
}

export async function resetFilters(player) {
  await applyState(player, defaultState());
}

export function describeState(state) {
  if (isDefault(state)) return "No filters are active. Pure, unfiltered me.";
  const lines = [];
  if (state.effects.length) lines.push(`Effects: ${state.effects.map((e) => EFFECTS[e].label).join(", ")}`);
  if (state.speed !== 1) lines.push(`Speed: ${state.speed}x`);
  if (state.pitch !== 1) lines.push(`Pitch: ${state.pitch}x`);
  const { bass, mid, treble } = state.eq;
  if (bass || mid || treble) lines.push(`Equalizer: bass ${bass}, mid ${mid}, treble ${treble}`);
  return lines.join("\n");
}
