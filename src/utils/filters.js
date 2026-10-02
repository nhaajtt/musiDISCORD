/** Audio filter presets. Each one resets the previous filter first, so only one is active at a time. */
export const FILTERS = {
  bassboost: { label: "Bass boost", apply: (fm) => fm.setEQPreset("BassboostMedium") },
  nightcore: { label: "Nightcore", apply: (fm) => fm.toggleNightcore(1.25, 1.25, 1) },
  vaporwave: { label: "Vaporwave", apply: (fm) => fm.toggleVaporwave(0.85, 0.8, 1) },
  "8d": { label: "8D audio", apply: (fm) => fm.toggleRotation(0.2) },
  karaoke: { label: "Karaoke (reduce vocals)", apply: (fm) => fm.toggleKaraoke() },
  tremolo: { label: "Tremolo", apply: (fm) => fm.toggleTremolo(4, 0.6) },
  vibrato: { label: "Vibrato", apply: (fm) => fm.toggleVibrato(6, 0.5) },
  mono: { label: "Mono", apply: (fm) => fm.setAudioOutput("mono") },
};

export const FILTER_CHOICES = [
  { name: "Off (remove filter)", value: "off" },
  ...Object.entries(FILTERS).map(([value, { label }]) => ({ name: label, value })),
];

/** Replaces whatever filter is active with `name` ("off" clears everything). */
export async function setFilter(player, name) {
  await player.filterManager.resetFilters();
  if (name !== "off") await FILTERS[name].apply(player.filterManager);
  player.setData("filter", name === "off" ? undefined : name);
}
