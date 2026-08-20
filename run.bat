@echo off
chcp 65001 >nul
title LAN Chat Server

echo ==========================================
echo   LAN Chat Windows 宿主机一键启动脚本
echo ==========================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到 python，请先安装 Python 3.10+ 并加入 PATH 环境变量。
    pause
    exit /b 1
)

if not exist "venv" (
    echo 📦 正在创建 Python 虚拟环境 (venv)...
    python -m venv venv
)

echo 🔄 激活虚拟环境...
call venv\Scripts\activate.bat

echo 📥 检查并安装依赖...
if exist "app\whl" (
    pip install --no-cache-dir --find-links=app\whl -r app\requirements.txt
) else (
    pip install --no-cache-dir -r app\requirements.txt
)

if not exist "data\quick_drop" mkdir "data\quick_drop"
if not exist "data\uploads" mkdir "data\uploads"
if not exist "data\previews" mkdir "data\previews"
if not exist "data\avatars" mkdir "data\avatars"
if not exist "data\tmp_uploads" mkdir "data\tmp_uploads"

set LANCHAT_DATA_DIR=%cd%\data
set PORT=1111

echo ==========================================
echo 🚀 LAN Chat 服务启动中...
echo 📍 数据持久化目录: %LANCHAT_DATA_DIR%
echo 🌐 访问地址: http://127.0.0.1:%PORT%
echo ==========================================

cd app
python -m uvicorn main:app --host 0.0.0.0 --port %PORT% --proxy-headers --forwarded-allow-ips *
pause
