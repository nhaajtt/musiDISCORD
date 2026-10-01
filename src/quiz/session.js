import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { normalizeLocalTrack } from "../library/normalize.js";
import { announceBadges } from "../recorder.js";
import { addQuizResult, isOptedOut } from "../stats.js";
import { scheduleIdleLeave } from "../utils/idle.js";
import { musicPath } from "../utils/library.js";
import { buildHint, judgeAnswer, pickClipStart, pickRounds, scoreFor } from "./engine.js";

const GAP_MS = 5000;
const GRACE_MS = 5000;
const MAX_HINTS = 2;
const COLOR = 0xf5a524;
const medal = (i) => ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;

const buttons = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("qz:answer").setLabel("Trả lời").setEmoji("🎯").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("qz:hint").setLabel("Gợi ý").setEmoji("💡").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("qz:skip").setLabel("Bỏ qua vòng").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
  );

function humansIn(client, player) {
  const channel = client.guilds.cache.get(player.guildId)?.channels.cache.get(player.voiceChannelId);
  return channel ? channel.members.filter((m) => !m.user.bot).size : 0;
}

/**
 * Bắt đầu một ván đố nhạc. Chạy nền; trạng thái nằm ở player.getData("quiz") với các hàm
 * submit(user, text), hint(), skipRound(), abort() để lớp xử lý nút bấm gọi vào.
 */
export function startQuiz({ client, player, channel, starter, entries, rounds, clipMs, gapMs = GAP_MS, graceMs = GRACE_MS }) {
  const picked = pickRounds(entries, rounds);
  const windowMs = clipMs + graceMs;
  const requester = { id: client.user.id, username: "Đố nhạc" };

  const scores = new Map();
  let aborted = false;
  let round = null;
  let wake;
  const abortSignal = new Promise((resolve) => (wake = resolve));

  const sleep = (ms) => Promise.race([new Promise((r) => setTimeout(r, ms)), abortSignal]);
  const scoreOf = (user) => {
    if (!scores.has(user.id)) scores.set(user.id, { name: user.username, points: 0, correct: 0, streak: 0, best: 0 });
    return scores.get(user.id);
  };

  const session = {
    guildId: player.guildId,
    starterId: starter.id,
    total: picked.length,

    abort() {
      aborted = true;
      wake();
      round?.finish("abort");
    },

    /** Trả lời của một người chơi. Trả về { status, points? }. */
    submit(user, text) {
      if (!round?.startedAt) return { status: "late" };
      if (round.correct.has(user.id)) return { status: "already" };

      const verdict = judgeAnswer(text, round.entry);
      if (verdict === "wrong") return { status: "wrong" };

      const score = scoreOf(user);
      const elapsedMs = Date.now() - round.startedAt;

      if (verdict === "artist") {
        if (round.partial.has(user.id)) return { status: "artist-again" };
        round.partial.add(user.id);
        const points = scoreFor({ elapsedMs, windowMs, hints: round.hintLevel, partial: true });
        score.points += points;
        return { status: "artist", points };
      }

      const streak = score.streak + 1;
      const points = scoreFor({ elapsedMs, windowMs, hints: round.hintLevel, streak });
      score.points += points;
      score.correct += 1;
      score.streak = streak;
      score.best = Math.max(score.best, streak);
      round.correct.set(user.id, { name: user.username, points });
      round.refresh();

      const humans = humansIn(client, player);
      if (humans > 0 && round.correct.size >= humans) round.finish("all");
      return { status: "correct", points, streak };
    },

    /** Lộ thêm một gợi ý cho vòng hiện tại. */
    hint() {
      if (!round?.startedAt) return null;
      if (round.hintLevel >= MAX_HINTS) return "Đã hết gợi ý cho vòng này.";
      round.hintLevel += 1;
      round.refresh();
      return `💡 Gợi ý ${round.hintLevel}: ${buildHint(round.entry.title, round.hintLevel)}`;
    },

    skipRound() {
      round?.finish("skip");
    },
  };

  function roundEmbed(index, state) {
    const hints = [];
    for (let level = 1; level <= round.hintLevel; level++) hints.push(`💡 Gợi ý ${level}: ${buildHint(round.entry.title, level)}`);
    return new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`🎧 Vòng ${index + 1}/${picked.length}`)
      .setDescription(
        `Đoán **tên bài hát** (hoặc nghệ sĩ) trong **${Math.round(windowMs / 1000)} giây**!\nBấm 🎯 để trả lời. Trả lời nhanh được nhiều điểm hơn, mỗi gợi ý trừ 20 điểm.${hints.length ? `\n\n${hints.join("\n")}` : ""}`,
      )
      .setFooter({ text: `Đã trả lời đúng: ${round.correct.size}${state ? ` • ${state}` : ""}` });
  }

  async function playRound(entry, index) {
    const res = await player.search({ query: musicPath(entry.file), source: "local" }, requester).catch(() => null);
    const track = res?.tracks?.[0];
    if (!track) return;
    normalizeLocalTrack(track);

    const duration = track.info.duration || entry.durationMs || 0;
    const start = pickClipStart(duration, clipMs);
    const endTime = duration > 0 && start + clipMs < duration ? start + clipMs : undefined;

    round = { entry, startedAt: 0, hintLevel: 0, correct: new Map(), partial: new Set(), refresh() {}, finish() {} };
    const message = await channel.send({ embeds: [roundEmbed(index)], components: [buttons()] }).catch(() => null);
    round.refresh = () => message?.edit({ embeds: [roundEmbed(index)] }).catch(() => {});

    await player.queue.add(track);
    await player.play({ position: start, endTime });
    round.startedAt = Date.now();

    let timer;
    const outcome = await new Promise((resolve) => {
      round.finish = resolve;
      timer = setTimeout(() => resolve("time"), windowMs);
    });
    clearTimeout(timer);

    const finished = round;
    round = null;
    await player.stopPlaying(true, false).catch(() => {});

    // Ai không đúng vòng này thì mất chuỗi
    for (const [id, score] of scores) if (!finished.correct.has(id)) score.streak = 0;

    const winners = [...finished.correct.values()].map((w) => `${w.name} (+${w.points})`).join(", ");
    const reveal = new EmbedBuilder()
      .setColor(finished.correct.size ? 0x57f287 : 0xed4245)
      .setTitle(`Vòng ${index + 1}/${picked.length}: ${entry.title}`)
      .setDescription(
        `${entry.artist ? `**${entry.artist}**` : "Không rõ nghệ sĩ"}${entry.album ? ` • ${entry.album}` : ""}\n\n${winners ? `✅ ${winners}` : outcome === "skip" ? "⏭️ Đã bỏ qua vòng này." : "😅 Không ai đoán ra."}`,
      );
    await message?.edit({ embeds: [reveal], components: [] }).catch(() => {});
  }

  async function finish() {
    player.setData("quiz", undefined);
    await player.stopPlaying(true, false).catch(() => {});

    const ranking = [...scores.entries()].sort((a, b) => b[1].points - a[1].points);
    const lines = ranking.map(([id, s], i) => `${medal(i)} <@${id}> • **${s.points}** điểm (${s.correct} đúng, chuỗi dài nhất ${s.best})`);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(aborted ? "🛑 Ván đố nhạc đã dừng" : "🏁 Kết thúc ván đố nhạc")
      .setDescription(lines.join("\n") || "Không ai ghi điểm ván này.");
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});

    for (const [id, s] of ranking) {
      if (isOptedOut(id)) continue;
      addQuizResult(player.guildId, id, { points: s.points, correct: s.correct, bestStreak: s.best });
      announceBadges(client, player, id);
    }
    scheduleIdleLeave(player);
  }

  player.setData("quiz", session);

  (async () => {
    try {
      for (let i = 0; i < picked.length && !aborted; i++) {
        await playRound(picked[i], i);
        if (!aborted && i < picked.length - 1) await sleep(gapMs);
      }
    } catch (error) {
      console.error("Đố nhạc lỗi:", error);
    } finally {
      await finish();
    }
  })();

  return session;
}
