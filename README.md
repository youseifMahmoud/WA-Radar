# WA Radar Server

A self-hosted backend server that monitors your WhatsApp account and instantly forwards deleted messages — including images, videos, and voice recordings — to a Telegram bot.

---

## What Does It Do?

When someone sends you a message on WhatsApp and then deletes it, WA Radar captures it before it disappears and sends it to you on Telegram. This works for:

- **Text messages** — the full content of any deleted text
- **Images** — photos that were sent and then deleted
- **Videos** — video messages that were deleted
- **Voice recordings** — audio messages that were deleted

For every intercepted message, the Telegram notification includes:
- Sender name
- Sender phone number
- Whether it came from a private chat or a group (with group name)
- Time the message was originally sent
- The message content or media file

---

## How It Works

The server runs a headless Chrome browser in the background, logs into WhatsApp Web using your phone's QR code, and listens to all incoming messages. Every message is temporarily stored in memory. When a deletion event is detected, the server looks up the original message from memory and forwards it to your Telegram bot before the trace is gone.

```
WhatsApp message arrives → stored in memory
         ↓
   Message gets deleted
         ↓
   Server detects deletion
         ↓
  Forwards to Telegram bot
```

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| **Node.js** | Runtime environment |
| **whatsapp-web.js** | WhatsApp Web automation library |
| **Puppeteer** | Headless Chrome to run WhatsApp Web |
| **Telegram Bot API** | Sending notifications and media |
| **form-data / axios** | HTTP requests and file uploads |
| **dotenv** | Secure environment variable management |
| **Docker** | Optional containerized deployment |

---

## Requirements

Before running the project, make sure you have:

- **Node.js** v16 or higher — [nodejs.org](https://nodejs.org)
- **npm** — comes with Node.js
- A **Telegram Bot Token** — get one from [@BotFather](https://t.me/BotFather)
- Your **Telegram Chat ID** — get it from [@userinfobot](https://t.me/userinfobot)
- A **WhatsApp account** to scan the QR code with

---

## Setup & Installation

**1. Clone or download the project**
```bash
git clone https://github.com/yourname/WA-Radar-Server.git
cd WA-Radar-Server
```

**2. Install dependencies**
```bash
npm install
```

**3. Create the `.env` file**

Create a file named `.env` in the root of the project folder:
```env
TG_TOKEN=your_telegram_bot_token_here
TG_CHAT_ID=your_telegram_chat_id_here
```

> No quotes, no spaces around the `=` sign.

**4. Start the server**
```bash
npm start
```

**5. Scan the QR code**

On first run, a QR code image will be sent to your Telegram bot. Open WhatsApp on your phone → Linked Devices → Link a Device → scan the QR.

The server will confirm with a ready message and begin monitoring.

---

## Deploying with Docker

### Requirements
- **Docker** installed — [docs.docker.com](https://docs.docker.com/get-docker/)

---

**1. Make sure your `.env` file is ready** in the project root:
```env
TG_TOKEN=your_telegram_bot_token_here
TG_CHAT_ID=your_telegram_chat_id_here
```

**2. Build the Docker image**
```bash
docker build -t wa-radar .
```

**3. Run the container**
```bash
docker run -d \
  --name wa-radar \
  --env-file .env \
  --restart unless-stopped \
  wa-radar
```

> `--restart unless-stopped` makes the container restart automatically if the server crashes or the machine reboots.

**4. Check that the container is running**
```bash
docker ps
```

**5. View live logs and get the QR code**
```bash
docker logs -f wa-radar
```

The QR code image will be sent to your Telegram bot. Scan it with WhatsApp to link your account.

**6. Stop the container**
```bash
docker stop wa-radar
```

**7. Restart the container**
```bash
docker start wa-radar
```

**8. Remove the container**
```bash
docker rm -f wa-radar
```

---

### Persisting the WhatsApp Session

To avoid re-scanning the QR code every time the container restarts, mount the session folder as a volume:

```bash
docker run -d \
  --name wa-radar \
  --env-file .env \
  --restart unless-stopped \
  -v $(pwd)/.wwebjs_auth:/app/.wwebjs_auth \
  wa-radar
```

> On Windows replace `$(pwd)` with the full path, e.g. `C:\Users\you\WA-Radar-Server`

---

## Project Structure

```
WA-Radar-Server/
├── index.js          # Main server logic
├── package.json      # Dependencies
├── Dockerfile        # Docker setup
├── .env              # Your credentials (never share this)
└── media_cache/      # Temporary storage for media files (auto-created)
```

---

## Notes

- The `media_cache/` folder stores media files temporarily and cleans them up automatically after forwarding
- The server keeps up to 500 messages in memory at a time; older ones are purged
- Videos larger than 49MB are sent as documents due to Telegram's upload limit
- Session data is saved locally so you only need to scan the QR once

---

## License

Open source — free to self-host and modify.