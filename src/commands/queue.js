import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { accentFor, V2 } from "../ui/nowPlaying.js";
import { errorEmbed, formatDuration } from "../utils/embeds.js";

const PER_PAGE = 10;
const trim = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function buildPage(player, page) {
  const tracks = player.queue.tracks;
  const pages = Math.max(1, Math.ceil(tracks.length / PER_PAGE));
  const start = page * PER_PAGE;
  const lines = tracks
    .slice(start, start + PER_PAGE)
    .map((t, i) => `**${start + i + 1}.** ${trim(t.info.title, 70)} — ${trim(t.info.author || "Không rõ", 40)} \`${formatDuration(t.info.duration)}\``);

  const current = player.queue.current;
  const total = tracks.reduce((sum, t) => sum + (t.info.isStream ? 0 : t.info.duration || 0), 0);

  const container = new ContainerBuilder().setAccentColor(accentFor(current?.info.title ?? "queue"));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Hàng chờ\n**Đang phát:** ${current ? `${trim(current.info.title, 80)} — ${trim(current.info.author || "Không rõ", 40)}` : "—"}`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n") || "Hàng chờ trống."));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Trang ${page + 1}/${pages} • ${tracks.length} bài • ${formatDuration(total)}`),
  );

  if (pages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("q:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId("q:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
      ),
    );
  }
  return { components: [container], flags: V2 };
}

export default {
  data: new SlashCommandBuilder().setName("queue").setDescription("Xem hàng chờ"),

  async execute(interaction) {
    const player = interaction.client.lavalink.getPlayer(interaction.guildId);
    if (!player || (!player.queue.current && !player.queue.tracks.length)) {
      return interaction.reply({ embeds: [errorEmbed("Hàng chờ đang trống.")], flags: MessageFlags.Ephemeral });
    }

    let page = 0;
    const message = await interaction.reply({ ...buildPage(player, page), withResponse: true }).then((r) => r.resource?.message ?? interaction.fetchReply());

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith("q:"),
    });

    collector.on("collect", async (i) => {
      page = Math.max(0, page + (i.customId === "q:next" ? 1 : -1));
      await i.update(buildPage(player, page));
    });
    collector.on("end", () => {
      const final = buildPage(player, page);
      // Bỏ hàng nút chuyển trang (hàng cuối của khung) khi hết thời gian
      if (Math.ceil(player.queue.tracks.length / PER_PAGE) > 1) final.components[0].components.pop();
      interaction.editReply(final).catch(() => {});
    });
  },
};
