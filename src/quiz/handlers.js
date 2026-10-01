import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { isDj } from "../utils/guards.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

function sessionOf(interaction) {
  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  return { player, session: player?.getData("quiz") };
}

/** Người chơi phải đang ở cùng kênh thoại với bot. */
function inVoice(interaction, player) {
  return interaction.member.voice?.channelId === player.voiceChannelId;
}

/** Bấm nút của ván đố nhạc (customId dạng "qz:<hành động>"). */
export async function handleQuizButton(interaction) {
  const { player, session } = sessionOf(interaction);
  if (!session) return interaction.reply(ephemeral(errorEmbed("Ván đố nhạc này đã kết thúc.")));
  if (!inVoice(interaction, player)) return interaction.reply(ephemeral(errorEmbed("Bạn cần ở cùng kênh thoại với bot để chơi.")));

  const action = interaction.customId.slice(3);

  if (action === "answer") {
    const modal = new ModalBuilder()
      .setCustomId("qz:modal")
      .setTitle("Đoán bài hát")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("answer")
            .setLabel("Tên bài hát (hoặc nghệ sĩ)")
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
    return interaction.reply(ephemeral(infoEmbed(hint ?? "Chưa thể xin gợi ý lúc này.")));
  }

  if (action === "skip") {
    if (interaction.user.id !== session.starterId && !isDj(interaction.member, interaction.guildId)) {
      return interaction.reply(ephemeral(errorEmbed("Chỉ người bắt đầu ván hoặc DJ mới bỏ qua được vòng.")));
    }
    session.skipRound();
    return interaction.reply(ephemeral(infoEmbed("⏭️ Đang bỏ qua vòng này.")));
  }
}

/** Gửi câu trả lời từ cửa sổ nhập. */
export async function handleQuizModal(interaction) {
  const { player, session } = sessionOf(interaction);
  if (!session) return interaction.reply(ephemeral(errorEmbed("Ván đố nhạc này đã kết thúc.")));
  if (!inVoice(interaction, player)) return interaction.reply(ephemeral(errorEmbed("Bạn cần ở cùng kênh thoại với bot để chơi.")));

  const result = session.submit(interaction.user, interaction.fields.getTextInputValue("answer"));
  const messages = {
    correct: `✅ Chính xác! **+${result.points}** điểm${result.streak > 1 ? ` (chuỗi ${result.streak} 🔥)` : ""}.`,
    artist: `🎤 Đúng nghệ sĩ! **+${result.points}** điểm. Còn tên bài nữa nhé.`,
    "artist-again": "Bạn đã được điểm nghệ sĩ rồi, hãy đoán tên bài.",
    already: "Bạn đã trả lời đúng vòng này rồi.",
    late: "Vòng này chưa bắt đầu hoặc đã kết thúc.",
    wrong: "❌ Chưa đúng, thử lại nhé.",
  };
  const embed = result.status === "wrong" || result.status === "late" ? errorEmbed(messages[result.status]) : infoEmbed(messages[result.status]);
  return interaction.reply(ephemeral(embed));
}
