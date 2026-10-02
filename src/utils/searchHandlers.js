import { MessageFlags } from "discord.js";
import { errorEmbed, infoEmbed } from "./embeds.js";
import { enqueueTrack, ensurePlayer } from "./playback.js";
import { closeSearchSession, getSearchSession } from "./searchSession.js";

/** Handles a press on one of the numbered buttons under /search results (customId "sr:<token>:<index|x>"). */
export async function handleSearchButton(interaction) {
  const [, token, choice] = interaction.customId.split(":");
  const session = getSearchSession(token);
  const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

  if (!session) {
    return interaction.reply(ephemeral(errorEmbed("This search has expired. Run `/search` again, I've forgotten already.")));
  }
  if (session.userId !== interaction.user.id) {
    return interaction.reply(ephemeral(errorEmbed("Only the person who ran the search can pick a result.")));
  }

  if (choice === "x") {
    closeSearchSession(token);
    return interaction.update({ embeds: [infoEmbed("Search cancelled. We never spoke of it.")], components: [] });
  }

  const track = session.tracks[Number(choice)];
  if (!track) return interaction.reply(ephemeral(errorEmbed("That result is not available. It slipped away.")));

  const player = await ensurePlayer(interaction);
  if (!player) return;

  closeSearchSession(token);
  const embed = await enqueueTrack(player, track, interaction.guildId);
  await interaction.editReply({ embeds: [embed], components: [] });
}
