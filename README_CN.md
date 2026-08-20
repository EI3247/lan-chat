# LAN Chat (局域网即时通讯与文件共享系统)

**中文说明文档** | [English](README.md)

轻量级、开箱即用的局域网聊天室 + 私人网盘 + WebRTC P2P 大文件直传系统。  
采用 **FastAPI + SQLite + 原生 JavaScript** 构建，单个 Docker 容器即可快速部署，特别适合家庭 NAS、小团队、实验室及小型办公场景。

---

## ✨ 核心特性与特色功能

### 1. 💬 即时通讯与隐蔽管理入口
- **实时群聊与私聊**：基于 WebSocket 的高并发消息推送，支持发送文字、表情、图片、音视频与文件。
- **暗号式管理入口**：登录界面和聊天室**不暴露任何后台管理按钮**。管理员只需在**聊天输入框中直接输入「超级管理密码」并发送**，系统将自动校验身份并无缝跳转至 `/admin` 后台管理面板。
- **消息全生命周期管理**：支持消息在线编辑、实时撤回（撤回/恢复）、复制以及设为公开/私人可见。
- **用户名片与在线检测**：点击头像查看名片详情与最近发言；发起 P2P 直传前自动检测对方是否在线，防止盲等。

### 2. ⚡ WebRTC P2P 大文件直传
- **点对点直传**：局域网内设备直接走 P2P 数据通道传输，**不经过服务器磁盘、不占用服务器上下行带宽**。
- **多文件批量队列**：支持一次选中多个文件，接收方只需确认一次，系统自动单连接多文件复用传输。
- **大文件支持**：支持最大 5GB 文件传输，采用 64KB 分片与智能流量控制。
- **全程状态可控**：等待接受或传输过程中支持随时取消，发送与接收端实时同步传输进度与完成状态。

### 3. 📂 双模式网盘与 Quick Drop 快捷投递
- **公私双模式网盘 (`/files`)**：
  - **公开模式**：浏览聊天室所有人共享的文件。
  - **私人模式（个人网盘）**：一键切换私人视角，专属管理自己上传的私人文件。
  - **「我的上传」筛选**：快速过滤当前登录用户上传的所有历史文件。
  - **文件操作快捷菜单**：一键设为私人/公开、撤回文件、免解压在线查看/编辑纯文本文件。
- **Quick Drop（免入库目录投递）**：
  - 支持直接将文件扔进宿主机/NAS 的 `/data/quick_drop/` 文件夹。
  - 网盘页**实时扫描即时呈现**，无需走上传流程，不写 SQLite 数据库，NAS 用户极为方便。
- **响应式瀑布流布局**：
  - 卡片自适应瀑布流排列，移动端 2 列，超宽屏 PC 端自动扩展至 5 列。
  - 自动生成视频及图片缩略图，告别黑边与画面拉伸。

### 4. 📱 全平台适配与轻量 WebView 兼容
- 深度适配 PC 端、平板与手机端浏览器。
- **全兼容兜底**：内置针对轻量级浏览器（如 X浏览器、各平台内置 WebView）的三层兼容方案，即使不支持原生 `<dialog>` 标签或最新 ES 语法的低版本内核也能顺畅使用。

### 5. 🛡️ 安全与后台管理 (`/admin`)
- **双层密码机制**：
  - *访问密码*：首次进入聊天室时使用（留空可设为免密访问）。
  - *超级密码*：进入 `/admin` 管理后台使用。
- **全量后台运维**：支持用户、消息、文件的服务端分页与关键字搜索；支持动态配置文件上传大小限制（MB）；支持客户端 IP 审计与违规内容撤回。
- **离线快速构建**：Docker 镜像内置离线 Python wheel 依赖包与 ffmpeg 组件，避免构建时由于外网依赖下载失败。

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
      # 超级管理密码：在聊天输入框输入此密码发送直接进入 /admin
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
├── quick_drop/      # 快捷投递目录（直接扔进该目录的文件自动在网盘展示，不写库）
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
