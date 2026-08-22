# LAN Chat — LAN Chatroom & File Sharing

[中文说明文档](README.md) | **English**

> **Author**: [@EI3247](https://github.com/EI3247)
> **Repository**: [https://github.com/EI3247/lan-chat](https://github.com/EI3247/lan-chat)
> **License**: [MIT License](LICENSE)

A self-hosted chatroom and file-sharing service that runs on your local network. It ships as a single container with no external dependencies, and all data stays on your own machine. Built for home NAS setups, small teams, and labs where internal communication shouldn't sit on a public server.

The stack is FastAPI + SQLite + vanilla JavaScript: one `main.py` on the backend, no build step on the frontend. Messages are pushed over WebSocket; large files travel over a WebRTC peer-to-peer channel.

---

## Features

### Identity and login

You pick a nickname and an avatar to enter the chatroom — there is no registration flow. On first entry the system assigns you a 6-character identity code.

That code is your credential:

- You can change it to any custom string in the settings panel, including Chinese characters.
- An optional personal password can be layered on top of it.
- Switching devices, browsers, or clearing cookies? Enter the identity code (+ password) on the login page and your old identity comes back — avatar, private messages, and personal files included.
- If you already sent messages from the new device before recovering, those get merged into the recovered account automatically.

### Messaging

- Group chat over WebSocket: text, images, video, audio, and arbitrary file types.
- Private messages between two users, visually distinguished in the chat stream.
- Sent messages can be edited, withdrawn, and restored; admins can restore withdrawn ones from the back end.
- Public/private visibility toggles at any time; toggling treats the message as re-sent and moves it to the top of the timeline.
- Long text collapses automatically.
- Clicking an avatar opens a profile card with recent messages, where you can start a P2P transfer or a private thread.

### Files and the drive page

`/files` is a dedicated drive view backed by the same storage as chat:

- Public mode shows everything shared in the room; private mode shows only yours.
- A "My uploads" filter narrows the list to files uploaded by the current account.
- Your own files can be withdrawn or switched between public/private right from the drive page.
- Images and videos get automatic thumbnails in a masonry layout — two columns on mobile, up to five on wide screens.
- Plain-text files open in an online viewer; your own uploads can be edited inline and saved.
- Large uploads are chunked, so a page refresh doesn't lose progress.

### Quick Drop

A convenience for NAS owners: drop any file into `data/quick_drop/` on the host and it shows up on the drive page after a refresh. No upload flow, no database records. These entries are labeled "Quick share", downloadable but not withdrawable. The directory is scanned on request — no polling jobs.

### WebRTC peer-to-peer transfer

For large files between two devices:

- Click "Direct transfer" on someone's profile card. After they accept, a WebRTC data channel carries the file straight from sender disk to receiver disk.
- The server stores nothing and spends no upload bandwidth on the transfer.
- Multiple files per session: the receiver confirms once, then files stream sequentially over a single connection.
- Up to 5GB per file, 64KB chunks, with flow control and live progress on both ends.
- Either side can cancel while waiting or mid-transfer.
- Offline recipients can't be offered transfers — presence is checked first.

One honest limitation: no STUN/TURN servers are configured, so this only works inside the same LAN. Through a public tunnel (e.g. frp) signaling connects but the data channel won't form; fall back to regular upload in that case.

### Admin panel

The admin entry is deliberately hidden: no buttons anywhere in the UI. The administrator types the super password into the chat input and sends it; verification lands directly on `/admin`.

From the panel you can:

- Browse and search all users (nickname, identity code, source IP, last active time), paginated.
- Search, edit, delete, or restore any message.
- Preview, download, or delete any uploaded file.
- Change site title, welcome message, access password, super password, and the upload size limit (0 means unlimited).
- Check the version page for runtime info (version, hostname, Python version).

Two password layers exist: the access password gates the chatroom itself, the super password gates `/admin`. Changing the super password updates both verification paths (form login and the chat-command jump) at once.

### Compatibility

The UI adapts to desktop and mobile browsers. Older lightweight WebViews (X-Browser on Android, in-app browsers) are covered by explicit fallbacks: `<dialog>` degrades gracefully, optional chaining has been replaced with ES5-safe equivalents, and WebSocket auth falls back to a token query parameter when the WebView refuses to send cookies.

---

## Common tasks

| Goal | How |
|---|---|
| Recover an account | Enter the original identity code (+ password) on the login page |
| Send a file to someone | Use "Direct transfer" on their card if online; otherwise post it to the room |
| Index files already on the NAS | Copy them into `data/quick_drop/` |
| Reach the admin panel | Type the super password into the chat box and send |
| Cap upload sizes | Set the limit in admin config |

---

## Known limitations

Stated plainly:

- P2P transfer is LAN-only, by design (see above).
- Under Docker bridge networking the admin log sees the bridge IP, not each device's real LAN IP. Use the bare-metal deployment below if real-IP auditing matters to you.
- No end-to-end encryption. Traffic is plaintext inside your network; don't expose this service to the internet.
- SQLite suits small deployments (a few dozen users). Larger concurrency is untested.

---

## 🚀 Deployment Methods

LAN Chat supports both **Docker Container Deployment (Recommended)** and **Bare-Metal Native Execution (No Docker)**.

### Method 1: Docker Compose (Recommended)

```bash
docker compose up -d
```
The service will be accessible at `http://<your-lan-ip>:1111`.

#### `docker-compose.yml` Configuration
```yaml
services:
  lan-chat:
    build: ./app
    container_name: lan-chat
    restart: unless-stopped
    ports:
      - "1111:1111"
    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "1111", "--proxy-headers", "--forwarded-allow-ips", "*"]
    environment:
      # Access Password: Required when joining chat (leave empty for public)
      LANCHAT_ACCESS_PASSWORD: "change_this_access_password"
      # Admin Super Password: Type into chat box and send to jump to /admin
      LANCHAT_ADMIN_PASSWORD: "change_this_admin_password"
      # Session signature secret key
      LANCHAT_SECRET_KEY: "change-this-secret-lan-chat-key"
      LANCHAT_DATA_DIR: "/data"
      LANCHAT_SITE_TITLE: "LAN Chat"
      LANCHAT_WELCOME: "Local Chatroom"
    volumes:
      - ./data:/data
```

---

### Method 2: Bare-Metal Host Execution (No Docker Required)

Ideal for lightweight Linux/macOS/Windows machines, Raspberry Pi, or embedded devices without Docker:

#### 1. Linux / macOS
```bash
chmod +x start.sh
./start.sh
```

#### 2. Windows
Double-click **`run.bat`** in the repository root.

> 💡 **Bare-Metal Advantages**: Transparently logs real local IP addresses (e.g. `192.168.1.x`) for IP auditing. Optional `ffmpeg` installation for video thumbnail previews.

---

## 📁 Directory Structure & Data Persistence

All user data is persistently saved in the mounted `./data` directory:

```
data/
├── chat.db          # SQLite database (Users, messages, file metadata)
├── uploads/         # User uploaded files
├── quick_drop/      # Quick drop directory (dropped files display directly without DB records)
├── previews/        # Auto-generated image and video thumbnails
├── avatars/         # User custom avatars
└── tmp_uploads/     # Temporary chunk upload buffer
```

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11, FastAPI, Uvicorn, SQLite3, ffmpeg
- **Frontend**: Vanilla HTML5 / CSS3 / JavaScript (Zero build step, lightweight & fast)
- **Protocol**: WebSocket (Hub Pool) + WebRTC (RTCDataChannel)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## ⚠️ Disclaimer

1. **Intended Use**: This project is intended solely for **personal learning, home LAN entertainment, academic research, and internal team/office productivity**.
2. **Prohibited Activities**: Users must strictly abide by all applicable local laws and regulations. **It is strictly forbidden to use this software for any illegal activities, including but not limited to telecommunications fraud, online gambling, distributing illegal/infringing content, privacy infringement, or any cybercrime.**
3. **Limitation of Liability**: Any direct or indirect legal liabilities, claims, or damages arising from improper or unlawful use of this software shall be **borne entirely by the individual user**. The author and contributors assume zero liability.
