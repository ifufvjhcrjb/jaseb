import TelegramBot from 'node-telegram-bot-api';

// 🔑 Ganti token di bawah dengan token bot kamu
const token = '8188837644:AAG3lvHYBM83oWpg9l1cjRfRI7hZeMPQFVI';

// Buat bot dengan polling
const bot = new TelegramBot(token, { polling: true });

// Saat ada pesan masuk
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log(`Pesan dari ${msg.from.username || msg.from.first_name}: ${text}`);

  // Balasan otomatis
  bot.sendMessage(chatId, `<b>⚠️ Maintenance / Perbaikan</b>
<blockquote>The bot is currently under maintenance.
Please wait a moment while we fix and improve everything. 🔧</blockquote>
<blockquote>Bot sedang dalam perbaikan.
Mohon tunggu sebentar, kami sedang memperbaiki dan meningkatkan sistem. 🔧</blockquote>`, {
  parse_mode: "HTML"
});
});