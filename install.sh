#!/bin/bash
# ============================================================
# lan-chat 一键部署脚本
#
# 用法：在项目目录下执行
#     sudo bash install.sh
#
# 做的事：安装命令行工具 → 记录项目目录 → 构建并启动容器 → 健康检查
# 跑完之后，宿主机任意目录都可以直接使用 lan-chat 命令。
# ============================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==> 项目目录：$DIR"

if [ ! -f docker-compose.yml ]; then
  echo "!! 当前目录缺少 docker-compose.yml，请在项目根目录运行本脚本"
  exit 1
fi

# ---------- 1. 安装命令行工具 ----------
if [ -f "$DIR/lan-chat" ]; then
  install -m 755 "$DIR/lan-chat" /usr/local/bin/lan-chat
  echo "==> 命令行工具已安装：lan-chat"
else
  echo "!! 缺少 lan-chat 脚本，跳过（不影响容器启动）"
fi

# ---------- 2. 记录项目目录，供 lan-chat 定位 ----------
CONF=/etc/lan-chat.conf
if [ ! -f "$CONF" ] || [ "$(cat "$CONF" 2>/dev/null)" != "LANCHAT_DIR=$DIR" ]; then
  echo "LANCHAT_DIR=$DIR" > "$CONF"
  chmod 644 "$CONF"
  echo "==> 已记录项目目录到 $CONF"
fi

# ---------- 3. 构建并启动容器 ----------
PORT="$(grep -oE '"?[0-9]+:[0-9]+"?' docker-compose.yml 2>/dev/null | head -1 | cut -d: -f1 | tr -d '"' || true)"
PORT="${PORT:-1111}"

echo "==> 构建并启动容器（首次大约 1-3 分钟）…"
docker compose up -d --build

# ---------- 4. 健康检查 ----------
echo "==> 健康检查（最多等 90 秒）…"
OK=0
for _ in $(seq 1 30); do
  sleep 3
  if curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
    OK=1
    break
  fi
done

echo
if [ "$OK" = "1" ]; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "==> 部署完成"
  echo "    访问地址：http://${IP:-<本机IP>}:$PORT/"
  echo "    以后更新：lan-chat update"
  echo "    查看状态：lan-chat status"
else
  echo "!! 健康检查未通过，容器可能没起来。查看日志：lan-chat logs"
  exit 1
fi
