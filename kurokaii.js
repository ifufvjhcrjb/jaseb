const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const os = require("os");
const chalk = require("chalk");
const DATA_FILE = "data.json";
let autoShares = {};
const chatSessions = {};

// kurokaii.js
if (process.env.INDEX_RUN !== "true") {
    console.log("❌ Akses ditolak!\n");
    process.exit();
}
const {
    BOT_TOKEN,
    OWNER_IDS,
    CHANNEL_USERNAME,
    DEVELOPER,
    VERSION,
    CHANNEL_URL,
    MENU_IMAGES
} = require("./config.js");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const BOT_START_TIME = Date.now();
const defaultData = {
    premium: {},
    owner: OWNER_IDS,
    groups: [],
    users: [],
    blacklist: []
};
let BOT_USERNAME = null;

bot.getMe()
    .then(me => {
        BOT_USERNAME = me.username;
        console.log("🤖 Bot username:", BOT_USERNAME);
    })
    .catch(err => {
        console.error("❌ Gagal ambil info bot:", err);
    });
function formatUptime(seconds) {
  seconds = Math.floor(seconds); // buang pecahan detik
  const days = Math.floor(seconds / (24 * 3600));
  seconds %= 24 * 3600;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}
function waktuIndonesia() {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
  });
}

function getRandomImage() {
    return MENU_IMAGES[Math.floor(Math.random() * MENU_IMAGES.length)];
}

function loadData() {
    try {
        const file = fs.readFileSync(DATA_FILE, "utf8");
        return JSON.parse(file);
    } catch {
        return defaultData;
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function isMainOwner(id) {
    return OWNER_IDS.map(String).includes(String(id));
}

function isAdditionalOwner(id) {
    const data = loadData();
    return (
        Array.isArray(data.owner) && data.owner.map(String).includes(String(id))
    );
}

function isAnyOwner(id) {
    return isMainOwner(id) || isAdditionalOwner(id);
}

function isOwner(id) {
    return isAnyOwner(id);
}

function isPremium(id) {
    const data = loadData();
    const exp = data.premium[id];
    if (!exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec < exp;
}

function getGlobalCooldownMinutes() {
    const data = loadData();
    if (
        data.settings &&
        data.settings.cooldown &&
        data.settings.cooldown.default
    ) {
        return data.settings.cooldown.default;
    }
    return 15;
}

function getGlobalCooldownMs() {
    return getGlobalCooldownMinutes() * 60 * 1000;
}

async function requireNotBlacklisted(msg) {
    const userId = msg.from.id;
    if (isBlacklisted(userId)) {
        await bot.sendMessage(
            userId,
            "⛔ Kamu diblokir tidak bisa menggunakan bot."
        );
        return false;
    }
    return true;
}

function isBlacklisted(userId) {
    const data = loadData();
    return (
        Array.isArray(data.blacklist) &&
        data.blacklist.map(String).includes(String(userId))
    );
}

const { writeFileSync, existsSync, mkdirSync } = require("fs");

function backupData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = "./backup";
    const backupPath = `${backupDir}/data-${timestamp}.json`;

    if (!existsSync(backupDir)) mkdirSync(backupDir);
    if (!existsSync(DATA_FILE)) return null;
    const content = fs.readFileSync(DATA_FILE);
    writeFileSync(backupPath, content);

    return backupPath;
}

bot.on("my_chat_member", async msg => {
    try {
        const data = loadData();
        const chat = msg.chat || msg.chat_member?.chat;
        const user = msg.from;
        const status = msg.new_chat_member?.status;
        const chatId = chat?.id;
        const userId = user?.id;

        if (!chat || !user || !status || !chatId || !userId) return;

        const isGroup = chat.type === "group" || chat.type === "supergroup";
        const mainOwner = OWNER_IDS[0];

        if (!data.groups) data.groups = [];
        if (!data.user_group_count) data.user_group_count = {};
        if (!data.premium) data.premium = {};

        const minGrupPermanent = 10;
        const premHariPerGrup = 7;

        // === BOT DITAMBAHKAN ===
        if (["member", "administrator"].includes(status)) {
    if (isGroup && !data.groups.includes(chatId)) {
        data.groups.push(chatId);

        data.user_group_count[userId] =
            (data.user_group_count[userId] || 0) + 1;
        const total = data.user_group_count[userId];

        let memberCount = 0;
        try {
            memberCount = await bot.getChatMemberCount(chatId).catch(() => 0);
        } catch {
            memberCount = 0;
        }

        if (memberCount >= 15) {
            const sekarang = Math.floor(Date.now() / 1000);
            let durasiDetik = 0;

            // ============================
            // 🚀 FIX: Jangan ubah jika SUDAH PERMANENT
            // ============================
            if (data.premium[userId] === "permanent") {

                // Sudah permanent → cukup kirim notif owner saja
                bot.sendMessage(
    userId,
    `✨ *Bot berhasil ditambahkan ke grup baru!*

🔒 Status akun kamu: *PERMANEN*  
Tenang aja — tidak ada perubahan apa pun pada statusmu.

🚀 Selamat menikmati semua fitur tanpa batas!`,
    { parse_mode: "Markdown" }
).catch(() => {});

            } else {

                // Belum permanent → cek apakah harus jadi permanent
                if (total >= minGrupPermanent) {

                    data.premium[userId] = "permanent";

                    bot.sendMessage(
    userId,
    `🏆 *Pencapaian Terbuka!*

🎉 Bot berhasil ditambahkan ke *${total} grup*
👑 Status *Premium PERMANEN* resmi aktif!

🚀 Terima kasih sudah mendukung.
Nikmati semua fitur tanpa batas!`,
    { parse_mode: "Markdown" }
).catch(() => {});

                } else {

                    // Tambah durasi hari
                    durasiDetik = premHariPerGrup * 86400;

                    const current = data.premium[userId] || sekarang;

                    data.premium[userId] =
                        current > sekarang
                            ? current + durasiDetik
                            : sekarang + durasiDetik;

                    bot.sendMessage(
    userId,
    `🎊 *Reward Diterima!*

👥 Bot berhasil ditambahkan ke *${total} grup* (≥15 member)
⏳ Premium aktif selama *${premHariPerGrup} hari*

✨ Terima kasih sudah mendukung.
Selamat menikmati fitur premium!`,
    { parse_mode: "Markdown" }
).catch(() => {});
                }
            }

            // ============================
            // Notifikasi Owner + Backup
            // ============================
            const info = `
➕ Bot ditambahkan ke grup baru!

👤 User: [${user.first_name}](tg://user?id=${userId})
🔗 Username: @${user.username || "-"}
🆔 ID User: \`${userId}\`

👥 Grup: ${chat.title}
🆔 ID Grup: \`${chatId}\`

📊 Total Grup Ditambahkan: ${total}
👥 Member Grup: ${memberCount}
`.trim();

            await bot.sendMessage(mainOwner, info, { parse_mode: "Markdown" }).catch(() => { });

            const backupPath = backupData();
            if (backupPath) {
                await bot.sendDocument(mainOwner, backupPath, {}, {
                    filename: "data-backup.json"
                }).catch(() => { });
            }

        } else {
            bot.sendMessage(
                userId,
                `⚠️ Grup ${chat.title} hanya punya ${memberCount} member.\n❌ Minimal 15 member.`
            ).catch(() => { });
        }

        saveData(data);
    }
}


        // === BOT DIKELUARKAN ===
        if (["left", "kicked", "banned", "restricted"].includes(status)) {
            if (isGroup && data.groups.includes(chatId)) {
                data.groups = data.groups.filter(id => id !== chatId);

                if (data.user_group_count[userId]) {
                    data.user_group_count[userId]--;

                    if (data.user_group_count[userId] < minGrupPermanent) {
                        delete data.premium[userId];
                        bot.sendMessage(
                            userId,
                            `❌ Kamu menghapus bot dari grup.\n🔒 Premium otomatis dicabut.`
                        ).catch(() => {});
                    }

                    let memberCount = 0;
                    try {
                        memberCount = await bot
                            .getChatMemberCount(chatId)
                            .catch(() => 0);
                    } catch {
                        memberCount = 0;
                    }

                    const info = `
⚠️ Bot dikeluarkan dari grup!

👤 User: [${user.first_name}](tg://user?id=${userId})
🔗 Username: @${user.username || "-"}
🆔 ID User: \`${userId}\`

👥 Grup: ${chat.title}
🆔 ID Grup: \`${chatId}\`

📊 Total Grup Saat Ini: ${data.user_group_count[userId] || 0}
👥 Member Grup: ${memberCount}
`.trim();

                    await bot
                        .sendMessage(mainOwner, info, {
                            parse_mode: "Markdown"
                        })
                        .catch(() => {});

                    const backupPath = backupData();
                    if (backupPath) {
                        await bot
                            .sendDocument(
                                mainOwner,
                                backupPath,
                                {},
                                { filename: "data-backup.json" }
                            )
                            .catch(() => {});
                    }
                }

                saveData(data);
            }
        }
    } catch (err) {
        console.error("❌ Error my_chat_member:", err);
    }
});

setInterval(() => {
    const data = loadData();
    const now = Math.floor(Date.now() / 1000);

    for (const uid in data.premium) {
    if (data.premium[uid] <= now) {

        delete data.premium[uid];

        console.log(
            `⚡ SYSTEM EVENT — PREMIUM EXPIRED\n` +
            `   • User: ${uid}\n` +
            `   • Action: Access Revoked 🚫\n` +
            `   • Reason: Subscription Timeout\n`
        );

        bot.sendMessage(
            uid,
            `🔔 *Notifikasi Sistem*\n` +
            `─────────────────────\n` +
            `🔒 Akses *Premium* kamu telah *nonaktif*.\n\n` +
            `⏳ Status: *Expired*\n` +
            `🗓 Waktu: ${waktuIndonesia()}\n\n` +
            `Untuk mengaktifkan kembali fitur eksklusif,\n` +
            `tekan tombol di bawah 👇`,
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "⚡ Aktifkan Premium",
                                url: "https://t.me/ku_kaii"
                            }
                        ]
                    ]
                }
            }
        ).catch(() => {});
    }
}

    saveData(data);
}, 60 * 1000);

async function checkChannelMembership(userId) {
    try {
        const chatMember = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ["member", "administrator", "creator"].includes(
            chatMember.status
        );
    } catch (err) {
        return false;
    }
}

async function requireJoin(msg) {
    const userId = msg.from.id;
    const isMember = await checkChannelMembership(userId);

    if (!isMember) {
        await bot.sendMessage(
            userId,
            "🚫 *Kamu belum bergabung Join Channel Di Bawah Untuk Memakai Bot!*",
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "📢 Gabung Channel",
                                url: `https://t.me/${CHANNEL_USERNAME.replace(
                                    "@",
                                    ""
                                )}`
                            }
                        ],
                        [
                            {
                                text: "🔁 Coba Lagi",
                                callback_data: "check_join_again"
                            }
                        ]
                    ]
                }
            }
        );
        return false;
    }
    return true;
}

function withRequireJoin(handler) {
    return async (msg, match) => {

        // Jika dari grup → langsung jalankan handler tanpa cek join
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            return handler(msg, match);
        }

        // Jika dari private → wajib cek channel
        const ok = await requireJoin(msg);
        if (!ok) return;

        return handler(msg, match);
    };
}

bot.on("callback_query", async query => {
    const userId = query.from.id;

    if (query.data === "check_join_again") {
        const isMember = await checkChannelMembership(userId);

        if (isMember) {
            await bot.sendMessage(userId, "✅ Makasih sudah join 🙌\nKlik /start buat klaim premium gratis 🎁");
        } else {
            await bot.sendMessage(userId, "❌ Lu Belum Join Tolol.");
        }

        bot.answerCallbackQuery(query.id);
    }
});

const activeMenus = {};

async function replaceMenu(chatId, caption, buttons) {
    try {
        if (activeMenus[chatId]) {
            try {
                await bot.deleteMessage(chatId, activeMenus[chatId]);
            } catch (e) {}
            delete activeMenus[chatId];
        }

        // Kirim pesan baru
        const sent = await bot.sendPhoto(chatId, getRandomImage(), {
            caption,
            parse_mode: "HTML",
            reply_markup: buttons
        });

        activeMenus[chatId] = sent.message_id;
    } catch (err) {
        console.error("replaceMenu error:", err);
    }
}
// simpan pesan terakhir per chat
const lastMenuMessage = {};

// ==================== START ====================
bot.onText(
    /\/start/,
    withRequireJoin(async msg => {
        if (!(await requireNotBlacklisted(msg))) return;

        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        const data = loadData();

        // Jika perintah /start berasal dari GRUP
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            return bot.sendMessage(
                chatId,
                "🌟 Selamat datang!\n" +
                "𝐁𝐨𝐭𝐉𝐚𝐬𝐞𝐛𝐟𝐫𝐞𝐞𝐁𝐨𝐭 berhasil ditambahkan.\n\n" +
                "✅ Bot siap bekerja\n" +
                "✅ Full fitur gratis\n" +
                "✅ Support untuk grup kamu\n\n" +
                "🔥 Nikmati pengalaman terbaik bersama bot ini!"
            );
        }

        // ============================
        // === MODE PRIVATE (USER) ====
        // ============================

        const waktuRunPanel = formatUptime(os.uptime());
        const username = msg.from.username
            ? `@${msg.from.username}`
            : "Tidak ada username";

        // Cegah duplikat user
        if (!data.users) data.users = [];

if (!data.users.includes(userId)) {
    data.users.push(userId);

    if (!data.premium) data.premium = {};

    const jamGratis = 6;
    const now = Math.floor(Date.now() / 1000);
    const detik = 3600 * jamGratis;

    const current = data.premium[userId] || 0;
    data.premium[userId] = current > now ? current + detik : now + detik;

    saveData(data);

    // Notif ke user
    bot.sendMessage(
        chatId,
        `🎉 *Premium Aktif!*\n\n⏱ Durasi: *${jamGratis} jam*\n💎 Nikmati semua fitur tanpa batas.`,
        { parse_mode: "Markdown" }
    );


    const userInfo = `
👑 *NOTIF PREMIUM BARU*

👤 Nama      : ${msg.from.first_name || "-"}
🧷 Username  : ${msg.from.username ? "@" + msg.from.username : "-"}
🆔 User ID   : ${userId}
💬 Chat ID   : ${chatId}
🔗 tg        : [Klik Profil](tg://user?id=${userId})

⏱ Durasi    : ${jamGratis} jam
🕒 Waktu    : ${waktuIndonesia()}
`;

    for (const ownerId of OWNER_IDS) {
        bot.sendMessage(ownerId, userInfo, { parse_mode: "Markdown" });
    }
}

        const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
𝗝𝗮𝘀𝗲𝗯 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔軟で安全な自動化ツール。デジタルタスクを
┌────────>
│ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 ☇ 𝐁𝐨𝐭 ° 𝐉𝐚𝐬𝐞𝐛
├⬡ Author : ${DEVELOPER} 〽️
├⬡ Versi : ${VERSION} 
├⬡ Grup Count : ${data.groups.length}
├⬡ Users Count : ${data.users.length} 
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a> 
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>Created By <a href="https://t.me/ku_kaii">kaii</a></blockquote>
<blockquote>🔥 Mau buy akses, SC, panel, atau jasa lainnya?
📩 PV: @ku_kaii
⚡ Limit & info cepat: @kaii_limit_bot </blockquote>
`;

        await replaceMenu(chatId, caption, {
            keyboard: [
    [{ text: "✨ Jasher Menu" }, { text: "⚡ Plans Free" }],
    [{ text: "💎 Plans Owner" }, { text: "💬 Contact Owner" }],
    [{ text: "🧩 Tools Menu" }, { text: "❤️ Donasi" }],
    [{ text: "➕ Tambahkan Grup" }]
],
resize_keyboard: true,
one_time_keyboard: false
        });
    })
);


bot.on("message", async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const text = msg.text;
    const data = loadData();
    const waktuRunPanel = formatUptime(os.uptime());
    const username = msg.from.username
        ? `@${msg.from.username}`
        : "Tidak ada username";
    

    if (
    [
        "🔙 Kembali",
        "✨ Jasher Menu",
        "💎 Plans Owner",
        "⚡ Plans Free",
        "🧩 Tools Menu",
        "💬 Contact Owner",
        "❤️ Donasi",
        "➕ Tambahkan Grup"
    ].includes(text)
    ) {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }

    // ==================== MAIN MENU ====================
    if (text === "🔙 Kembali") {
        const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
𝗝𝗮𝘀𝗲𝗯 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔軟で安全な自動化ツール。デジタルタスクを
┌────────>
│ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 ☇ 𝐁𝐨𝐭 ° 𝐉𝐚𝐬𝐞𝐛
├⬡ Author : ${DEVELOPER} 〽️
├⬡ Versi : ${VERSION} 
├⬡ Grup Count : ${data.groups.length}
├⬡ Users Count : ${data.users.length} 
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a> 
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>Created By <a href="https://t.me/ku_kaii">kaii</a></blockquote>
<blockquote>🔥 Mau buy akses, SC, panel, atau jasa lainnya?
📩 PV: @ku_kaii
⚡ Limit & info cepat: @kaii_limit_bot </blockquote>
`;
        return replaceMenu(chatId, caption, {
            keyboard: [
    [{ text: "✨ Jasher Menu" }, { text: "⚡ Plans Free" }],
    [{ text: "💎 Plans Owner" }, { text: "💬 Contact Owner" }],
    [{ text: "🧩 Tools Menu" }, { text: "❤️ Donasi" }],
    [{ text: "➕ Tambahkan Grup" }]
],
resize_keyboard: true,
one_time_keyboard: false
        });
    }

    // ==================== OWNER ====================
    if (text === "💬 Contact Owner") {
        return bot.sendMessage(chatId, `💬 Contact Owner: ${DEVELOPER}`);
    }
     if (text === "➕ Tambahkan Grup") {
    return bot.sendMessage(
        chatId,
        "➕ *Tambahkan bot ke grup kamu*",
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🚀 Tambahkan ke Grup",
                            url: `https://t.me/${BOT_USERNAME}?startgroup=true`
                        }
                    ]
                ]
            }
        }
    );
}
    // ==================== 💎 Plans Owner ====================
    if (text === "💎 Plans Owner") {
        if (!isAnyOwner(userId)) {
            return bot.sendMessage(chatId, "⛔ Only Owner Can Use This Menu");
        }
        const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
𝗝𝗮𝘀𝗲𝗯 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔軟で安全な自動化ツール。デジタルタスクを
┌────────>
│ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 ☇ 𝐁𝐨𝐭 ° 𝐉𝐚𝐬𝐞𝐛
├⬡ Author : ${DEVELOPER} 〽️
├⬡ Versi : ${VERSION} 
├⬡ Grup Count : ${data.groups.length}
├⬡ Users Count : ${data.users.length} 
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a> 
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>💎 Plans Owner</blockquote>
• /addownjs
• /delownjs
• /listownjs 
• /addakses 
• /delakses
• /listakses
• /listgrup
• /listusr
<blockquote>Created By <a href="https://t.me/ku_kaii">kaii</a></blockquote>
`;
        return replaceMenu(chatId, caption, {
            keyboard: [[{ text: "🔙 Kembali" }]],
            resize_keyboard: true,
            one_time_keyboard: false
        });
    }

    // ==================== 🧩 Tools Menu ====================
    if (text === "🧩 Tools Menu") {
        const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
𝗝𝗮𝘀𝗲𝗯 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔軟で安全な自動化ツール。デジタルタスクを
┌────────>
│ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 ☇ 𝐁𝐨𝐭 ° 𝐉𝐚𝐬𝐞𝐛
├⬡ Author : ${DEVELOPER} 〽️
├⬡ Versi : ${VERSION} 
├⬡ Grup Count : ${data.groups.length}
├⬡ Users Count : ${data.users.length} 
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a> 
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>🧩 Tools Menu</blockquote>
• /addbl
• /delbl
• /listbl
• /ping
• /cekid
• /backup
• /topuser
<blockquote>Created By <a href="https://t.me/ku_kaii">kaii</a></blockquote>
`;
        return replaceMenu(chatId, caption, {
            keyboard: [[{ text: "🔙 Kembali" }]],
            resize_keyboard: true,
            one_time_keyboard: false
        });
    }

    // ==================== ✨ Jasher Menu ====================
    if (text === "✨ Jasher Menu") {
        const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
𝗝𝗮𝘀𝗲𝗯 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔軟で安全な自動化ツール。デジタルタスクを
┌────────>
│ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 ☇ 𝐁𝐨𝐭 ° 𝐉𝐚𝐬𝐞𝐛
├⬡ Author : ${DEVELOPER} 〽️
├⬡ Versi : ${VERSION} 
├⬡ Grup Count : ${data.groups.length}
├⬡ Users Count : ${data.users.length} 
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a> 
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>✨ Jasher Menu</blockquote>
• /sharemsg 
• /broadcast
• /setpesan 
• /setjeda
• /auto on/off
• /auto status
<blockquote>Created By <a href="https://t.me/ku_kaii">kaii</a></blockquote>
`;
        return replaceMenu(chatId, caption, {
            keyboard: [[{ text: "🔙 Kembali" }]],
            resize_keyboard: true,
            one_time_keyboard: false
        });
    }

    // ==================== ⚡ Plans Free ====================
    if (text === "⚡ Plans Free") {
        const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
𝗝𝗮𝘀𝗲𝗯 ─ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 ボットは、速く柔軟で安全な自動化ツール。デジタルタスクを
┌────────>
│ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 ☇ 𝐁𝐨𝐭 ° 𝐉𝐚𝐬𝐞𝐛
├⬡ Author : ${DEVELOPER} 〽️
├⬡ Versi : ${VERSION} 
├⬡ Grup Count : ${data.groups.length}
├⬡ Users Count : ${data.users.length} 
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a> 
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>⚡ PLANS FREE</blockquote>
┌─ ⧼ 𝗖𝗔𝗥𝗔 𝗗𝗔𝗣𝗔𝗧𝗜𝗡 𝗣𝗥𝗘𝗠 ⧽
├ 𝙼𝙰𝚂𝚄𝙺𝙸𝙽 𝙱𝙾𝚃 𝙺𝙴 𝙶𝚁𝚄𝙱 𝙼𝙸𝙽𝙸𝙼𝙰𝙻 1 𝙶𝚁𝚄𝙿 
├ 𝙹𝙸𝙺𝙰 𝚂𝚄𝙳𝙰𝙷 𝙺𝙰𝙻𝙸𝙰𝙽 𝙱𝙰𝙺𝙰𝙻 𝙳𝙰𝙿𝙴𝚃 𝙰𝙺𝚂𝙴𝚂 𝙿𝚁𝙴𝙼 𝟽 𝙷𝙰𝚁𝙸
├ 𝙳𝙰𝙽 𝙻𝚄 𝚃𝙸𝙽𝙶𝙶𝙰𝙻 𝙺𝙴𝚃𝙸𝙺 𝚈𝙰𝙽𝙶 𝙼𝙰𝚄 𝙳𝙸 𝚂𝙷𝙴𝚁𝙴
├ 𝙳𝙰𝙽 𝙻𝚄 𝚃𝙸𝙽𝙶𝙶𝙰𝙻 𝚁𝙴𝙿𝙻𝚈 𝚃𝙴𝙺𝚂 𝙽𝚈𝙰 𝙺𝙴𝚃𝙸𝙺 /𝚂𝙷𝙰𝚁𝙴𝙼𝚂𝙶
╰────────────────────
┌─ ⧼ 𝗣𝗘𝗥𝗔𝗧𝗨𝗥𝗔𝗡‼️ ⧽
├ 𝙹𝙸𝙺𝙰 𝙱𝙾𝚃 𝚂𝚄𝙳𝙰𝙷 𝙱𝙴𝚁𝙶𝙰𝙱𝚄𝙽𝙶
├ 𝙳𝙰𝙽 𝙰𝙽𝙳𝙰 𝙼𝙴𝙽𝙶𝙴𝙻𝚄𝙰𝚁𝙺𝙰𝙽 𝙽𝚈𝙰
├ 𝙱𝙾𝚃 𝙰𝙺𝙰𝙽 𝙾𝚃𝙾𝙼𝙰𝚃𝙸𝚂 𝙼𝙴𝙽𝙶𝙷𝙰𝙿𝚄𝚂 𝙰𝙺𝚂𝙴𝚂 𝙿𝚁𝙴𝙼
├ 𝙹𝙰𝙽𝙶𝙰𝙽 𝙳𝙸 𝚂𝙿𝙰𝙼 𝙱𝙾𝚃 𝙽𝚈𝙰 𝙺𝙾𝙽𝚃𝙾𝙻
├ 𝙷𝙰𝚁𝙰𝙿 𝙳𝙸 𝙿𝙰𝚃𝚄𝙷𝙸 ‼️
╰────────────────────
<blockquote>CREATED BY @ku_kaii</blockquote>
`;
        return replaceMenu(chatId, caption, {
            keyboard: [[{ text: "🔙 Kembali" }]],
            resize_keyboard: true,
            one_time_keyboard: false
        });
    }

    if (text === "❤️ Donasi") {
    const caption = `
<blockquote><b>💖 D U K U N G  P R O J E C T  I N I</b></blockquote>
✨ <b>Hai teman!</b>  
Jika kamu ingin membantu pengembangan bot ini agar tetap online dan terus update,  
kamu bisa melakukan donasi melalui QR Code di bawah ini.
<blockquote>💎 <b>Setiap donasi sangat berarti!</b>  
Terima kasih banyak untuk dukunganmu 🙏🔥</blockquote>
<b>☕ Created by:</b> <a href="https://t.me/ku_kaii">@ku_kaii</a>
    `;

    return bot.sendPhoto(
        chatId,
        "https://files.catbox.moe/3ym7e8.png",
        { caption: caption, parse_mode: "HTML" }
    );
}
});
// /stop hanya untuk owner
bot.onText(/\/stop/, async msg => {
    const userId = msg.from.id.toString();

    // Cek owner
    if (!OWNER_IDS.includes(userId)) {
        return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
    }

    const chatId = msg.chat.id;
    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    // Kirim pesan awal & simpan id pesan
    const sentMsg = await bot.sendMessage(chatId, "⚠️ Proses penghentian sistem dimulai...\nTunggu 10 detik.");

    const steps = [
        "🔄 Menyimpan data...",
        "🗄️ Menutup koneksi database...",
        "📡 Memutus WebSocket...",
        "📤 Mengirim log terakhir...",
        "🔐 Menonaktifkan modul keamanan...",
        "⚙️ Mematikan modul otomatis...",
        "📦 Menghentikan service internal...",
        "🧹 Membersihkan cache...",
        "🧩 Melepas event listener...",
        "🛑 Sistem siap dimatikan..."
    ];

    // Loop dengan edit pesan, 1 detik tiap step
    for (let i = 0; i < steps.length; i++) {
        await new Promise(res => setTimeout(res, 1000));
        await bot.editMessageText(steps[i], {
            chat_id: chatId,
            message_id: sentMsg.message_id
        });
    }

    // Final sebelum mati
    await bot.editMessageText(
        `🛑 Bot dimatikan manual oleh owner pada ${waktu}\n\nMematikan dalam 1 detik...`,
        { chat_id: chatId, message_id: sentMsg.message_id }
    );

    console.log(`🛑 Bot dihentikan oleh owner pada ${waktu}`);

    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

bot.onText(/^\/sharemsg$/, async (msg) => {
    if (!(await requireNotBlacklisted(msg))) return;

    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const data = loadData();

    try {
        const isMain = isMainOwner(senderId);
        const isOwnerNow = isAnyOwner(senderId);

        const isPremiumUser =
            data.premium?.[senderId] &&
            (data.premium[senderId] === "permanent" ||
                Math.floor(Date.now() / 1000) < data.premium[senderId]);

        const groupCount = data.user_group_count?.[senderId] || 0;

        if (!isOwnerNow && !isPremiumUser && groupCount < 1) {
            return bot.sendMessage(chatId, "⛔ Can Only Be Used Premium User");
        }

        // ===== Cooldown =====
        if (!data.cooldowns) data.cooldowns = {};
        if (!data.cooldowns.share) data.cooldowns.share = {};

        const now = Math.floor(Date.now() / 1000);
        const cooldown = getGlobalCooldownMinutes() * 60;
        const lastUse = data.cooldowns.share[senderId] || 0;

        if (!isMain && now - lastUse < cooldown) {
            const sisa = cooldown - (now - lastUse);
            return bot.sendMessage(
                chatId,
                `🕒 Tunggu ${Math.floor(sisa / 60)} menit ${sisa % 60} detik lagi.`
            );
        }

        if (!msg.reply_to_message) {
            return bot.sendMessage(
                chatId,
                "⚠️ Harap *reply* ke pesan yang ingin dibagikan.",
                { parse_mode: "Markdown" }
            );
        }

        if (!isMain) {
            data.cooldowns.share[senderId] = now;
            saveData(data);
        }

        const groups = data.groups || [];
        if (!groups.length) {
            return bot.sendMessage(chatId, "⚠️ Tidak ada grup terdaftar.");
        }

        const total = groups.length;
        let sukses = 0;
        let gagal = 0;

        // ===== Progress Message =====
        const progressMsg = await bot.sendMessage(
            chatId,
            "⏳ Mulai share...\n[▒▒▒▒▒▒▒▒▒▒] 0%"
        );

        function updateProgress(current) {
            const percent = Math.floor((current / total) * 100);
            const filled = Math.floor(percent / 10);

            const bar =
                "[" +
                "█".repeat(filled) +
                "▒".repeat(10 - filled) +
                `] ${percent}%`;

            bot.editMessageText(
                `📡 share berjalan...\n${bar}\n\n` +
                `🟢 Sukses: ${sukses}\n` +
                `🔴 Gagal: ${gagal}`,
                {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }
            ).catch(() => {});
        }

        const reply = msg.reply_to_message;

        for (let i = 0; i < total; i++) {
            try {
                await bot.forwardMessage(groups[i], chatId, reply.message_id);
                sukses++;
            } catch {
                gagal++;
            }

            updateProgress(i + 1);
            await new Promise(r => setTimeout(r, 300));
        }

        await bot.sendMessage(
            chatId,
            `🎉 *Share Selesai!*\n\n` +
            `📊 *Hasil Akhir*\n` +
            `• Total: ${total}\n` +
            `• 🟢 Sukses: ${sukses}\n` +
            `• 🔴 Gagal: ${gagal}`,
            { parse_mode: "Markdown" }
        );

    } catch (err) {
        console.error("❌ Error /sharemsg:", err);
        bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat share.");
    }
});

bot.onText(/^\/broadcast$/, async (msg) => {
    if (!(await requireNotBlacklisted(msg))) return;

    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const data = loadData();

    try {
        const isMain = isMainOwner(senderId);
        const isOwnerNow = isAnyOwner(senderId);

        if (!isOwnerNow) {
            return bot.sendMessage(chatId, "⛔ Can Only Be Used Owner User");
        }

        // ===== Cooldown =====
        if (!data.cooldowns) data.cooldowns = {};
        if (!data.cooldowns.broadcast) data.cooldowns.broadcast = {};

        const now = Math.floor(Date.now() / 1000);
        const cooldown = getGlobalCooldownMinutes() * 60;
        const lastUse = data.cooldowns.broadcast[senderId] || 0;

        if (!isMain && now - lastUse < cooldown) {
            const wait = cooldown - (now - lastUse);
            return bot.sendMessage(
                chatId,
                `🕒 Tunggu ${Math.floor(wait / 60)} menit ${wait % 60} detik lagi.`
            );
        }

        if (!msg.reply_to_message) {
            return bot.sendMessage(
                chatId,
                "⚠️ Harap *reply* ke pesan yang ingin dibroadcast.",
                { parse_mode: "Markdown" }
            );
        }

        if (!isMain) {
            data.cooldowns.broadcast[senderId] = now;
            saveData(data);
        }

        const users = [...new Set(data.users || [])];
        if (!users.length) {
            return bot.sendMessage(chatId, "⚠️ Belum ada user terdaftar.");
        }

        const total = users.length;
        let sukses = 0;
        let gagal = 0;

        const reply = msg.reply_to_message;

        // ===== Progress Message =====
        const progressMsg = await bot.sendMessage(
            chatId,
            "⏳ Mulai broadcast...\n[▒▒▒▒▒▒▒▒▒▒] 0%"
        );

        function updateProgress(current) {
            const percent = Math.floor((current / total) * 100);
            const filled = Math.floor(percent / 10);

            const bar =
                "[" +
                "█".repeat(filled) +
                "▒".repeat(10 - filled) +
                `] ${percent}%`;

            bot.editMessageText(
                `📡 Broadcast berjalan...\n${bar}\n\n` +
                `🟢 Sukses: ${sukses}\n` +
                `🔴 Gagal: ${gagal}`,
                {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }
            ).catch(() => {});
        }

        for (let i = 0; i < total; i++) {
            try {
                await bot.forwardMessage(users[i], chatId, reply.message_id);
                sukses++;
            } catch {
                gagal++;
            }

            updateProgress(i + 1);
            await new Promise(r => setTimeout(r, 300));
        }

        // ===== Final Result =====
        await bot.sendMessage(
            chatId,
            `🎉 *Broadcast Selesai!*\n\n` +
            `📊 *Hasil Akhir*\n` +
            `• Total User: ${total}\n` +
            `• 🟢 Sukses: ${sukses}\n` +
            `• 🔴 Gagal: ${gagal}`,
            { parse_mode: "Markdown" }
        );

    } catch (err) {
        console.error("❌ Error /broadcast:", err);
        bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat broadcast.");
    }
});

bot.onText(/^\/all$/, async (msg) => {
    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const data = loadData();

    try {
        // 🔑 Hanya Owner Utama
        if (!isMainOwner(senderId)) {
            return bot.sendMessage(
                chatId,
                "⛔ Hanya Owner utama yang bisa pakai /all"
            );
        }

        // 📨 Harus reply
        const reply = msg.reply_to_message;
        if (!reply) {
            return bot.sendMessage(
                chatId,
                "⚠️ Harap *reply* ke pesan yang ingin dibagikan ke semua user & grup.",
                { parse_mode: "Markdown" }
            );
        }

        // 🎯 Target
        const groups = Array.isArray(data.groups) ? data.groups : [];
        const users = Array.isArray(data.users)
            ? [...new Set(data.users)]
            : [];

        const targets = [...groups, ...users];
        const total = targets.length;

        if (!total) {
            return bot.sendMessage(
                chatId,
                "⚠️ Tidak ada user atau grup terdaftar."
            );
        }

        let sukses = 0;
        let gagal = 0;

        // ===== Progress Message =====
        const progressMsg = await bot.sendMessage(
            chatId,
            "⏳ Mulai pengiriman...\n[▒▒▒▒▒▒▒▒▒▒] 0%"
        );

        function updateProgress(current) {
            const percent = Math.floor((current / total) * 100);
            const filled = Math.floor(percent / 10);

            const bar =
                "[" +
                "█".repeat(filled) +
                "▒".repeat(10 - filled) +
                `] ${percent}%`;

            bot.editMessageText(
                `📡 Mengirim pesan ke semua target...\n${bar}\n\n` +
                `🟢 Sukses: ${sukses}\n` +
                `🔴 Gagal: ${gagal}`,
                {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }
            ).catch(() => {});
        }

        // 🚀 Kirim satu per satu
        for (let i = 0; i < total; i++) {
            try {
                await bot.forwardMessage(
                    targets[i],
                    chatId,
                    reply.message_id
                );
                sukses++;
            } catch {
                gagal++;
            }

            updateProgress(i + 1);
            await new Promise(r => setTimeout(r, 100));
        }

        // 🎉 Final
        await bot.sendMessage(
            chatId,
            `🎉 *Pengiriman Selesai!*\n\n` +
            `📊 *Hasil Akhir*\n` +
            `• Total Target: *${total}*\n` +
            `• 🟢 Sukses: *${sukses}*\n` +
            `• 🔴 Gagal: *${gagal}*`,
            { parse_mode: "Markdown" }
        );

    } catch (err) {
        console.error("❌ Error /all:", err);
        bot.sendMessage(
            chatId,
            "⚠️ Terjadi kesalahan saat memproses /all."
        );
    }
});

// === /scan ===
// Fitur: Mengirim pesan tes ke semua user & grup, dan menghapus ID yang gagal menerima pesan.
bot.onText(/^\/scan$/, async (msg) => {
    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const data = loadData();

    try {
        // 🔒 Hanya owner utama
        if (!isMainOwner(senderId)) {
            return bot.sendMessage(
                chatId,
                "⛔ Hanya Owner utama yang bisa menjalankan /scan."
            );
        }

        const groups = data.groups || [];
        const users = [...new Set(data.users || [])];
        const total = groups.length + users.length;

        if (total === 0) {
            return bot.sendMessage(chatId, "⚠️ Tidak ada user atau grup terdaftar.");
        }

        let sukses = 0;
        let gagal = 0;
        let index = 0;

        const pesanTes = "✅ Cek Dulu Bang!";

        // ===== Progress Message =====
        const progressMsg = await bot.sendMessage(
            chatId,
            "⏳ Mulai pemindaian...\n[▒▒▒▒▒▒▒▒▒▒] 0%"
        );

        function updateProgress(current) {
            const percent = Math.floor((current / total) * 100);
            const filled = Math.floor(percent / 10);

            const bar =
                "[" +
                "█".repeat(filled) +
                "▒".repeat(10 - filled) +
                `] ${percent}%`;

            bot.editMessageText(
                `📡 Memindai target...\n${bar}\n\n` +
                `✔️ Dicek: ${current}/${total}\n` +
                `✅ Aktif: ${sukses}\n` +
                `❌ Dihapus: ${gagal}`,
                {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }
            ).catch(() => {});
        }

        // ===== SCAN GROUP =====
        for (const groupId of [...groups]) {
            try {
                await bot.sendMessage(groupId, pesanTes);
                sukses++;
            } catch {
                gagal++;
                data.groups = data.groups.filter(id => id !== groupId);
                console.log(`❌ Grup ${groupId} dihapus (tidak aktif)`);
            }

            index++;
            updateProgress(index);
            await new Promise(r => setTimeout(r, 300));
        }

        // ===== SCAN USER =====
        for (const userId of [...users]) {
            try {
                await bot.sendMessage(userId, pesanTes);
                sukses++;
            } catch {
                gagal++;
                data.users = data.users.filter(id => id !== userId);
                console.log(`❌ User ${userId} dihapus (tidak aktif)`);
            }

            index++;
            updateProgress(index);
            await new Promise(r => setTimeout(r, 300));
        }

        saveData(data);

        // ===== FINAL RESULT =====
        await bot.sendMessage(
            chatId,
            `✅ *Pemindaian Selesai!*\n\n` +
            `📊 *Hasil Akhir*\n` +
            `• Total Target: ${total}\n` +
            `• ✅ Aktif: ${sukses}\n` +
            `• ❌ Dihapus: ${gagal}`,
            { parse_mode: "Markdown" }
        );

    } catch (err) {
        console.error("❌ Error /scan:", err);
        bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat memproses /scan.");
    }
});

const path = require("path");
const dataFile = path.join(__dirname, "data.json");

// Fungsi baca data.json
function loadData() {
    if (!fs.existsSync(dataFile)) return {};
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

// Fungsi simpan ke data.json
function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// Fungsi cek owner
function isOwner(userId) {
    const data = loadData();
    return data.owner && data.owner.includes(userId.toString());
}

// === /setpesan ===
bot.onText(/\/setpesan/, async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Cek hanya owner
if (!OWNER_IDS.includes(String(userId))) {
    return bot.sendMessage(chatId, "❌ Hanya owner utama.");
}

    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, "⚠️ Balas pesan yang mau dijadikan Auto Share.");
    }

    const data = loadData();

    if (!data.autoShare) {
        data.autoShare = { pesan: null, jeda: 10, status: false, lastShare: null };
    }

    data.autoShare.pesan = msg.reply_to_message;
    saveData(data);

    bot.sendMessage(chatId, "✅ Pesan Auto Share berhasil disimpan di data.json!");
});

// === /setjeda ===
bot.onText(/\/setjeda (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const jeda = parseInt(match[1]);

    if (!OWNER_IDS.includes(String(userId))) {
    return bot.sendMessage(chatId, "❌ Hanya owner utama.");
}
    if (isNaN(jeda) || jeda < 1) return bot.sendMessage(chatId, "⚠️ Format salah. Contoh: /setjeda 5");

    const data = loadData();
    if (!data.autoShare) data.autoShare = { pesan: null, jeda: 10, status: false, lastShare: null };

    data.autoShare.jeda = jeda;
    saveData(data);

    bot.sendMessage(chatId, `⏱️ Jeda auto share diatur ke ${jeda} menit (tersimpan di data.json).`);
});

// === /auto ===
let autoShareInterval = null;

bot.onText(/\/auto(?:\s*(on|off))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const mode = match[1] ? match[1].toLowerCase() : null;

    if (!OWNER_IDS.includes(String(userId))) {
    return bot.sendMessage(chatId, "❌ Hanya owner utama.");
}

    const data = loadData();

    // Pastikan struktur autoShare selalu ada
    if (!data.autoShare) {
        data.autoShare = {
            pesan: null,
            jeda: 10,
            status: false,
            lastShare: null
        };
        saveData(data);
    }

    // === Jika tanpa argumen: tampilkan status ===
    if (!mode) {
        const status = data.autoShare.status ? "✅ ON" : "🛑 OFF";
        const pesanInfo = data.autoShare.pesan
            ? "📨 Pesan sudah diset ✅"
            : "⚠️ Belum ada pesan diset (gunakan /setpesan)";

        let nextShare = "❌ Belum pernah share";
        if (data.autoShare.lastShare && data.autoShare.status) {
            const last = new Date(data.autoShare.lastShare);
            const next = new Date(last.getTime() + data.autoShare.jeda * 60 * 1000);
            nextShare = `🕒 ${next.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`;
        }

        return bot.sendMessage(
            chatId,
            `📊 STATUS AUTO SHARE\n━━━━━━━━━━━━━━\n📡 Status: ${status}\n⏱️ Jeda: ${data.autoShare.jeda} menit\n${pesanInfo}\n📅 Share berikutnya: ${nextShare}`
        );
    }

    // === Fungsi kirim auto share ===
    async function kirimAutoShare() {
    const updated = loadData();
    if (!updated.autoShare.status || !updated.autoShare.pesan) return;

    const groupIds = updated.groups || [];
    const userIds = updated.users || [];

    const totalTujuan = groupIds.length + userIds.length;

    if (totalTujuan === 0)
        return bot.sendMessage(chatId, "⚠️ Tidak ada grup/user yang terdaftar di data.json.");

    // Pesan pembuka progress
    const progressMsg = await bot.sendMessage(
        chatId,
        `🚀 Memulai Auto Share...\n📡 Grup: ${groupIds.length}\n👤 User: ${userIds.length}\n🕒 Jeda: 0.1 detik\n\n⏳ Progress: 0% [──────────]`
    ).catch(() => {});

    let sukses = 0;
    let gagal = 0;

    let index = 0;
    let lastProgress = -1;

    // ==== Fungsi untuk Update Progress ====
    const updateProgress = async () => {
        const persen = Math.floor((index / totalTujuan) * 100);
        const step = Math.floor(persen / 10);

        if (step !== lastProgress) {
            lastProgress = step;

            const filled = "█".repeat(step);
            const empty = "─".repeat(10 - step);
            const bar = `${filled}${empty}`;

            await bot.editMessageText(
                `🚀 Memulai Auto Share...\n📡 Grup: ${groupIds.length}\n👤 User: ${userIds.length}\n🕒 Jeda: 0.1 detik\n\n⏳ Progress: ${persen}% [${bar}]`,
                {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }
            ).catch(() => {});
        }
    };

    // ==== Kirim ke Grup ====
    for (const id of groupIds) {
        try {
            await bot.forwardMessage(
                id,
                updated.autoShare.pesan.chat.id,
                updated.autoShare.pesan.message_id
            );
            sukses++;
        } catch (err) {
            gagal++;
            console.error(`[AutoShare] ❌ Gagal ke grup ${id}:`, err.message);
        }

        index++;
        await updateProgress();
        await new Promise(res => setTimeout(res, 100));
    }

    // ==== Kirim ke User ====
    for (const id of userIds) {
        try {
            await bot.forwardMessage(
                id,
                updated.autoShare.pesan.chat.id,
                updated.autoShare.pesan.message_id
            );
            sukses++;
        } catch (err) {
            gagal++;
            console.error(`[AutoShare] ❌ Gagal ke user ${id}:`, err.message);
        }

        index++;
        await updateProgress();
        await new Promise(res => setTimeout(res, 100));
    }

    // Simpan waktu terakhir Auto Share
    updated.autoShare.lastShare = new Date().toISOString();
    saveData(updated);

    // ==== Pesan Hasil Akhir ====
    const hasil = `
✅ Auto Share selesai!
━━━━━━━━━━━━━━
📡 Grup: ${groupIds.length}
👤 User: ${userIds.length}
📬 Total tujuan: ${totalTujuan}
✅ Berhasil: ${sukses}
❌ Gagal: ${gagal}
🕒 ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
⏱️ Delay: 0.1 detik per kirim
    `.trim();

    await bot.sendMessage(chatId, hasil);
}

    // === MODE ON ===
    if (mode === "on") {
        data.autoShare.status = true;
        if (!data.autoShare.jeda) data.autoShare.jeda = 10;
        saveData(data);

        bot.sendMessage(chatId, `🚀 Auto Share diaktifkan!\n📬 Pesan akan dikirim setiap ${data.autoShare.jeda} menit.\n📢 Mengirim pertama kali sekarang...`);

        await kirimAutoShare();

        if (autoShareInterval) clearInterval(autoShareInterval);

        autoShareInterval = setInterval(async () => {
            const latest = loadData();
            if (latest.autoShare.status) await kirimAutoShare();
        }, data.autoShare.jeda * 60 * 1000);

    // === MODE OFF ===
    } else if (mode === "off") {
        data.autoShare.status = false;
        saveData(data);
        if (autoShareInterval) clearInterval(autoShareInterval);
        bot.sendMessage(chatId, "🛑 Auto Share dimatikan.");
    }
});

// === /pesan ===
bot.onText(/\/pesan/, async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!OWNER_IDS.includes(String(userId))) {
    return bot.sendMessage(chatId, "❌ Hanya owner utama.");
}

    const data = loadData();

    if (!data.autoShare || !data.autoShare.pesan) {
        return bot.sendMessage(chatId, "⚠️ Belum ada pesan yang disimpan. Gunakan /setpesan untuk menyimpannya dulu.");
    }

    try {
        await bot.forwardMessage(
            chatId,
            data.autoShare.pesan.chat.id,
            data.autoShare.pesan.message_id
        );
    } catch (err) {
        console.error("[/pesan] Gagal kirim pesan AutoShare:", err.message);
        bot.sendMessage(
            chatId,
            "❌ Gagal mengirim pesan Auto Share.\nKemungkinan pesan asli sudah dihapus atau bot tidak punya akses lagi."
        );
    }
});

// === /addownjs <id> ===
bot.onText(/^\/addownjs(?:\s+(\d+))?$/, (msg, match) => {
    const senderId = msg.from.id;
    const chatId = msg.chat.id;

    if (!isMainOwner(senderId)) {
        return bot.sendMessage(senderId, "⛔ Can Only Be Used Owner");
    }

    if (!match[1]) {
        return bot.sendMessage(
            senderId,
            "⚠️ Contoh penggunaan yang benar:\n\n`/addownjs 123456789`",
            { parse_mode: "Markdown" }
        );
    }

    const targetId = match[1];
    const data = loadData();

    if (!Array.isArray(data.owner)) data.owner = [];

    if (!data.owner.includes(targetId)) {
        data.owner.push(targetId);
        saveData(data);
        bot.sendMessage(
            senderId,
            `✅ User ${targetId} berhasil ditambahkan sebagai owner tambahan.`
        );
    } else {
        bot.sendMessage(
            senderId,
            `⚠️ User ${targetId} sudah menjadi owner tambahan.`
        );
    }
});

// === /delownjs <id> ===
bot.onText(/^\/delownjs(?:\s+(\d+))?$/, (msg, match) => {
    const senderId = msg.from.id;
    const chatId = msg.chat.id;

    if (!isMainOwner(senderId)) {
        return bot.sendMessage(senderId, "⛔ Can Only Be Used Owner");
    }

    if (!match[1]) {
        return bot.sendMessage(
            senderId,
            "⚠️ Contoh penggunaan yang benar:\n\n`/delownjs 123456789`",
            { parse_mode: "Markdown" }
        );
    }

    const targetId = match[1];
    const data = loadData();

    if (OWNER_IDS.map(String).includes(String(targetId))) {
        return bot.sendMessage(
            senderId,
            `❌ Tidak bisa menghapus Owner Utama (${targetId}).`
        );
    }

    if (Array.isArray(data.owner) && data.owner.includes(targetId)) {
        data.owner = data.owner.filter(id => id !== targetId);
        saveData(data);
        bot.sendMessage(
            senderId,
            `✅ User ${targetId} berhasil dihapus dari owner tambahan.`
        );
    } else {
        bot.sendMessage(senderId, `⚠️ User ${targetId} bukan owner tambahan.`);
    }
});

// === /listownjs ===
bot.onText(/^\/listownjs$/, msg => {
    const senderId = msg.from.id;
    const chatId = msg.chat.id;

    if (!isMainOwner(senderId)) {
        return bot.sendMessage(
            chatId,
            "⛔ Hanya Owner Utama yang bisa melihat daftar owner tambahan."
        );
    }

    const data = loadData();
    const ownersTambahan = Array.isArray(data.owner) ? data.owner : [];

    if (ownersTambahan.length === 0) {
        return bot.sendMessage(
            chatId,
            "📋 Tidak ada owner tambahan yang terdaftar."
        );
    }

    const teks = `📋 Daftar Owner Tambahan:\n\n${ownersTambahan
        .map((id, i) => `${i + 1}. ${id}`)
        .join("\n")}`;
    bot.sendMessage(chatId, teks);
});

// /addakses <id> <durasi>
bot.onText(/^\/addakses(?:\s+(\d+)\s+(\d+)([dh]))?$/, (msg, match) => {
    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;
    if (!isOwner(senderId)) {
        return bot.sendMessage(chatId, "⛔ Can Only Be Used Owner");
    }

    const userId = match[1];
    const jumlah = match[2];
    const satuan = match[3];

    if (!userId || !jumlah || !satuan) {
        return bot.sendMessage(
            chatId,
            "📌 Contoh penggunaan:\n/addakses 123456789 3d\n\n(d = hari, h = jam)"
        );
    }

    const durasi = parseInt(jumlah);
    let detik;
    if (satuan === "d") detik = durasi * 86400;
    else if (satuan === "h") detik = durasi * 3600;
    else
        return bot.sendMessage(
            chatId,
            '❌ Format waktu salah. Gunakan "d" (hari) atau "h" (jam).'
        );

    const now = Math.floor(Date.now() / 1000);
    const data = loadData();
    if (!data.premium) data.premium = {};

    const current = data.premium[userId] || now;
    data.premium[userId] = current > now ? current + detik : now + detik;

    saveData(data);
    const waktuText = satuan === "d" ? "hari" : "jam";
    bot.sendMessage(
        chatId,
        `✅ User ${userId} berhasil ditambahkan Premium selama ${durasi} ${waktuText}.`
    );
});
bot.onText(/^\/up(?:@\S+)?\s+(\d+)$/, (msg, match) => {
    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;

    if (!isOwner(senderId)) {
        return bot.sendMessage(chatId, "⛔ Can Only Be Used Owner");
    }

    const userId = match[1];

    const data = loadData();
    if (!data.premium) data.premium = {};

    data.premium[userId] = "permanent";
    saveData(data);

    bot.sendMessage(
        chatId,
        `✨ User ${userId} berhasil diberikan akses **PREMIUM PERMANENT**!`,
        { parse_mode: "Markdown" }
    );
});
// /delakses <id>
bot.onText(/^\/delakses(?:\s+(\d+))?$/, (msg, match) => {
    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;

    if (!isOwner(senderId)) {
        return bot.sendMessage(chatId, "⛔ Can Only Be Used Owner");
    }

    const userId = match[1];
    if (!userId) {
        return bot.sendMessage(
            chatId,
            "📌 Contoh penggunaan:\n/delakses 123456789"
        );
    }

    const data = loadData();
    if (!data.premium || !data.premium[userId]) {
        return bot.sendMessage(
            chatId,
            `❌ User ${userId} tidak ditemukan atau belum premium.`
        );
    }

    delete data.premium[userId];
    saveData(data);
    bot.sendMessage(chatId, `✅ Premium user ${userId} berhasil dihapus.`);
});

// /listakses (tanpa tombol navigasi, versi simple)
bot.onText(/\/listakses/, async msg => {
    const senderId = msg.from.id.toString();
    const chatId = msg.chat.id;

    if (!isOwner(senderId)) {
        return bot.sendMessage(chatId, "⛔ Can Only Be Used Owner");
    }

    const data = loadData();
    const now = Math.floor(Date.now() / 1000);

    const premiumUsers = Object.entries(data.premium || {});

    if (premiumUsers.length === 0) {
        return bot.sendMessage(
            chatId,
            "📋 Daftar Premium:\n\nBelum ada user Premium."
        );
    }

    let hasil = "📋 <b>Daftar Premium:</b>\n\n";

    for (const [uid, exp] of premiumUsers) {
        let username = "-";

        try {
            const userInfo = await bot.getChat(uid);
            username = userInfo.username || "-";
        } catch {
            username = "-";
        }

        // Format username biar rapi
        const uname = username !== "-" ? `@${username}` : "-";

        // Status premium
        if (exp === "permanent") {
            hasil += `👤 <code>${uid}</code> (${uname}) - ♾️ Permanent\n`;
        } else {
            const sisaJam = Math.floor((exp - now) / 3600);
            if (sisaJam > 0) {
                hasil += `👤 <code>${uid}</code> (${uname}) - ${sisaJam} jam tersisa\n`;
            }
        }
    }

    bot.sendMessage(chatId, hasil.trim(), { parse_mode: "HTML" });
});

bot.onText(/\/topuser/, async (msg) => {
    const chatId = msg.chat.id;

    const data = loadData();
    const userGroupCount = data.user_group_count || {};

    if (Object.keys(userGroupCount).length === 0) {
        return bot.sendMessage(chatId, "📭 Belum ada data pengundang.");
    }

    const jumlah = 10;
    const topUsers = Object.entries(userGroupCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, jumlah);

    const medal = ["🥇", "🥈", "🥉"];

    let text =
`👑 <b>TOP ${jumlah} PENGUNDANG</b>
────────────────────\n`;

    for (let i = 0; i < topUsers.length; i++) {
    const [userId, total] = topUsers[i];
    let displayName = `ID: ${userId}`;

    try {
        const user = await bot.getChat(Number(userId));

        if (user.username) {
            displayName = `@${user.username}`;
        } else {
            const name = [user.first_name, user.last_name]
                .filter(Boolean)
                .join(" ");
            if (name) displayName = name;
        }
    } catch {
        // tetap pakai ID kalau gagal getChat
        displayName = `ID: ${userId}`;
    }

    if (i < 3) {
        text += `${medal[i]} ${displayName} — ${total} grup\n`;
    } else {
        text += `#${i + 1} ${displayName} — ${total} grup\n`;
    }
}

    bot.sendMessage(chatId, text.trim(), {
        parse_mode: "HTML",
        disable_web_page_preview: true
    });
});

// /addbl <id>
bot.onText(/^\/addbl\s+(\d+)$/, (msg, match) => {
    const senderId = msg.from.id;
    if (!isAnyOwner(senderId)) return;
    const targetId = match[1];
    const data = loadData();
    if (!data.blacklist) data.blacklist = [];
    if (!data.blacklist.includes(targetId)) {
        data.blacklist.push(targetId);
        saveData(data);
        bot.sendMessage(
            msg.chat.id,
            `✅ User ${targetId} ditambahkan ke blacklist.`
        );
    } else {
        bot.sendMessage(
            msg.chat.id,
            `⚠️ User ${targetId} sudah ada di blacklist.`
        );
    }
});

// /delbl <id>
bot.onText(/^\/delbl\s+(\d+)$/, (msg, match) => {
    const senderId = msg.from.id;
    if (!isAnyOwner(senderId)) return;
    const targetId = match[1];
    const data = loadData();
    if (data.blacklist && data.blacklist.includes(targetId)) {
        data.blacklist = data.blacklist.filter(x => x !== targetId);
        saveData(data);
        bot.sendMessage(
            msg.chat.id,
            `✅ User ${targetId} dihapus dari blacklist.`
        );
    } else {
        bot.sendMessage(
            msg.chat.id,
            `⚠️ User ${targetId} tidak ada di blacklist.`
        );
    }
});

// /listbl
bot.onText(/^\/listbl$/, msg => {
    const senderId = msg.from.id;
    if (!isAnyOwner(senderId)) return;

    const data = loadData();
    const list = data.blacklist || [];

    if (list.length === 0) {
        return bot.sendMessage(msg.chat.id, "📋 Blacklist kosong.");
    }

    let hasil = "📋 <b>Daftar Blacklist:</b>\n\n";

    for (const uid of list) {
        hasil += `🚫 <code>${uid}</code>\n`;
    }

    bot.sendMessage(msg.chat.id, hasil.trim(), { parse_mode: "HTML" });
});

// === /cekid ===
bot.onText(/\/cekid/, async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const username = msg.from.username ? "@" + msg.from.username : "Tidak ada";
    const date = new Date().toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta"
    });

    // Fallback DC ID rumus jika DC asli tidak ada
    const dcIdFallback = (userId >> 27) & 7;

    // Default (akan diganti bila dapat DC ID asli)
    let dcId = dcIdFallback;

    try {
        // Ambil foto profil user
        const userProfilePhotos = await bot.getUserProfilePhotos(userId, {
            limit: 1
        });

        if (userProfilePhotos.total_count > 0) {
            const fileId = userProfilePhotos.photos[0][0].file_id;

            // Ambil data file (DC ID asli)
            const file = await bot.getFile(fileId);

            // Jika ada file_dc_id → pakai DC ID asli
            if (file.file_dc_id) {
                dcId = file.file_dc_id;
            }
        }
    } catch (e) {
        // Jika error, fallback tetap dipakai
    }

    const caption = `
<blockquote>🪪 <b>ID CARD TELEGRAM</b></blockquote>
<blockquote>👤 <b>Nama</b> : ${fullName}
🆔 <b>User ID</b> : <code>${userId}</code>
🌐 <b>Username</b> : ${username}
🔒 <b>DC ID</b> : <b>${dcId}</b>
📅 <b>Tanggal</b> : ${date}</blockquote>
<blockquote>© @ku_kaii</blo>
  `;

    try {
        const userProfilePhotos = await bot.getUserProfilePhotos(userId, {
            limit: 1
        });

        if (userProfilePhotos.total_count === 0)
            throw new Error("No profile photo");

        const fileId = userProfilePhotos.photos[0][0].file_id;

        await bot.sendPhoto(chatId, fileId, {
            caption: caption,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: `${fullName}`, url: `tg://user?id=${userId}` }]
                ]
            }
        });
    } catch (err) {
        await bot.sendMessage(chatId, caption, { parse_mode: "HTML" });
    }
});

// === Command manual: /backup ===
bot.onText(/^\/backup$/, async msg => {
    const senderId = msg.from.id;
    const chatId = msg.chat.id;

    if (!isAnyOwner(senderId))
        return bot.sendMessage(chatId, "⛔ Only Owner");

    try {
        const backupPath = backupData();
        if (backupPath) {
            await bot.sendDocument(chatId, backupPath, {}, {
                filename: "data-backup.json"
            });
        } else {
            await bot.sendMessage(chatId, "⚠️ Tidak ada data.json untuk di-backup.");
        }
    } catch (e) {
        console.error("❌ Error backup manual:", e);
        bot.sendMessage(chatId, "❌ Gagal membuat backup.");
    }
});


// Fungsi hitung CPU usage %
async function getCpuUsage() {
    return new Promise(resolve => {
        const start = cpuTimes();

        setTimeout(() => {
            const end = cpuTimes();

            const idle = end.idle - start.idle;
            const total = end.total - start.total;

            const usage = (1 - idle / total) * 100;
            resolve(usage);
        }, 100); // jeda 100ms
    });
}

function cpuTimes() {
    const cpus = os.cpus();

    let idle = 0;
    let total = 0;

    cpus.forEach(cpu => {
        for (const type in cpu.times) {
            total += cpu.times[type];
        }
        idle += cpu.times.idle;
    });

    return { idle, total };
}

bot.onText(/\/ping/, async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAnyOwner(userId))
        return bot.sendMessage(chatId, "⛔ Hanya Owner yang bisa menggunakan perintah ini.");

    try {
        const loading = await bot.sendMessage(chatId, "⏳ *Checking system...*", {
            parse_mode: "Markdown"
        });

        // ======== DATA VPS =========
        const uptimeMs = Date.now() - BOT_START_TIME;
        const uptime = formatUptime(Math.floor(uptimeMs / 1000));
        const totalMem = os.totalmem() / 1024 ** 3;
        const freeMem = os.freemem() / 1024 ** 3;
        const cpuInfo = os.cpus()[0];
        const cpuModel = cpuInfo.model;
        const cpuCores = os.cpus().length;

        // ======== CPU USAGE % =========
        const cpuPercent = await getCpuUsage();
        let cpuStatus = cpuPercent > 90 ? "🔴" : cpuPercent > 60 ? "🟠" : "🟢";

        // RAM status
        let statusRam = freeMem < 0.4 ? "🔴" : freeMem < 1 ? "🟠" : "🟢";

        const teks = `
<blockquote>
<b>🖥️ VPS System Status</b>

<b>CPU:</b> ${cpuStatus} ${cpuModel} (${cpuCores} Core)
<b>CPU Usage:</b> ${cpuPercent.toFixed(1)}%

<b>RAM:</b> ${statusRam} ${freeMem.toFixed(2)} GB / ${totalMem.toFixed(2)} GB
<b>Uptime:</b> ⏱️ ${uptime}

<b>Status:</b> ${
            freeMem < 0.4
                ? "⚠️ Memory Almost Full"
                : cpuPercent > 90
                ? "🔥 CPU Overload"
                : "✅ Normal"
        }
</blockquote>
        `.trim();

        await bot.editMessageText(teks, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "HTML"
        });

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "❌ Gagal membaca info VPS.");
    }
});

function formatUptime(seconds) {
    seconds = Math.floor(seconds);

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${d} hari, ${h} jam, ${m} menit, ${s} detik`;
}

// === /updaget ===
bot.onText(/\/updaget (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id.toString();
    const userId = msg.from.id;
    const link = match[1].trim();
    if (!isAnyOwner(userId))
        return bot.sendMessage(chatId, "⛔ Hanya Owner yang bisa menggunakan perintah ini.");

    // Cek format link DANA
    if (!link.startsWith("https://link.dana.id/danakaget")) {
        return bot.sendMessage(
            chatId,
            "❌ Link tidak valid!"
        );
    }

    // === Baca data.json ===
    const data = loadData();

    // Simpan data daget ke dalam data.json
    data.daget = {
        link,
        updated_by: msg.from.username || msg.from.first_name || senderId,
        updated_at: new Date().toISOString()
    };

    saveData(data);
    console.log(`[DANA KAGET] Diperbarui oleh ${msg.from.username || msg.from.id} -> ${link}`);

    // Kirim notifikasi ke owner utama
    for (const ownerId of data.owner || []) {
        bot.sendMessage(ownerId, `[DANA KAGET] Diperbarui oleh ${msg.from.username || msg.from.id} -> ${link}`).catch(() => {});
    }

    // === AUTO BROADCAST DANA KAGET ===
    const teksBroadcast = `🎉 Dapatkan 💰 DANA Kaget GRATIS! 🤖
Klik 👉 https://t.me/BotJasebfreeBot?start=_tgr_zXtQ3_YyYjQ1
Lalu ketik /daget ⌨️ dan klaim hadiahmu! 🎁

Bot aktif 24 JAM ⏰ 

Buruan klaim sebelum kehabisan! 🥵`;

    let sukses = 0;
    let gagal = 0;

    // Kirim ke semua user
    for (const id of data.users || []) {
        try {
            await bot.sendMessage(id, teksBroadcast);
            sukses++;
        } catch (err) {
            gagal++;
            console.log(`[AUTO-BROADCAST] ❌ Gagal kirim ke user ${id}: ${err.message}`);
        }
    }

    // Kirim ke semua grup
    for (const id of data.groups || []) {
        try {
            await bot.sendMessage(id, teksBroadcast);
            sukses++;
        } catch (err) {
            gagal++;
            console.log(`[AUTO-BROADCAST] ❌ Gagal kirim ke grup ${id}: ${err.message}`);
        }
    }

    bot.sendMessage(
        chatId,
        `📢 Broadcast otomatis selesai!\n✅ Berhasil: ${sukses}\n❌ Gagal: ${gagal}`
    );
});


// === /daget ===
bot.onText(/\/daget/, async msg => {
    // Blokir jika di grup
    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        return bot.sendMessage(
            msg.chat.id,
            "❌ Perintah ini tidak bisa digunakan di dalam grup.\nGunakan di *private chat* ya!",
            { parse_mode: "Markdown" }
        );
    }

    // Cek blacklist
    if (!(await requireNotBlacklisted(msg))) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const data = loadData();

    // === Cek apakah daget tersedia ===
    if (!data.daget || !data.daget.link) {
        return bot.sendMessage(
            chatId,
            "⚠️ Belum ada link DANA Kaget yang diset!"
        );
    }

    const link = data.daget.link;

    // === CEK SUDAH JOIN CHANNEL ===
    try {
        const member = await bot.getChatMember(CHANNEL_USERNAME, userId);

        if (!member || !member.status) {
            return bot.sendMessage(
                chatId,
                "⚠️ Tidak dapat memverifikasi status kamu di channel."
            );
        }

        if (!["member", "administrator", "creator"].includes(member.status)) {
            return bot.sendMessage(chatId, "❌ Kamu belum join channel!\n👇 Gabung dulu ya:", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📢 Gabung Channel", url: CHANNEL_URL }]
                    ]
                }
            });
        }
    } catch (err) {
        console.error("[ERROR getChatMember]", err.message);
        return bot.sendMessage(
            chatId,
            "⚠️ Bot belum bisa cek join channel.\nPastikan bot sudah admin di channel.",
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📢 Buka Channel", url: CHANNEL_URL }]
                    ]
                }
            }
        );
    }

    // === Jika lolos cek channel → kirim link
    const text =
        `Aku lagi sebar DANA Kaget nih! Yuk, sikat segera sebelum melayang 💸💸💸\n${link}`;

    bot.sendMessage(chatId, text);
    console.log(`[DANA KAGET] ${msg.from.username || msg.from.id} menerima link.`);
});


// === /deldaget ===
bot.onText(/\/deldaget/, msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    // === CEK OWNER ===
    if (!OWNER_IDS.includes(userId)) {
        return bot.sendMessage(
            chatId,
            "❌ Kamu tidak memiliki izin untuk menjalankan perintah ini."
        );
    }

    const data = loadData();

    if (data.daget) {
        delete data.daget;
        saveData(data);

        bot.sendMessage(chatId, "🗑️ Link DANA Kaget berhasil dihapus!");
        console.log(`[DANA KAGET] Link dihapus oleh OWNER: ${msg.from.username || msg.from.id}`);
    } else {
        bot.sendMessage(chatId, "⚠️ Tidak ada link DANA Kaget yang tersimpan.");
    }
});
const ID_PER_PAGE = 20;
bot.onText(/^\/listgrup$/, async (msg) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id.toString();

  if (!isAnyOwner(senderId)) {
    return bot.sendMessage(chatId, "⛔ Hanya Owner yang bisa menggunakan perintah ini.");
  }

  const data = loadData();
  const groups = data.groups || [];

  if (groups.length === 0) {
    return bot.sendMessage(chatId, "⚠️ Tidak ada grup terdaftar.");
  }

  // 🔄 Kirim pesan loading dulu
  const loadingMsg = await bot.sendMessage(chatId, "⏳ Memuat daftar grup...");

  // 🔨 Build halaman (butuh waktu karena getChat)
  const { text, reply_markup } = await buildGroupPage(groups, 1);

  // 🔁 Ganti pesan loading jadi hasil akhir
  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: loadingMsg.message_id,
    parse_mode: "Markdown",
    reply_markup
  }).catch(() => {});
});
async function buildGroupPage(groups, page) {
  const totalPages = Math.ceil(groups.length / ID_PER_PAGE);
  const start = (page - 1) * ID_PER_PAGE;
  const list = groups.slice(start, start + ID_PER_PAGE);

  let text = `📜 *Daftar Grup Terdaftar*\n`;
  text += `📄 Halaman ${page}/${totalPages}\n\n`;

  let no = start + 1;

  for (const id of list) {
    try {
      const info = await bot.getChat(id);
      text += `${no}. ${info.title} — \`${id}\`\n`;
    } catch {
      text += `${no}. (Nama tidak dapat diambil) — \`${id}\`\n`;
    }
    no++;
  }

  const buttons = [];
  if (page > 1) buttons.push({ text: "⬅️ Prev", callback_data: `listgrup_${page - 1}` });
  if (page < totalPages) buttons.push({ text: "➡️ Next", callback_data: `listgrup_${page + 1}` });

  return {
    text,
    reply_markup: {
      inline_keyboard: buttons.length ? [buttons] : []
    }
  };
}
bot.on("callback_query", async (query) => {
  if (!query.data.startsWith("listgrup_")) return;

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const senderId = query.from.id.toString();

  if (!isAnyOwner(senderId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Tidak punya akses",
      show_alert: true
    });
  }

  const page = Number(query.data.split("_")[1]);
  const data = loadData();
  const groups = data.groups || [];

  const { text, reply_markup } = await buildGroupPage(groups, page);

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup
  }).catch(() => {});

  bot.answerCallbackQuery(query.id);
});
bot.onText(/^\/listusr$/, async (msg) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id.toString();

  // 🔒 Owner Only
  if (!isAnyOwner(senderId)) {
    return bot.sendMessage(chatId, "⛔ Hanya Owner yang bisa menggunakan perintah ini.");
  }

  const data = loadData();
  const users = [...new Set(data.users || [])];

  if (users.length === 0) {
    return bot.sendMessage(chatId, "⚠️ Tidak ada user terdaftar.");
  }

  const { text, reply_markup } = await buildUserPage(users, 1);

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup
  });
});
async function buildUserPage(users, page) {
  const totalPages = Math.ceil(users.length / ID_PER_PAGE);
  const start = (page - 1) * ID_PER_PAGE;
  const list = users.slice(start, start + ID_PER_PAGE);

  let text = `📜 *Daftar User Terdaftar*\n`;
  text += `📄 Halaman ${page}/${totalPages}\n\n`;

  let no = start + 1;

  for (const id of list) {
    try {
      const info = await bot.getChat(id);
      const name =
        info.first_name ||
        info.username ||
        info.title ||
        "Tanpa Nama";

      text += `${no}. ${name} — \`${id}\`\n`;
    } catch {
      text += `${no}. (Nama tidak bisa diambil) — \`${id}\`\n`;
    }
    no++;
  }

  const buttons = [];
  if (page > 1) buttons.push({ text: "⬅️ Prev", callback_data: `listusr_${page - 1}` });
  if (page < totalPages) buttons.push({ text: "➡️ Next", callback_data: `listusr_${page + 1}` });

  return {
    text,
    reply_markup: {
      inline_keyboard: buttons.length ? [buttons] : []
    }
  };
}
bot.on("callback_query", async (query) => {
  if (!query.data.startsWith("listusr_")) return;

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const senderId = query.from.id.toString();

  if (!isAnyOwner(senderId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Tidak punya akses",
      show_alert: true
    });
  }

  const page = Number(query.data.split("_")[1]);
  const data = loadData();
  const users = [...new Set(data.users || [])];

  const { text, reply_markup } = await buildUserPage(users, page);

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup
  }).catch(() => {});

  bot.answerCallbackQuery(query.id);
});

// ✅ Warna Judul
console.log(
    chalk.hex("#FF4500").bold(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${chalk.hex("#FFD700").bold("BOT JASEB ACTIVE")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEVELOPER SCRIPT : ${chalk.hex("#00FFFF")(DEVELOPER)}
VERSION SCRIPT : ${chalk.hex("#ADFF2F")(VERSION)}
CHANNEL DEVELOPER : ${chalk.hex("#1E90FF").underline(CHANNEL_URL)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
);

console.log(
    chalk.hex("#FF69B4").bold(`
⠀⠀⢀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠀
⠀⣠⠾⡏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡟⢦⠀
⢰⠇⠀⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠃⠈⣧
⠘⡇⠀⠸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡞⠀⠀⣿
⠀⡇⠘⡄⢱⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⢁⡆⢀⡏
⠀⠹⣄⠹⡀⠙⣄⠀⠀⠀⠀⠀⢀⣤⣴⣶⣶⣶⣾⣶⣶⣶⣶⣤⣀⠀⠀⠀⠀⠀⢀⠜⠁⡜⢀⡞⠀
⠀⠀⠘⣆⢣⡄⠈⢣⡀⢀⣤⣾⣿⣿⢿⠉⠉⠉⠉⠉⠉⠉⣻⢿⣿⣷⣦⣄⠀⡰⠋⢀⣾⢡⠞⠀⠀
⠀⠀⠀⠸⣿⡿⡄⡀⠉⠙⣿⡿⠁⠈⢧⠃⠀⠀⠀⠀⠀⠀⢷⠋⠀⢹⣿⠛⠉⢀⠄⣞⣧⡏⠀⠀⠀
⠀⠀⠀⠀⠸⣿⣹⠘⡆⠀⡿⢁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢻⡆⢀⡎⣼⣽⡟⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣹⣿⣇⠹⣼⣷⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⣳⡜⢰⣿⣟⡀⠀⠀⠀⠀
⠀⠀⠀⠀⡾⡉⠛⣿⠴⠳⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠳⢾⠟⠉⢻⡀⠀⠀⠀
⠀⠀⠀⠀⣿⢹⠀⢘⡇⠀⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠃⠀⡏⠀⡼⣾⠇⠀⠀⠀
⠀⠀⠀⠀⢹⣼⠀⣾⠀⣀⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣄⡀⢹⠀⢳⣼⠀⠀⠀⠀
⠀⠀⠀⠀⢸⣇⠀⠸⣾⠁⠀⠀⠀⠀⠀⢀⡾⠀⠀⠀⠰⣄⠀⠀⠀⠀⠀⠀⣹⡞⠀⣀⣿⠀⠀⠀⠀
⠀⠀⠀⠀⠈⣇⠱⡄⢸⡛⠒⠒⠒⠒⠚⢿⣇⠀⠀⠀⢠⣿⠟⠒⠒⠒⠒⠚⡿⢀⡞⢹⠇⠀⠀⠀⠀
⠀⠀⠀⠀⠀⡞⢰⣷⠀⠑⢦⣄⣀⣀⣠⠞⢹⠀⠀⠀⣸⠙⣤⣀⣀⣀⡤⠞⠁⢸⣶⢸⡄⠀⠀⠀⠀
⠀⠀⠀⠀⠰⣧⣰⠿⣄⠀⠀⠀⢀⣈⡉⠙⠏⠀⠀⠀⠘⠛⠉⣉⣀⠀⠀⠀⢀⡟⣿⣼⠇⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⡿⠀⠘⠷⠤⠾⢻⠞⠋⠀⠀⠀⠀⠀⠀⠀⠘⠛⣎⠻⠦⠴⠋⠀⠹⡆⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠸⣿⡀⢀⠀⠀⡰⡌⠻⠷⣤⡀⠀⠀⠀⠀⣠⣶⠟⠋⡽⡔⠀⡀⠀⣰⡟⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠙⢷⣄⡳⡀⢣⣿⣀⣷⠈⠳⣦⣀⣠⡾⠋⣸⡇⣼⣷⠁⡴⢁⣴⠟⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠈⠻⣶⡷⡜⣿⣻⠈⣦⣀⣀⠉⠀⣀⣠⡏⢹⣿⣏⡼⣡⡾⠃⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢿⣿⣿⣻⡄⠹⡙⠛⠿⠟⠛⡽⠀⣿⣻⣾⣿⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢿⡏⢏⢿⡀⣹⢲⣶⡶⢺⡀⣴⢫⢃⣿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣷⠈⠷⠭⠽⠛⠛⠛⠋⠭⠴⠋⣸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠹⣷⣄⡀⢀⣀⣠⣀⣀⢀⣀⣴⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠀⠀⠀⠈⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  `)
);
