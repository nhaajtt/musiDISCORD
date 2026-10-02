// Connects the companion engine to Discord: several bot accounts in one process, typing indicators, replies,
// and the /companions command (registered on the first bot only).
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ChannelType,
} from "discord.js";
import { getContent } from "./content/index.js";
import { CompanionEngine } from "./engine.js";
import { LANGUAGES, PRESETS, createSettingsStore, validTimeZone } from "./settings.js";

const TICK_MS = 15_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const companionsCommand = new SlashCommandBuilder()
  .setName("companions")
  .setDescription("Set up the companion bots that chat in your server")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("setup")
      .setDescription("Pick the channel the companions chat in and turn them on")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("A text channel all companion bots can see and write in").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("language").setDescription("Language they speak (default: English)").addChoices({ name: "English", value: "en" }, { name: "Tiếng Việt", value: "vi" }),
      ),
  )
  .addSubcommand((s) => s.setName("on").setDescription("Turn the companions on"))
  .addSubcommand((s) => s.setName("off").setDescription("Turn the companions off"))
  .addSubcommand((s) =>
    s
      .setName("frequency")
      .setDescription("How often they start a conversation")
      .addStringOption((o) =>
        o
          .setName("level")
          .setDescription("Calm, normal or lively")
          .setRequired(true)
          .addChoices(...Object.entries(PRESETS).map(([value, p]) => ({ name: `${p.label}: up to ${p.dailyCap} a day`, value }))),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("quiet")
      .setDescription("Hours when they stay silent, in the server's time zone")
      .addIntegerOption((o) => o.setName("from").setDescription("Hour they go quiet, 0-23 (default 23)").setMinValue(0).setMaxValue(23).setRequired(true))
      .addIntegerOption((o) => o.setName("until").setDescription("Hour they speak again, 0-23 (default 8)").setMinValue(0).setMaxValue(23).setRequired(true)),
  )
  .addSubcommand((s) => s.setName("now").setDescription("Start a conversation right now (to test it)"))
  .addSubcommand((s) => s.setName("status").setDescription("Show the current settings"));

const REQUIRED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];

/** Starts every companion bot and the engine. `tokens` are bot tokens; the first one hosts the slash command. */
export async function startCompanions({ tokens, store, timezone, log = console.log }) {
  const slots = [];

  for (const [slot, token] of tokens.entries()) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
    client.once(Events.ClientReady, (c) => log(`Companion ${slot + 1} is online as ${c.user.tag}`));
    try {
      await client.login(token);
      slots.push({ slot, client });
    } catch (error) {
      console.error(`Companion ${slot + 1} could not log in (${error.message}). Skipping it.`);
      client.destroy();
    }
  }
  if (slots.length < 2) throw new Error("At least two companion bots must be able to log in.");
  const bySlot = new Map(slots.map((s) => [s.slot, s.client]));

  /** Can this bot write in the chosen channel of that server right now? */
  const canWrite = (client, guildId, channelId) => {
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    const me = guild?.members.me;
    return Boolean(channel?.isTextBased() && me && channel.permissionsFor(me)?.has(REQUIRED));
  };

  const bots = {
    available: (guildId, channelId) => slots.filter(({ client }) => canWrite(client, guildId, channelId)).map(({ slot }) => ({ slot })),

    async send({ slot, guildId, channelId, text, replyTo }) {
      const client = bySlot.get(slot);
      const channel = client?.guilds.cache.get(guildId)?.channels.cache.get(channelId);
      if (!channel?.isTextBased()) return null;
      try {
        // Look like someone typing: a pause that grows with the length of the message
        await channel.sendTyping().catch(() => {});
        await sleep(Math.min(4000, 800 + text.length * 35));
        const message = await channel.send({
          content: text,
          reply: replyTo ? { messageReference: replyTo, failIfNotExists: false } : undefined,
          allowedMentions: { parse: [], repliedUser: false },
        });
        return message.id;
      } catch (error) {
        console.error(`Companion ${slot + 1} could not send a message:`, error.message);
        return null;
      }
    },
  };

  const engine = new CompanionEngine({ store, content: getContent, bots, timezone, log });

  // Every bot hears every message; the engine ignores duplicates. Bots (including the companions) are never "people".
  for (const { client } of slots) {
    client.on(Events.MessageCreate, (message) => {
      if (!message.guildId || message.author.bot || message.system || message.webhookId) return;
      engine.noteHumanMessage({
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        replyToMessageId: message.reference?.messageId ?? null,
      });
    });
  }

  // The slash command lives on the first bot, registered per server so it shows up immediately
  const host = slots[0].client;
  const registerFor = (guild) => guild.commands.set([companionsCommand.toJSON()]).catch((e) => console.error(`Could not register /companions in ${guild.name}:`, e.message));
  // The list of servers is only known once the bot is ready
  if (host.isReady()) host.guilds.cache.forEach(registerFor);
  else host.once(Events.ClientReady, (c) => c.guilds.cache.forEach(registerFor));
  host.on(Events.GuildCreate, registerFor);
  host.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "companions") return;
    handleCommand(interaction, { store, engine, slots, timezone }).catch(async (error) => {
      console.error("/companions failed:", error);
      const payload = { content: "Something went wrong with that command.", flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    });
  });

  const timer = setInterval(() => engine.tick().catch((e) => console.error("Companions tick failed:", e)), TICK_MS);
  timer.unref?.();
  log(`Companions running with ${slots.length} bots. Time zone: ${timezone}.`);

  return {
    engine,
    stop: async () => {
      clearInterval(timer);
      await Promise.all(slots.map(({ client }) => client.destroy()));
    },
  };
}

const hours = (ms) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} hours` : `${Math.max(1, Math.round(ms / 60_000))} minutes`);

async function handleCommand(interaction, { store, engine, slots, timezone }) {
  const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const settings = store.get(guildId);

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    const language = interaction.options.getString("language") ?? settings.language;
    if (!LANGUAGES.includes(language)) return reply("That language is not available.");
    store.update(guildId, { channelId: channel.id, language, enabled: true });

    const present = engine.status(guildId).botsAvailable;
    const warning =
      present < 2
        ? `\n⚠️ Only **${present}** companion bot${present === 1 ? " can" : "s can"} write in ${channel}. I need at least two. Invite the others and give them View Channel, Send Messages and Read Message History in that channel.`
        : "";
    return reply(`✅ Companions will chat in ${channel} (${language === "vi" ? "Tiếng Việt" : "English"}). The first conversation comes after a normal gap, or use \`/companions now\` to see one right away.${warning}`);
  }

  if (sub === "on" || sub === "off") {
    if (sub === "on" && !settings.channelId) return reply("Pick a channel first with `/companions setup`.");
    store.update(guildId, { enabled: sub === "on" });
    return reply(sub === "on" ? "✅ Companions are on." : "🔇 Companions are off. They will not say anything until you turn them back on.");
  }

  if (sub === "frequency") {
    const level = interaction.options.getString("level", true);
    store.update(guildId, { preset: level });
    return reply(`⏱️ Frequency set to **${PRESETS[level].label}**: a conversation every ${PRESETS[level].minGapMin / 60} to ${PRESETS[level].maxGapMin / 60} hours, at most ${PRESETS[level].dailyCap} a day.`);
  }

  if (sub === "quiet") {
    const from = interaction.options.getInteger("from", true);
    const until = interaction.options.getInteger("until", true);
    store.update(guildId, { quietStart: from, quietEnd: until });
    return reply(from === until ? "🔔 No quiet hours: they may speak at any time." : `🤫 Quiet from ${from}:00 to ${until}:00 (${timezone}).`);
  }

  if (sub === "now") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await engine.startNow(guildId);
    return interaction.editReply(result.started ? "💬 Started a conversation. Watch the channel." : `Could not start: ${result.reason}`);
  }

  // status
  const status = engine.status(guildId);
  const lines = [
    `**Companions:** ${settings.enabled ? "on" : "off"}`,
    `**Channel:** ${settings.channelId ? `<#${settings.channelId}>` : "not set (use `/companions setup`)"}`,
    `**Language:** ${settings.language === "vi" ? "Tiếng Việt" : "English"}`,
    `**Frequency:** ${PRESETS[settings.preset]?.label ?? "Normal"}, today ${status.startsToday} of ${status.dailyCap}`,
    `**Quiet hours:** ${settings.quietStart === settings.quietEnd ? "none" : `${settings.quietStart}:00 to ${settings.quietEnd}:00`} (${timezone})`,
    `**Bots that can write there:** ${status.botsAvailable} of ${slots.length}`,
    status.talking ? "Right now: in the middle of a conversation." : status.nextStartInMs === null ? "" : `Next conversation: in about ${hours(status.nextStartInMs)}, if it is not quiet hours.`,
  ].filter(Boolean);
  return reply(lines.join("\n"));
}

export { createSettingsStore, validTimeZone };
