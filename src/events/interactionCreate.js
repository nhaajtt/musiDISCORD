import { Events, MessageFlags } from "discord.js";
import { handleContribButton, handleContribModal } from "../contrib/handlers.js";
import { handleLibraryButton } from "../library/handlers.js";
import { handleQuizButton, handleQuizModal } from "../quiz/handlers.js";
import { handleControl } from "../utils/controls.js";
import { errorEmbed } from "../utils/embeds.js";
import { handleSearchButton } from "../utils/searchHandlers.js";

async function safely(label, interaction, handler) {
  try {
    await handler(interaction);
  } catch (error) {
    console.error(`${label} failed:`, error);
    const payload = { embeds: [errorEmbed("Something went wrong, please try again.")], flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

export default {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    // Control buttons under the "Now playing" message
    if (interaction.isButton() && interaction.customId.startsWith("np:")) {
      return safely("Control button", interaction, handleControl);
    }

    // Search results: numbered buttons under /search
    if (interaction.isButton() && interaction.customId.startsWith("sr:")) {
      return safely("Search button", interaction, handleSearchButton);
    }

    // Music quiz: buttons and the answer input modal
    if (interaction.isButton() && interaction.customId.startsWith("qz:")) {
      return safely("Quiz button", interaction, handleQuizButton);
    }
    if (interaction.isModalSubmit() && interaction.customId === "qz:modal") {
      return safely("Quiz answer", interaction, handleQuizModal);
    }

    // Music contributions: the bot owner approves or rejects
    if (interaction.isButton() && interaction.customId.startsWith("ct:")) {
      return safely("Contribution button", interaction, handleContribButton);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("ct:rmodal:")) {
      return safely("Contribution rejection", interaction, handleContribModal);
    }

    // Auto-tagging: the bot owner applies or ignores suggestions
    if (interaction.isButton() && interaction.customId.startsWith("lb:")) {
      return safely("Library button", interaction, handleLibraryButton);
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    if (interaction.isAutocomplete()) {
      try {
        await command.autocomplete?.(interaction);
      } catch (error) {
        console.error(`Autocomplete /${interaction.commandName} failed:`, error);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    return safely(`Command /${interaction.commandName}`, interaction, (i) => command.execute(i));
  },
};
