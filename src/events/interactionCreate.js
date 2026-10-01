import { Events, MessageFlags } from "discord.js";
import { handleContribButton, handleContribModal } from "../contrib/handlers.js";
import { handleLibraryButton } from "../library/handlers.js";
import { handleQuizButton, handleQuizModal } from "../quiz/handlers.js";
import { handleControl } from "../utils/controls.js";
import { errorEmbed } from "../utils/embeds.js";

async function safely(label, interaction, handler) {
  try {
    await handler(interaction);
  } catch (error) {
    console.error(`${label} lỗi:`, error);
    const payload = { embeds: [errorEmbed("Có lỗi xảy ra, bạn thử lại nhé.")], flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

export default {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    // Nút điều khiển dưới tin nhắn "Đang phát"
    if (interaction.isButton() && interaction.customId.startsWith("np:")) {
      return safely("Nút điều khiển", interaction, handleControl);
    }

    // Đố nhạc: nút bấm và cửa sổ nhập đáp án
    if (interaction.isButton() && interaction.customId.startsWith("qz:")) {
      return safely("Nút đố nhạc", interaction, handleQuizButton);
    }
    if (interaction.isModalSubmit() && interaction.customId === "qz:modal") {
      return safely("Đáp án đố nhạc", interaction, handleQuizModal);
    }

    // Đóng góp nhạc: chủ bot duyệt hoặc từ chối
    if (interaction.isButton() && interaction.customId.startsWith("ct:")) {
      return safely("Nút đóng góp", interaction, handleContribButton);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("ct:rmodal:")) {
      return safely("Từ chối đóng góp", interaction, handleContribModal);
    }

    // Gắn thẻ tự động: chủ bot áp dụng hoặc bỏ qua gợi ý
    if (interaction.isButton() && interaction.customId.startsWith("lb:")) {
      return safely("Nút thư viện", interaction, handleLibraryButton);
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    if (interaction.isAutocomplete()) {
      try {
        await command.autocomplete?.(interaction);
      } catch (error) {
        console.error(`Autocomplete /${interaction.commandName} lỗi:`, error);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    return safely(`Lệnh /${interaction.commandName}`, interaction, (i) => command.execute(i));
  },
};
