import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import {
  EFFECTS,
  EFFECT_CHOICES,
  KNOB_MAX,
  KNOB_MIN,
  describeState,
  getState,
  resetFilters,
  setEq,
  setPitch,
  setSpeed,
  toggleEffect,
} from "../utils/filters.js";
import { requirePlayer } from "../utils/guards.js";

const knob = (o, name, description) =>
  o.setName(name).setDescription(description).setMinValue(KNOB_MIN).setMaxValue(KNOB_MAX);

export default {
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Audio filters: effects, speed, pitch and equalizer")
    .addSubcommand((s) =>
      s
        .setName("effect")
        .setDescription("Switch an effect on or off (effects can be combined)")
        .addStringOption((o) =>
          o.setName("name").setDescription("Which effect").setRequired(true).addChoices(...EFFECT_CHOICES),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("speed")
        .setDescription("Change playback speed without touching the pitch")
        .addNumberOption((o) =>
          o.setName("value").setDescription("0.5 to 2 (1 is normal)").setMinValue(0.5).setMaxValue(2).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("pitch")
        .setDescription("Change the pitch without touching the speed")
        .addNumberOption((o) =>
          o.setName("value").setDescription("0.5 to 2 (1 is normal)").setMinValue(0.5).setMaxValue(2).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("eq")
        .setDescription("Equalizer: raise or lower bass, mids and treble")
        .addIntegerOption((o) => knob(o, "bass", `Bass level (${KNOB_MIN} to ${KNOB_MAX}, 0 is flat)`))
        .addIntegerOption((o) => knob(o, "mid", `Mid level (${KNOB_MIN} to ${KNOB_MAX}, 0 is flat)`))
        .addIntegerOption((o) => knob(o, "treble", `Treble level (${KNOB_MIN} to ${KNOB_MAX}, 0 is flat)`)),
    )
    .addSubcommand((s) => s.setName("status").setDescription("Show the active filters"))
    .addSubcommand((s) => s.setName("reset").setDescription("Remove every filter")),

  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const sub = interaction.options.getSubcommand();
    if (sub === "status") {
      return interaction.reply({ embeds: [infoEmbed(`🎚️ ${describeState(getState(player))}`)] });
    }

    await interaction.deferReply();
    let message;
    switch (sub) {
      case "effect": {
        const name = interaction.options.getString("name", true);
        const on = await toggleEffect(player, name);
        message = `🎚️ **${EFFECTS[name].label}** is now ${on ? "on" : "off"}.`;
        break;
      }
      case "speed": {
        const value = interaction.options.getNumber("value", true);
        await setSpeed(player, value);
        message = `⏩ Speed set to **${value}x**.`;
        break;
      }
      case "pitch": {
        const value = interaction.options.getNumber("value", true);
        await setPitch(player, value);
        message = `🎵 Pitch set to **${value}x**.`;
        break;
      }
      case "eq": {
        const levels = {};
        for (const name of ["bass", "mid", "treble"]) {
          const value = interaction.options.getInteger(name);
          if (value !== null) levels[name] = value;
        }
        if (!Object.keys(levels).length) {
          return interaction.editReply({ embeds: [infoEmbed("Give at least one of `bass`, `mid` or `treble`.")] });
        }
        await setEq(player, levels);
        message = `🎚️ ${describeState(getState(player))}`;
        break;
      }
      default:
        await resetFilters(player);
        message = "🎚️ All filters removed.";
    }
    await interaction.editReply({ embeds: [infoEmbed(message)] });
  },
};
