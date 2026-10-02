import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { approveContribution, rejectContribution } from "./approve.js";
import { contributionEmbed, createNotifier, isOwner } from "./notify.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

async function requireOwner(interaction) {
  if (await isOwner(interaction.client, interaction.user.id)) return true;
  await interaction.reply(ephemeral(errorEmbed("Only the bot owner can review contributions. Nice try, though."))).catch(() => {});
  return false;
}

/** Approve / Reject button press (customId "ct:<action>:<id>"). */
export async function handleContribButton(interaction) {
  const [, action, idText] = interaction.customId.split(":");
  const id = Number(idText);
  if (!Number.isInteger(id) || !(await requireOwner(interaction))) return;

  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`ct:rmodal:${id}`)
      .setTitle(`Reject contribution #${id}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("reason").setLabel("Reason (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300),
        ),
      );
    return interaction.showModal(modal);
  }

  if (action !== "approve") return;
  await interaction.deferUpdate();
  try {
    const { row, file } = await approveContribution({ id, ownerId: interaction.user.id });
    await interaction.message
      .edit({ embeds: [contributionEmbed(row).setColor(0x57f287).setTitle(`✅ Approved contribution #${id}`).setDescription(`Added to the library: \`${file}\``)], components: [] })
      .catch(() => {});
    if (row.user_id) {
      await createNotifier(interaction.client)(row.user_id, `🎉 Your contribution **${row.title ?? row.original_name}** was approved and is now in the library. Thank you!`);
    }
  } catch (error) {
    await interaction.followUp(ephemeral(errorEmbed(error.message))).catch(() => {});
  }
}

/** Submit the rejection reason from the modal. */
export async function handleContribModal(interaction) {
  const id = Number(interaction.customId.split(":")[2]);
  if (!Number.isInteger(id) || !(await requireOwner(interaction))) return;

  const reason = interaction.fields.getTextInputValue("reason")?.trim() || null;
  try {
    const row = await rejectContribution({ id, ownerId: interaction.user.id, reason });
    const done = infoEmbed(`🗑️ Rejected contribution #${id}${reason ? `: ${reason}` : "."}`);
    if (interaction.isFromMessage()) await interaction.update({ embeds: [done], components: [] });
    else await interaction.reply(ephemeral(done));

    if (row.user_id) {
      await createNotifier(interaction.client)(row.user_id, `Your contribution **${row.title ?? row.original_name}** was not accepted${reason ? `. Reason: ${reason}` : "."}`);
    }
  } catch (error) {
    await interaction.reply(ephemeral(errorEmbed(error.message))).catch(() => {});
  }
}

