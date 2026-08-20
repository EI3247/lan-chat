#!/usr/bin/env bash
set -e

# 进入脚本所在根目录
cd "$(dirname "$0")"

echo "=========================================="
echo "  LAN Chat 宿主机一键启动脚本"
echo "=========================================="

# 1. 检查 Python 3 环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未检测到 python3，请先安装 Python 3.10+"
    exit 1
fi

# 2. 检查并创建虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 正在创建 Python 虚拟环境 (venv)..."
    python3 -m venv venv
fi

echo "🔄 激活虚拟环境..."
source venv/bin/activate

# 3. 安装依赖（优先使用离线 whl，离线不存在则在线安装）
echo "📥 检查并安装依赖包..."
if [ -d "app/whl" ]; then
    pip install --no-cache-dir --find-links=app/whl -r app/requirements.txt
else
    pip install --no-cache-dir -r app/requirements.txt
fi

# 4. 创建默认数据存储目录
mkdir -p data/quick_drop data/uploads data/previews data/avatars data/tmp_uploads

# 5. 加载环境变量（如果存在 .env）
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

export LANCHAT_DATA_DIR="${LANCHAT_DATA_DIR:-$(pwd)/data}"
PORT="${PORT:-1111}"

echo "=========================================="
echo "🚀 LAN Chat 服务启动中..."
echo "📍 数据持久化目录: $LANCHAT_DATA_DIR"
echo "🌐 访问地址: http://0.0.0.0:$PORT"
echo "=========================================="

cd app
exec uvicorn main:app --host 0.0.0.0 --port "$PORT" --proxy-headers --forwarded-allow-ips "*"
