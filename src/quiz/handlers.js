import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { isDj } from "../utils/guards.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

function sessionOf(interaction) {
  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  return { player, session: player?.getData("quiz") };
}

/** The player must be in the same voice channel as the bot. */
function inVoice(interaction, player) {
  return interaction.member.voice?.channelId === player.voiceChannelId;
}

/** Quiz button press (customId "qz:<action>"). */
export async function handleQuizButton(interaction) {
  const { player, session } = sessionOf(interaction);
  if (!session) return interaction.reply(ephemeral(errorEmbed("This music quiz has ended.")));
  if (!inVoice(interaction, player)) return interaction.reply(ephemeral(errorEmbed("You need to be in the same voice channel as the bot to play.")));

  const action = interaction.customId.slice(3);

  if (action === "answer") {
    const modal = new ModalBuilder()
      .setCustomId("qz:modal")
      .setTitle("Guess the song")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("answer")
            .setLabel("Song title (or artist)")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(100)
            .setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }

  if (action === "hint") {
    const hint = session.hint();
    return interaction.reply(ephemeral(infoEmbed(hint ?? "No hint available right now.")));
  }

  if (action === "skip") {
    if (interaction.user.id !== session.starterId && !isDj(interaction.member, interaction.guildId)) {
      return interaction.reply(ephemeral(errorEmbed("Only the player who started the game or a DJ can skip the round.")));
    }
    session.skipRound();
    return interaction.reply(ephemeral(infoEmbed("⏭️ Skipping this round.")));
  }
}

/** Submit an answer from the modal. */
export async function handleQuizModal(interaction) {
  const { player, session } = sessionOf(interaction);
  if (!session) return interaction.reply(ephemeral(errorEmbed("This music quiz has ended.")));
  if (!inVoice(interaction, player)) return interaction.reply(ephemeral(errorEmbed("You need to be in the same voice channel as the bot to play.")));

  const result = session.submit(interaction.user, interaction.fields.getTextInputValue("answer"));
  const messages = {
    correct: `✅ Correct! **+${result.points}** points${result.streak > 1 ? ` (streak ${result.streak} 🔥)` : ""}.`,
    artist: `🎤 Right artist! **+${result.points}** points. Now guess the title.`,
    "artist-again": "You already got the artist points, now guess the title.",
    already: "You already answered this round correctly.",
    late: "This round hasn't started or has already ended.",
    wrong: "❌ Not quite, try again.",
  };
  const embed = result.status === "wrong" || result.status === "late" ? errorEmbed(messages[result.status]) : infoEmbed(messages[result.status]);
  return interaction.reply(ephemeral(embed));
}
