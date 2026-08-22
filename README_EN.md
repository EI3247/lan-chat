# LAN Chat (Local Area Network Instant Messaging & Private Cloud Drive)

[中文说明文档](README.md) | **English**

> **Author**: [@EI3247](https://github.com/EI3247)  
> **Repository**: [https://github.com/EI3247/lan-chat](https://github.com/EI3247/lan-chat)  
> **License**: [MIT License](LICENSE)

A lightweight instant messaging, private file drive, and WebRTC P2P high-speed file transfer system designed for local network environments.  
Built on a single-file **FastAPI + SQLite** backend architecture and **vanilla HTML5 / CSS3 / JavaScript** on the frontend, requiring zero Node.js build pipelines. Fully supports one-click Docker container deployment as well as bare-metal host execution. Ideal for home NAS, studios, small teams, and internal lab collaborations.

> 💡 **Access Tip**: If paired with router DNS rewrite (e.g. AdGuard Home, OpenWrt, dnsmasq) to map the LAN IP to a custom short domain (such as `http://chat.lan:1111` or `http://l.com:1111`), all phones, PCs, and tablets across the network can access the service directly without remembering dynamic IPs.

---

## ✨ Core Capabilities & Features

### 1. Account System & Identity Code Mechanism (`id_code`)
* **Frictionless Onboarding**: Access instantly by providing a nickname and choosing an avatar—no registration required.
* **Unique Identity Code**: Every user is assigned a unique 6-character identity code upon entry. Users can customize this code at any time in the settings panel (supports text and Chinese characters).
* **Optional Password Protection**: The identity code acts as the recovery credential by default; users can set an optional password for added security.
* **Cross-Device & Cross-Browser Account Recovery**: When switching devices, changing browsers, or clearing cookies, enter the "Identity Code (+ Password)" on the login screen to immediately inherit the existing account data (avatar, private messages, personal files).
* **Seamless Session Merging**: Any messages or files sent during a temporary guest session are automatically merged and mounted into the target account upon recovery, preventing data loss.

### 2. Instant Messaging System
* **High-Concurrency Real-Time Chat**: Full-duplex broadcast and targeted messaging powered by a WebSocket connection pool, supporting text, emojis, rich media (images/video/audio), and arbitrary file attachments.
* **Message Lifecycle Controls**:
  * **Inline Editing**: Edit sent messages in place.
  * **Withdraw & Restore**: Users can withdraw their own messages and restore them; administrators possess full message restoration and audit capabilities in the admin panel.
  * **Dynamic Visibility Switching**: Toggle public messages to private (or vice versa); switching refreshes timestamps and moves messages to the top of the timeline.
* **Adaptive Typography & Input**: Long messages collapse automatically with a gradient expander; the composer features a floating glass capsule design with auto-expanding height based on content.
* **User Profile & Presence Detection**: Click an avatar to open a profile card showing join date, activity history, source IP, and recent messages, with real-time online status detection.

### 3. WebRTC P2P High-Speed File Transfer
* **Direct Point-to-Point Streaming**: Establishes a direct WebRTC DataChannel between two LAN devices—data flows strictly between clients, **consuming zero server disk space or bandwidth**.
* **Single-Connection Multi-File Queue**: Select multiple files in a single batch. The receiver confirms once, and the system automatically streams all files sequentially over a single connection.
* **Flow Control & Cancellation**: Supports up to 5GB per file with 64KB chunking and flow control (buffer monitoring). Live progress is synced to both ends, and transfers can be cancelled at any point.
* **Local Network Scope**: Operates on a direct LAN architecture without STUN/TURN; public tunneling may fall back to standard uploads if NAT traversal fails.

### 4. Dual-Mode File Drive & Quick Drop
* **Dual-Mode File Drive (`/files`)**:
  * **Public Drive**: Centralized view of all public files shared across the chatroom.
  * **Private Drive**: Switch to private scope to manage personal files exclusively.
  * **"My Uploads" Filter**: Quickly filter all uploads belonging to the current user.
  * **File Actions**: Toggle private/public status, withdraw files, download, or copy direct links.
  * **Online Text Editing**: Preview plain-text files directly in the browser; owners can edit and save changes online.
* **Quick Drop (Zero-DB Directory Sharing)**:
  * Drop files directly into the `./data/quick_drop/` directory on the host or NAS.
  * The drive view **scans and displays files in real-time** without going through the upload flow or writing to SQLite, tagged as "Quick share".
* **Responsive Masonry Layout**:
  * Adapts from 2 columns on mobile devices up to 5 columns on ultra-wide screens.
  * Automatic thumbnail generation for video and images, with fine-tuned bottom mask transparency ensuring footer card readability.

### 5. Hidden Admin Access & Management (`/admin`)
* **Command-Triggered Admin Entry**: No administrative buttons or links are exposed in the interface. The administrator types the super admin password into the chat box and sends it to authenticate and jump directly to `/admin`.
* **Full Data Auditing & Configuration**:
  * **User Management**: Server-side paginated search for user details, source IPs, and activity logs.
  * **Message Auditing**: Search complete message history with editing, deletion, and recovery controls.
  * **File Management**: Centralized file browser with previews, deletion, and type filters.
  * **Hot Configuration**: Dynamically update site title, welcome message, access password, super admin password, and upload size limit (MB, 0 for unlimited).
  * **System Diagnostics**: Tab-based overview of runtime parameters (Python version, host, data paths).

### 6. Broad Compatibility & Lightweight WebView Fallbacks
* Responsive design covering mobile, tablet, and desktop viewports.
* **WebView Fallbacks**: Explicit multi-layer compatibility handling for older Android kernels, X-Browser, and embedded WebViews:
  * CSS/JS modal fallback for environments lacking native HTML5 `<dialog>` support.
  * Removal of modern ES optional chaining syntax to avoid parse errors on legacy engines.
  * `/api/ws-token` token-based fallback authentication for WebViews that omit cookies during WebSocket handshakes.

---

## 🚀 Quick Start & Deployment

LAN Chat supports both **Docker Compose Deployment (Recommended)** and **Bare-Metal Host Execution (No Docker Required)**.

### Method 1: Docker Compose (Recommended)

```bash
docker compose up -d
```
The service will be accessible by default at `http://<your-lan-ip>:1111`.

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
# Grant executable permissions and launch (the script automatically sets up a virtual environment and dependencies)
chmod +x start.sh
./start.sh
```

#### 2. Windows
Double-click **`run.bat`** in the repository root.

> 💡 **Bare-Metal Advantage**: Directly exposes authentic client LAN IP addresses (e.g. `192.168.1.x`) for transparent IP auditing in the admin panel. Optional `ffmpeg` installation enables video thumbnail generation.

---

## 📁 Directory Structure & Data Persistence

All runtime data is persisted in the `./data` directory:

```
data/
├── chat.db          # SQLite database (Users, messages, file metadata)
├── uploads/         # User uploaded file storage
├── quick_drop/      # Quick drop directory (dropped files display directly without DB records)
├── previews/        # Auto-generated image and video thumbnails
├── avatars/         # Custom user avatars
└── tmp_uploads/     # Temporary chunk upload buffer
```

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11, FastAPI, Uvicorn, SQLite3, ffmpeg
- **Frontend**: Vanilla HTML5 / CSS3 / JavaScript (Zero build step, lightweight & fast)
- **Protocol**: WebSocket (Hub Connection Pool) + WebRTC (RTCDataChannel)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## ⚠️ Disclaimer

1. **Intended Use**: This project is intended solely for **personal learning, home LAN entertainment, academic research, and internal team/office productivity**.
2. **Prohibited Activities**: Users must strictly abide by all applicable local laws and regulations. **It is strictly forbidden to use this software for any illegal activities, including but not limited to telecommunications fraud, online gambling, distributing illegal/infringing content, privacy infringement, or any cybercrime.**
3. **Limitation of Liability**: Any direct or indirect legal liabilities, claims, or damages arising from improper or unlawful use of this software shall be **borne entirely by the individual user**. The author and contributors assume zero liability.
