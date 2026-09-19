FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 可选：apt 换国内源，加速 ffmpeg 下载。
# 默认使用阿里云镜像（国内构建快）；海外构建可跳过换源：
#   docker compose build --build-arg APT_MIRROR=
# 或在 .env 中设置 APT_MIRROR=（留空）
ARG APT_MIRROR=mirrors.aliyun.com
RUN set -eux; \
    if [ -n "${APT_MIRROR}" ]; then \
      if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i "s|http://deb.debian.org/debian|https://${APT_MIRROR}/debian|g; s|http://security.debian.org/debian-security|https://${APT_MIRROR}/debian-security|g" /etc/apt/sources.list.d/debian.sources; \
      fi; \
      if [ -f /etc/apt/sources.list ]; then \
        sed -i "s|http://deb.debian.org/debian|https://${APT_MIRROR}/debian|g; s|http://security.debian.org/debian-security|https://${APT_MIRROR}/debian-security|g" /etc/apt/sources.list; \
      fi; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ffmpeg; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
COPY whl /app/whl
RUN pip install --no-cache-dir --no-index --find-links=/app/whl -r /app/requirements.txt

COPY . /app

EXPOSE 1111
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "1111", "--proxy-headers", "--forwarded-allow-ips", "*"]
