import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getSettings, updateSettings } from "../store.js";
import { infoEmbed } from "../utils/embeds.js";

const onOff = (value) => (value ? "Bật" : "Tắt");

export default {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Cài đặt bot cho server này")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("view").setDescription("Xem cài đặt hiện tại"))
    .addSubcommand((s) =>
      s
        .setName("dj-role")
        .setDescription("Chỉ role này mới được điều khiển nhạc (bỏ trống để ai cũng dùng được)")
        .addRoleOption((o) => o.setName("role").setDescription("Role DJ")),
    )
    .addSubcommand((s) =>
      s
        .setName("volume")
        .setDescription("Âm lượng mặc định mỗi khi bot vào kênh thoại")
        .addIntegerOption((o) =>
          o.setName("level").setDescription("Từ 1 đến 150").setMinValue(1).setMaxValue(150).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("fair-queue")
        .setDescription("Hàng chờ công bằng: mỗi người lần lượt một bài")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Bật hay tắt").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("vc-status")
        .setDescription("Tự ghi tên bài đang phát lên trạng thái kênh thoại")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Bật hay tắt").setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "dj-role") {
      const role = interaction.options.getRole("role");
      updateSettings(guildId, { djRoleId: role?.id ?? null });
      return interaction.reply({
        embeds: [infoEmbed(role ? `🎚️ Chỉ ${role} (và người có quyền Manage Server) được điều khiển nhạc. Ai cũng vẫn bỏ phiếu bỏ qua bài được.` : "🎚️ Đã tắt role DJ, ai cũng điều khiển được.")],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === "volume") {
      const level = interaction.options.getInteger("level", true);
      updateSettings(guildId, { defaultVolume: level });
      return interaction.reply({ embeds: [infoEmbed(`🔊 Âm lượng mặc định: **${level}%** (áp dụng từ lần bot vào kênh sau).`)] });
    }

    if (sub === "fair-queue") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateSettings(guildId, { fairQueue: enabled });
      return interaction.reply({
        embeds: [infoEmbed(enabled ? "⚖️ Đã bật hàng chờ công bằng: các bài mới được xếp luân phiên theo từng người." : "⚖️ Đã tắt hàng chờ công bằng.")],
      });
    }

    if (sub === "vc-status") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateSettings(guildId, { vcStatus: enabled });
      return interaction.reply({
        embeds: [infoEmbed(enabled ? "🎙️ Đã bật: tên bài đang phát sẽ hiện trên kênh thoại (bot cần quyền Set Voice Channel Status)." : "🎙️ Đã tắt trạng thái kênh thoại.")],
      });
    }

    const settings = getSettings(guildId);
    const stay = settings.stay247;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Cài đặt server")
      .addFields(
        { name: "Role DJ", value: settings.djRoleId ? `<@&${settings.djRoleId}>` : "Không giới hạn", inline: true },
        { name: "Âm lượng mặc định", value: `${settings.defaultVolume}%`, inline: true },
        { name: "Hàng chờ công bằng", value: onOff(settings.fairQueue), inline: true },
        { name: "Trạng thái kênh thoại", value: onOff(settings.vcStatus), inline: true },
        { name: "Chế độ 24/7", value: stay ? `Bật tại <#${stay.voiceChannelId}>${stay.radio ? " (radio)" : ""}` : "Tắt", inline: true },
      );
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
