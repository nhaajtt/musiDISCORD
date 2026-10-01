import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { approveContribution, rejectContribution } from "./approve.js";
import { contributionEmbed, createNotifier, isOwner } from "./notify.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

async function requireOwner(interaction) {
  if (await isOwner(interaction.client, interaction.user.id)) return true;
  await interaction.reply(ephemeral(errorEmbed("Chỉ chủ bot mới duyệt được đóng góp."))).catch(() => {});
  return false;
}

/** Bấm nút Duyệt / Từ chối (customId dạng "ct:<hành động>:<id>"). */
export async function handleContribButton(interaction) {
  const [, action, idText] = interaction.customId.split(":");
  const id = Number(idText);
  if (!Number.isInteger(id) || !(await requireOwner(interaction))) return;

  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`ct:rmodal:${id}`)
      .setTitle(`Từ chối đóng góp #${id}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("reason").setLabel("Lý do (không bắt buộc)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300),
        ),
      );
    return interaction.showModal(modal);
  }

  if (action !== "approve") return;
  await interaction.deferUpdate();
  try {
    const { row, file } = await approveContribution({ id, ownerId: interaction.user.id });
    await interaction.message
      .edit({ embeds: [contributionEmbed(row).setColor(0x57f287).setTitle(`✅ Đã duyệt đóng góp #${id}`).setDescription(`Đã thêm vào thư viện: \`${file}\``)], components: [] })
      .catch(() => {});
    if (row.user_id) {
      await createNotifier(interaction.client)(row.user_id, `🎉 Đóng góp **${row.title ?? row.original_name}** của bạn đã được duyệt và có trong thư viện. Cảm ơn bạn!`);
    }
  } catch (error) {
    await interaction.followUp(ephemeral(errorEmbed(error.message))).catch(() => {});
  }
}

/** Gửi lý do từ chối từ cửa sổ nhập. */
export async function handleContribModal(interaction) {
  const id = Number(interaction.customId.split(":")[2]);
  if (!Number.isInteger(id) || !(await requireOwner(interaction))) return;

  const reason = interaction.fields.getTextInputValue("reason")?.trim() || null;
  try {
    const row = await rejectContribution({ id, ownerId: interaction.user.id, reason });
    const done = infoEmbed(`🗑️ Đã từ chối đóng góp #${id}${reason ? `: ${reason}` : "."}`);
    if (interaction.isFromMessage()) await interaction.update({ embeds: [done], components: [] });
    else await interaction.reply(ephemeral(done));

    if (row.user_id) {
      await createNotifier(interaction.client)(row.user_id, `Đóng góp **${row.title ?? row.original_name}** của bạn chưa được nhận${reason ? `. Lý do: ${reason}` : "."}`);
    }
  } catch (error) {
    await interaction.reply(ephemeral(errorEmbed(error.message))).catch(() => {});
  }
}

