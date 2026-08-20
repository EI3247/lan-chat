# LAN Chat (Local Area Network Instant Messaging & File Sharing System)

[中文文档](README_CN.md) | **English**

A lightweight, out-of-the-box local area network (LAN) chatroom + file cloud + WebRTC P2P high-speed file transfer system.  
Built with **FastAPI + SQLite + Vanilla JavaScript**. Runs seamlessly as a single Docker container, ideal for home NAS, small teams, research labs, and office environments.

---

## ✨ Features

- 💬 **Real-Time Group & Private Messaging**: High-concurrency WebSocket message delivery supporting text, emojis, rich media (images/video/audio), and document files.
- ⚡ **WebRTC P2P Direct Large File Transfer**: Device-to-device direct transfer within local networks. Features multi-file queues, cancel control, and zero server storage/bandwidth overhead (supports files up to 5GB).
- 📂 **LAN File Drive & Quick Drop**:
  - File categorization, on-the-fly video/image thumbnail previews, responsive waterfall card view.
  - **Quick Drop**: Drop files directly into a server directory and they instantly show up on the web portal without writing to the database.
- 📱 **Responsive & Lightweight WebView Friendly**: Optimized for PC, tablet, and mobile views. Includes fallbacks for low-version Android/embedded WebViews (native `<dialog>` polyfills and ES compatibility).
- 🛡️ **Security & Admin Controls**: Dual-layer password model (Access Password + Admin Super Password), dynamic upload size limits, and message withdraw/visibility toggles.
- 📦 **Zero-Config Deployment**: Self-contained Docker image with pre-bundled offline packages and ffmpeg preview generators.

---

## 🚀 Quick Start

### 1. Using Docker Compose (Recommended)

Clone the repository and run:

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
      # Access Password: Prompted when joining chat (leave empty for public)
      LANCHAT_ACCESS_PASSWORD: "change_this_access_password"
      # Admin Password: Used to enter /admin control panel (leave empty for public)
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

## 📁 Directory Structure & Persistence

Data is persistently stored in the mounted `./data` directory:

```
data/
├── chat.db          # SQLite database (Users, messages, file metadata)
├── uploads/         # User uploaded files
├── quick_drop/      # Quick drop directory (dropped files display directly)
├── previews/        # Auto-generated image/video thumbnails
├── avatars/         # User custom avatars
└── tmp_uploads/     # Temporary chunk upload buffer
```

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11, FastAPI, Uvicorn, SQLite3, ffmpeg
- **Frontend**: Vanilla HTML5 / CSS3 / JavaScript (No Node.js build step needed)
- **Networking**: WebSocket (Hub Connection Pool) + WebRTC (RTCDataChannel)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
