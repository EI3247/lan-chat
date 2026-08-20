# LAN Chat (局域网即时通讯与文件共享系统)

**中文文档** | [English](README.md)

轻量级、开箱即用的局域网聊天室 + 网盘 + WebRTC P2P 大文件直传系统。  
采用 **FastAPI + SQLite + 原生 JavaScript** 构建，单个 Docker 容器即可快速部署，特别适合家庭 NAS、小团队、实验室及小型办公场景。

---

## ✨ 核心特性

- 💬 **实时群聊与私聊**：基于 WebSocket 的高并发消息推送，支持文本、表情、图片、音视频与文件消息。
- ⚡ **WebRTC P2P 大文件直传**：局域网内设备点对点直传，支持多文件队列与取消控制，不占服务器带宽与磁盘存储（最大支持 5GB）。
- 📂 **局域网网盘与 Quick Drop**：
  - 支持普通文件上传、分类检索、图片视频预览生成、瀑布流展示。
  - **Quick Drop（快捷投递）**：支持直接向服务器指定目录放入文件，前端即时实时扫描展示，免去数据库录入。
- 📱 **全平台与轻量 WebView 兼容**：深度适配 PC、平板、手机端以及各种轻量级浏览器 / APP 内嵌 WebView（包括针对低版本浏览器做了 `<dialog>` 兜底及 JS 兼容）。
- 🛡️ **轻量安全与后台管理**：双层密码体系（进入密码 + 超级后台密码）、上传文件大小限制、消息撤回/可见性管理。
- 📦 **零依赖快速部署**：镜像内自带离线依赖包与 ffmpeg 预览生成组件，单容器运行。

---

## 🚀 快速启动

### 1. 使用 Docker Compose（推荐）

克隆仓库后直接启动：

```bash
docker compose up -d
```

默认配置下服务将运行在 `http://你的局域网IP:1111`。

### 2. 配置文件说明 (`docker-compose.yml`)

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
      # 访问密码：首次进入聊天室时使用（留空则免密）
      LANCHAT_ACCESS_PASSWORD: "change_this_access_password"
      # 后台管理密码：访问 /admin 时使用（留空则免密）
      LANCHAT_ADMIN_PASSWORD: "change_this_admin_password"
      # 会话签名密钥（建议修改为随机字符串）
      LANCHAT_SECRET_KEY: "change-this-secret-lan-chat-key"
      LANCHAT_DATA_DIR: "/data"
      LANCHAT_SITE_TITLE: "LAN Chat"
      LANCHAT_WELCOME: "局域网聊天室"
    volumes:
      - ./data:/data
```

---

## 📁 目录结构与数据持久化

容器会将数据持久化在挂载的 `./data` 目录下：

```
data/
├── chat.db          # SQLite 数据库（用户信息、消息、文件索引）
├── uploads/         # 用户上传的文件存储
├── quick_drop/      # 快捷分享目录（直接扔进该目录的文件会自动在网盘页展示）
├── previews/        # 视频/图片自动生成的缩略图
├── avatars/         # 用户自定义头像
└── tmp_uploads/     # 大文件分片上传临时缓存
```

---

## 🛠️ 技术栈

- **后端**：Python 3.11, FastAPI, Uvicorn, SQLite3, ffmpeg
- **前端**：原生 HTML5 / CSS3 / JavaScript (无额外 Node.js 构建链，轻量高效)
- **协议通信**：WebSocket (Hub 连接池) + WebRTC (RTCDataChannel)

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。
