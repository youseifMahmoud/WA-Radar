const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const messageLog = new Map();

const MEDIA_DIR = './media_cache';
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

const client = new Client({
    authStrategy: new LocalAuth(),
    takeoverOnConflict: true,
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// ─── أنواع الميديا المدعومة ───────────────────────────────────────────────────
const SUPPORTED_MEDIA = ['image', 'video', 'audio', 'ptt']; // ptt = voice record

// ─── Helper: رقم الهاتف الصحيح ──────────────────────────────────────────────
function extractPhone(msg, contact) {
    const raw = msg._data?.from || msg._data?.author || '';
    const fromRaw = raw.replace('@c.us', '').replace('@s.whatsapp.net', '');
    if (fromRaw && /^\d{7,15}$/.test(fromRaw)) return fromRaw;
    const idUser = contact.id?.user || '';
    if (idUser && /^\d{7,15}$/.test(idUser)) return idUser;
    return contact.number || 'Unknown';
}

// ─── Helper: معلومات المرسل ──────────────────────────────────────────────────
async function getSenderInfo(msg) {
    const contact = await msg.getContact();
    const sender  = contact.pushname || contact.name || 'Unknown';
    const phone   = extractPhone(msg, contact);
    const chat    = await msg.getChat();
    const source  = chat.isGroup ? `👥 Group: *${chat.name}*` : '💬 Private Chat';
    return { sender, phone, source };
}

// ─── Helper: تحميل وحفظ الميديا ─────────────────────────────────────────────
async function downloadMedia(msg) {
    try {
        const media = await msg.downloadMedia();
        if (!media?.data) return null;
        const ext      = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
        const filePath = path.join(MEDIA_DIR, `${msg.id.id}.${ext}`);
        fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
        return { filePath, mimetype: media.mimetype };
    } catch (e) {
        console.error('downloadMedia error:', e.message);
        return null;
    }
}

// ─── Helper: إرسال الميديا لتيليجرام حسب نوعها ──────────────────────────────
async function sendMediaToTelegram(filePath, mimetype, caption) {
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    form.append('caption', caption);
    form.append('parse_mode', 'Markdown');

    let endpoint;

    if (mimetype.startsWith('image/')) {
        form.append('photo', fs.createReadStream(filePath));
        endpoint = 'sendPhoto';
    } else if (mimetype.startsWith('video/')) {
        // تحقق من الحجم — تيليجرام حده 50MB للفيديو
        const sizeMB = fs.statSync(filePath).size / (1024 * 1024);
        if (sizeMB > 49) {
            // كبير جداً → ابعته كـ document
            console.log(`⚠️ Video too large (${sizeMB.toFixed(1)}MB) → sending as document`);
            form.append('document', fs.createReadStream(filePath));
            endpoint = 'sendDocument';
        } else {
            form.append('video', fs.createReadStream(filePath));
            endpoint = 'sendVideo';
        }
    } else if (mimetype.startsWith('audio/') || mimetype.includes('ogg')) {
        form.append('voice', fs.createReadStream(filePath));
        endpoint = 'sendVoice';
    } else {
        form.append('document', fs.createReadStream(filePath));
        endpoint = 'sendDocument';
    }

    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/${endpoint}`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000 // دقيقتين كافيين لأي فيديو
    });
}

// ─── Helper: إرسال نص لتيليجرام ─────────────────────────────────────────────
async function sendTextToTelegram(text) {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: 'Markdown'
    });
}

// ─── QR ─────────────────────────────────────────────────────────────────────
client.on('qr', async (qr) => {
    try {
        const imagePath = './whatsapp-qr.png';
        await QRCode.toFile(imagePath, qr, { width: 300 });
        const form = new FormData();
        form.append('chat_id', TG_CHAT_ID);
        form.append('photo', fs.createReadStream(imagePath));
        form.append('caption', '📸 *WhatsApp Radar system requested login!*');
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, { headers: form.getHeaders() });
        console.log('🚀 QR sent to Telegram.');
    } catch (err) {
        console.error('QR Error:', err.message);
    }
});

client.on('ready', () => {
    console.log('🛡️ WhatsApp Radar is active!');
    if (fs.existsSync('./whatsapp-qr.png')) fs.unlinkSync('./whatsapp-qr.png');
});

// ─── استقبال الرسائل ──────────────────────────────────────────────────────────
client.on('message', async (msg) => {
    try {
        const { sender, phone, source } = await getSenderInfo(msg);
        const time = new Date().toLocaleTimeString();

        const entry = {
            body: msg.body || '',
            sender,
            phone,
            source,
            time,
            hasMedia: msg.hasMedia,
            mediaType: msg.type,
            mediaPath: null,
            mimetype: null
        };

        // تحميل الميديا المدعومة وحفظها
        if (msg.hasMedia && SUPPORTED_MEDIA.includes(msg.type)) {
            const result = await downloadMedia(msg);
            if (result) {
                entry.mediaPath = result.filePath;
                entry.mimetype  = result.mimetype;
                console.log(`💾 Cached [${msg.type}]: ${result.filePath}`);
            }
        }

        messageLog.set(msg.id.id, entry);

        // تنظيف الذاكرة
        if (messageLog.size > 500) {
            const firstKey = messageLog.keys().next().value;
            const old = messageLog.get(firstKey);
            if (old?.mediaPath && fs.existsSync(old.mediaPath)) fs.unlinkSync(old.mediaPath);
            messageLog.delete(firstKey);
        }

    } catch (err) {
        console.error('message handler error:', err.message);
    }
});

// ─── اكتشاف الحذف ─────────────────────────────────────────────────────────────
client.on('message_revoke_everyone', async (after, before) => {
    if (!before || !messageLog.has(before.id.id)) return;

    const m = messageLog.get(before.id.id);

    // أيقونة حسب نوع الميديا
    const typeEmoji = {
        image: '🖼️ Image',
        video: '🎥 Video',
        ptt:   '🎤 Voice Record',
        audio: '🎵 Audio'
    };
    const mediaLabel = typeEmoji[m.mediaType] || '';

    const caption = `🚨 *Deleted Message Detected!*
👤 *Sender:* ${m.sender}
📞 *Phone:* +${m.phone}
${m.source}
🕒 *Time:* ${m.time}${mediaLabel ? `\n📎 *Type:* ${mediaLabel}` : ''}${m.body ? `\n📩 *Message:* ${m.body}` : ''}`;

    try {
        if (m.mediaPath && fs.existsSync(m.mediaPath)) {
            await sendMediaToTelegram(m.mediaPath, m.mimetype, caption);
            fs.unlinkSync(m.mediaPath);
            console.log(`🚀 Deleted [${m.mediaType}] alert sent.`);
        } else {
            await sendTextToTelegram(caption);
            console.log('🚀 Deleted text alert sent.');
        }
    } catch (e) {
        console.error('Telegram Error:', e.message);
    }

    messageLog.delete(before.id.id);
});

process.on('unhandledRejection', (reason) => console.log('⚠️ Error:', reason));

client.initialize();
