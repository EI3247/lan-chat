# LAN Chat (Local Area Network Instant Messaging & File Sharing System)

[中文说明文档](README_CN.md) | **English**

A lightweight, out-of-the-box local area network (LAN) chatroom + private file cloud + WebRTC P2P high-speed file transfer system.  
Built with **FastAPI + SQLite + Vanilla JavaScript**. Runs seamlessly as a single Docker container, ideal for home NAS, small teams, research labs, and office environments.

---

## ✨ Key Features & Highlights

### 1. 🔑 Seamless Account Inheritance via Device / Browser Fingerprinting
- **No Complex Registration**: Users simply enter a nickname to start chatting.
- **Cross-Browser & Multi-Device Account Inheritance**: Powered by browser fingerprinting technology. When switching to a different browser or re-entering the platform on the same device/environment, users can **seamlessly inherit and bind their existing account, avatar, and message history** without remembering passwords or tedious login workflows.

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

## 🚀 Quick Start

### 1. Using Docker Compose (Recommended)

Clone the repository and start:

```bash
docker compose up -d
```

The service will be accessible at `http://<your-lan-ip>:1111`.

### 2. Configuration (`docker-compose.yml`)

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
