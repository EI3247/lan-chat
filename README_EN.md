# LAN Chat (Local Area Network Instant Messaging & File Sharing System)

[中文说明文档](README.md) | **English**

> **Author**: [@EI3247](https://github.com/EI3247)  
> **Repository**: [https://github.com/EI3247/lan-chat](https://github.com/EI3247/lan-chat)  
> **License**: [MIT License](LICENSE)

A lightweight, out-of-the-box local area network (LAN) chatroom + private file cloud + WebRTC P2P high-speed file transfer system.  
Built with **FastAPI + SQLite + Vanilla JavaScript**. Runs seamlessly as a single Docker container, ideal for home NAS, small teams, research labs, and office environments, enabling **fast multi-device cross-platform file transfer** (phones, PCs, tablets).

> 💡 **Tip**: Highly recommended to configure router DNS rewrites (via AdGuard Home, OpenWrt, or dnsmasq) to map your LAN IP to a short custom domain (e.g. `http://chat.lan:1111` or `http://l.com:1111`) for effortless browser access without typing IP addresses.

---

## ✨ Key Features & Highlights

### 1. 🔑 Custom Identity Code (Account Recovery & Multi-Device Sync)
- **Zero Friction Onboarding**: Users simply choose a nickname and avatar to start chatting immediately.
- **Unique Identity Code (`id_code`)**: Every user is automatically assigned a unique 6-character recovery code, which can be customized at any time (supports custom text and Chinese characters).
- **Optional Personal Password**: Users can set an optional password for their identity code for enhanced security.
- **Cross-Browser & Multi-Device Account Inheritance**: When switching devices, changing browsers, or clearing browser cache, simply enter your **Identity Code (+ Password if set)** to instantly recover and inherit your account identity, personal avatar, private messages, and personal cloud files.
- **Seamless Account Merging**: Any messages or files sent on the temporary guest session are automatically merged into the target account upon recovery.

### 2. 💬 Instant Messaging & Hidden Admin Entry
- **Real-Time Group & Private Chat**: High-concurrency WebSocket message delivery for text, emojis, rich media (images/video/audio), and files.
- **Hidden Admin Command Entry**: No exposed admin buttons on the login/chat interface. Simply type your **Super Admin Password into the chat input box and send it**, and the system will automatically authenticate and redirect you to the `/admin` control dashboard.
- **Message Management**: Support for editing, real-time withdraw (withdraw/restore), copy, and setting messages to Private/Public.
- **User Cards & Online Detection**: Click on user avatars to view their card profile, recent messages, and check online status in real-time.

### 3. ⚡ WebRTC P2P Direct File Transfer
- **Direct P2P Streaming**: Device-to-device direct transfer within local networks. Does **not consume server disk or network bandwidth**.
- **Multi-File Queue**: Select multiple files in one batch; the receiver confirms once, and files are streamed sequentially through a single WebRTC DataChannel.
- **Large File Support**: Transfer files up to 5GB with 64KB chunking and flow control.
- **Full Transfer Controls**: Cancel transfer or waiting at any stage, with realtime progress updates on both sender and receiver sides.

### 4. 📂 Dual-Mode File Drive & Quick Drop
- **Private & Public File Drive (`/files`)**:
  - **Public Mode**: Files shared in group chat are accessible to all users.
  - **Private Mode (Personal Cloud)**: Switch to private scope to view and manage only your own private files.
  - **Filter by "My Uploads"**: Quickly filter files uploaded by the current logged-in user.
  - **Batch & File Actions**: Set files to private/public, withdraw, or download with a single click.
- **Quick Drop (Zero-DB Directory Sharing)**:
  - Drop files directly into the `/data/quick_drop/` folder on the host/NAS.
  - The web drive **instantly scans and displays** them in real-time without writing to the SQLite database.
- **Responsive Waterfall Card Grid**:
  - CSS Column waterfall flow layout, dynamically adapting from mobile 2 columns up to 5 columns on ultra-wide PC displays.
  - On-the-fly video and image thumbnail previews.
  - Plain text file online view and editing.

### 5. 📱 Full-Platform & Lightweight WebView Friendly
- Deeply adapted for PC, tablet, and mobile browsers.
- **Broad Compatibility**: Built-in 3-layer fallback for low-version Android WebViews that lack native `<dialog>` or modern ES features (such as X-Browser, in-app WebViews).

### 6. 🛡️ Security & Background Management (`/admin`)
- **Dual-Layer Passwords**: 
  - *Access Password*: Password to enter the chatroom (can be left empty for public access).
  - *Super Password*: Password to enter the `/admin` control panel.
- **Admin Capabilities**: Server-side pagination & search for users, messages, and uploaded files; file upload size limit (MB); IP auditing and message retraction.
- **Self-Contained & Offline-Ready**: Docker image includes pre-bundled offline Python wheel packages and ffmpeg components.

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

## 🛠️ 技术栈 / Tech Stack

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

