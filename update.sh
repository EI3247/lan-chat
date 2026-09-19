#!/bin/bash
# ============================================================
# lan-chat 一键更新脚本
#
# 用法：在项目目录下执行
#     sudo bash update.sh
#
# 做的事：备份当前版本 → 从 GitHub 拉最新 Release 源码 →
#         只替换 app/（data/ 与 docker-compose.yml 不动）→
#         重建容器 → 健康检查（失败自动回滚）
# ============================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
REPO="EI3247/lan-chat"
STAMP="$(date +%Y%m%d%H%M%S)"
BAK="$DIR/backup/update-$STAMP"

if [ ! -f app/main.py ]; then
  echo "!! 没找到 app/main.py，请在项目根目录下运行本脚本"
  exit 1
fi

echo "==> 项目目录：$DIR"

CUR="$(grep -oP 'APP_TAG = "\K[^"]+' app/main.py 2>/dev/null || true)"
[ -z "$CUR" ] && CUR="未知"
echo "==> 当前版本：$CUR"

echo "==> 查询 GitHub 最新版本…"
LATEST="$(curl -fsSL --max-time 20 "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
          | grep -oP '"tag_name"\s*:\s*"\K[^"]+' || true)"
if [ -z "$LATEST" ]; then
  echo "!! 连不上 GitHub（国内网络可能需要先配代理再执行）"
  exit 1
fi
echo "==> 最新版本：$LATEST"

if [ "$CUR" = "$LATEST" ]; then
  echo "==> 已经是最新版本，无需更新。"
  exit 0
fi

echo "==> 备份当前版本到 $BAK"
mkdir -p "$BAK"
cp -a app "$BAK/app"
[ -f docker-compose.yml ] && cp -a docker-compose.yml "$BAK/"
echo "   备份完成（$(du -sh "$BAK" 2>/dev/null | cut -f1)）"

echo "==> 下载 $LATEST 源码…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 600 \
  "https://github.com/$REPO/archive/refs/tags/$LATEST.tar.gz" -o "$TMP/src.tar.gz"
tar -xzf "$TMP/src.tar.gz" -C "$TMP"
SRC="$(find "$TMP" -maxdepth 1 -type d -name 'lan-chat-*' | head -1)"
if [ -z "$SRC" ] || [ ! -f "$SRC/app/main.py" ]; then
  echo "!! 源码解压异常，已中止（当前版本未被改动）"
  exit 1
fi

echo "==> 替换代码（只动 app/，data/ 与 compose 配置保持不变）"
rm -rf app.new
cp -a "$SRC/app" app.new
rm -rf app
mv app.new app
if [ -f "$SRC/update.sh" ]; then cp -f "$SRC/update.sh" update.sh; fi
echo "   代码已更新到 $LATEST"

PORT="$(grep -oE '"?[0-9]+:[0-9]+"?' docker-compose.yml 2>/dev/null | head -1 | cut -d: -f1 | tr -d '"' || true)"
PORT="${PORT:-1111}"

echo "==> 重建并启动容器（大约 1-3 分钟）…"
docker compose up -d --build

echo "==> 健康检查（最多等 90 秒）…"
OK=0
for _ in $(seq 1 30); do
  sleep 3
  if curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
    OK=1
    break
  fi
done

if [ "$OK" = "1" ]; then
  NEW="$(docker exec lan-chat python3 -c "import sys;sys.path.insert(0,'/app');import main;print(main.APP_TAG)" 2>/dev/null || echo "$LATEST")"
  echo
  echo "==> 更新成功：$CUR -> $NEW"
  echo "   备份保留在：$BAK"
  echo "   确认使用正常后可自行删除该备份目录。"
else
  echo
  echo "!! 健康检查失败，正在回滚到 $CUR …"
  docker compose down || true
  rm -rf app
  cp -a "$BAK/app" app
  docker compose up -d --build
  echo "!! 已回滚到更新前的版本。备份目录：$BAK"
  exit 1
fi
