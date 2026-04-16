const { Telegraf } = require("telegraf");
const admin = require("firebase-admin");
const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION & INITIALIZATION
// ────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.RENDER_EXTERNAL_URL; // Render automatically provides this
const FIREBASE_BASE64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");

// Initialize Firebase Admin
try {
  let serviceAccount;
  if (FIREBASE_BASE64) {
    const jsonStr = Buffer.from(FIREBASE_BASE64, "base64").toString("utf8");
    serviceAccount = JSON.parse(jsonStr);
  } else {
    // Fallback to local file for development
    serviceAccount = require("./serviceAccountKey.json");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized.");
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin:", error);
}

const db = admin.firestore();
const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(bodyParser.json());

// ────────────────────────────────────────────────────────────────────────────
// BOT COMMANDS
// ────────────────────────────────────────────────────────────────────────────

bot.start((ctx) => {
  ctx.reply(
    "🚀 Chào mừng bạn đến với VocaFlow Bot!\n\n" +
      "Các lệnh có sẵn:\n" +
      "/link <uid> — Liên kết tài khoản VocaFlow\n" +
      "/settime — Chọn giờ nhận từ vựng hàng ngày\n" +
      "/status — Xem lịch trình đang hoạt động\n\n" +
      "Tạo lịch trình trên Dashboard → Tab Schedule nhé! 📚",
  );
});

bot.command("link", async (ctx) => {
  const uid = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!uid) {
    return ctx.reply(
      "Vui lòng cung cấp UID VocaFlow của bạn.\nCách dùng: /link <uid-của-bạn>",
    );
  }

  try {
    const chatId = ctx.chat.id;
    await db.collection("users").doc(uid).set(
      {
        telegramChatId: chatId,
      },
      { merge: true },
    );

    ctx.reply(
      `✅ Liên kết thành công!\n\n` +
        `Telegram của bạn đã được kết nối với VocaFlow UID: ${uid.slice(0, 8)}...\n\n` +
        `📌 Bước tiếp theo:\n` +
        `/settime — Chọn giờ nhận từ vựng hàng ngày\n` +
        `/status — Xem lịch trình đang hoạt động`,
    );
  } catch (err) {
    ctx.reply("❌ Liên kết thất bại. Vui lòng kiểm tra lại UID và thử lại.");
  }
});

bot.command("status", async (ctx) => {
  const chatId = ctx.chat.id;
  try {
    const userSnap = await db
      .collection("users")
      .where("telegramChatId", "==", chatId)
      .get();
    if (userSnap.empty) {
      return ctx.reply(
        "Bạn chưa liên kết tài khoản. Dùng /link <uid> trước nhé.",
      );
    }

    const userId = userSnap.docs[0].id;
    const activeSchedules = await db
      .collection("schedules")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .get();

    if (activeSchedules.empty) {
      return ctx.reply("📭 Không có lịch trình nào đang hoạt động.");
    }

    let msg = "📋 *Lịch trình đang hoạt động:*\n\n";
    let count = 1; // Dùng biến đếm thủ công
    activeSchedules.forEach((doc) => {
      const s = doc.data();
      // Kiểm tra tránh chia cho 0
      const progress =
        s.totalWords > 0
          ? Math.round((s.processedCount / s.totalWords) * 100)
          : 0;

      msg += `${count}. *${s.deckTitle || "Chưa đặt tên"}*\n`;
      msg += `   ${s.processedCount}/${s.totalWords} cards (${progress}%) · ${s.wordsPerDay}/day\n\n`;
      count++;
    });

    ctx.reply(msg, { parse_mode: "Markdown" });
  } catch (err) {
    ctx.reply("❌ Lỗi khi tải lịch trình.");
  }
});

bot.command("settime", async (ctx) => {
  const arg = ctx.message.text.split(" ")[1]; // Lấy phần số sau lệnh /settime

  if (arg !== undefined) {
    const hour = parseInt(arg, 10);
    // Kiểm tra tính hợp lệ (0-23)
    if (!isNaN(hour) && hour >= 0 && hour <= 23) {
      try {
        const chatId = ctx.chat.id;
        const userSnap = await db
          .collection("users")
          .where("telegramChatId", "==", chatId)
          .get();

        if (userSnap.empty)
          return ctx.reply("❌ Lỗi: Bạn cần /link <uid> trước.");

        await db
          .collection("users")
          .doc(userSnap.docs[0].id)
          .update({ sendHour: hour });
        return ctx.reply(
          `✅ Đã đặt giờ nhận từ vựng thành công lúc *${hour}:00* hàng ngày.`,
          { parse_mode: "Markdown" },
        );
      } catch (err) {
        return ctx.reply("❌ Có lỗi xảy ra khi lưu giờ.");
      }
    } else {
      return ctx.reply(
        "⚠️ Vui lòng nhập giờ từ 0 đến 23. Ví dụ: `/settime 15`",
      );
    }
  }

  // Nếu không có số đi kèm, hiện bảng chọn như Cách 1
  const buttons = [];
  for (let i = 0; i < 24; i++)
    buttons.push({ text: `${i}h`, callback_data: `settime_${i}` });
  const keyboard = [];
  while (buttons.length) keyboard.push(buttons.splice(0, 4));

  ctx.reply("⏰ Chọn hoặc gõ `/settime <giờ>` để đặt lịch nhận từ vựng:", {
    reply_markup: { inline_keyboard: keyboard },
  });
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data?.startsWith("settime_")) return;

  const hour = parseInt(data.replace("settime_", ""), 10);
  const chatId = ctx.callbackQuery.from.id;

  try {
    const userSnap = await db
      .collection("users")
      .where("telegramChatId", "==", chatId)
      .get();
    if (userSnap.empty)
      return ctx.answerCbQuery("❌ Lỗi: Tài khoản chưa liên kết.");

    await db
      .collection("users")
      .doc(userSnap.docs[0].id)
      .update({ sendHour: hour });
    await ctx.answerCbQuery(`✅ Đã đặt giờ: ${hour}:00`);
    await ctx.editMessageText(
      `✅ Đã cập nhật thành công!\n\n📬 Bạn sẽ nhận từ vựng hàng ngày lúc *${hour}:00* (giờ Việt Nam).`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    await ctx.answerCbQuery("❌ Lỗi khi lưu.");
  }
});

// ────────────────────────────────────────────────────────────────────────────
// CRON LOGIC (TRIGGERED VIA HTTP)
// ────────────────────────────────────────────────────────────────────────────

function getVNDateParts() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

async function handleDripFeed(nowMs) {
  const readableTime = convertTime(nowMs);
  console.log(`⏰ Cron check tại giờ VN: ${readableTime}`);
  try {
    const { year, month, day } = getVNDateParts(); // ✅ fix

    const todayKey = `${year}-${month}-${day}`; // dùng chống duplicate

    const schedulesSnap = await db
      .collection("schedules")
      .where("status", "==", "active")
      .get();

    for (const sDoc of schedulesSnap.docs) {
      const schedule = sDoc.data();
      const userRes = await db.collection("users").doc(schedule.userId).get();
      const userData = userRes.data() || {};
      const userSendHour = userData.sendHour || 7;

      const targetTime = new Date(
        `${year}-${month}-${day}T${String(userSendHour).padStart(2, "0")}:00:00+07:00`,
      ).getTime();

      const diff = nowMs - targetTime;

      // ❌ ngoài window
      if (diff < 0 || diff >= 15 * 60 * 1000) continue;

      // ❌ chống duplicate
      if (schedule.lastSentDate === todayKey) continue;

      const {
        words,
        processedCount,
        totalWords,
        wordsPerDay,
        deckId,
        userId,
        deckTitle,
      } = schedule;
      if (processedCount >= totalWords) continue;

      const todayWords = words.slice(
        processedCount,
        processedCount + wordsPerDay,
      );
      if (todayWords.length === 0) continue;

      const batch = db.batch();
      todayWords.forEach((w) => {
        const cardRef = db.collection("cards").doc();
        batch.set(cardRef, {
          ...w,
          type: "vocab",
          userId,
          deckId,
          level: 0,
          reps: 0,
          interval: 0,
          easeFactor: 2.5,
          nextReview: admin.firestore.Timestamp.now(),
          unlockAt: admin.firestore.Timestamp.now(),
          createdAt: admin.firestore.Timestamp.now(),
        });
      });

      const deckRef = db.collection("decks").doc(deckId);
      batch.update(deckRef, {
        cardCount: admin.firestore.FieldValue.increment(todayWords.length),
      });

      const newProcessedCount = processedCount + todayWords.length;
      batch.update(sDoc.ref, {
        processedCount: newProcessedCount,
        status: newProcessedCount >= totalWords ? "completed" : "active",
        lastSentDate: todayKey,
      });

      await batch.commit();

      if (userData.telegramChatId) {
        let msg = `📚 *Từ vựng hôm nay - VocaFlow*\nBộ thẻ: *${deckTitle}*\n\n`;
        todayWords.forEach((w, i) => {
          msg += `${i + 1}. *${w.term}* (${w.ipa})\n   → ${w.definition}\n\n`;
        });
        msg += `📊 Tiến độ: ${newProcessedCount}/${totalWords}`;
        bot.telegram
          .sendMessage(userData.telegramChatId, msg, { parse_mode: "Markdown" })
          .catch(console.error);
      }
    }
  } catch (err) {
    console.error("Drip-feed error:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// WEB SERVER ROUTES
// ────────────────────────────────────────────────────────────────────────────

// Endpoint for Cron-job.org to ping every hour
app.get("/cron", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      console.log("⚠️ Warning: Unauthorized cron attempt.");
      return res.status(401).send("401"); // Chỉ trả về số 401 cho nhẹ
    }

    const now = Date.now();

    const readableTime = convertTime(now);

    console.log(`⏰ Current time VN: ${readableTime}`);
    console.log(`⏰ Current timestamp: ${now}`);

    await handleDripFeed(now);

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Cron Error:", error.message);
    res.status(500).send("ERR");
  }
});

function convertTime(ms) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.format(new Date(ms));
}

// Root route (for keep-alive or checking status)
app.get("/", (req, res) => res.send("🤖 VocaFlow Standalone Bot is running!"));

// Webhook endpoint for Telegram
app.post("/webhook", bot.webhookCallback("/webhook"));

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server listening on port ${PORT}`);

  if (WEBHOOK_DOMAIN) {
    const webhookUrl = `${WEBHOOK_DOMAIN}/webhook`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`🔗 Webhook set to: ${webhookUrl}`);
  } else {
    console.log(
      "⚠️ No Webhook Domain set. Running in polling mode (Not recommended for Render Free).",
    );
    bot.launch();
  }
});
