# Dockerfile — 供 Railway / 任意「仓库根目录为构建上下文」的 PaaS 使用。
# 构建上下文 = 仓库根目录（这样能同时 COPY gateway/ 与 backend/）。
# 注意：本机 VPS 用 gateway/Dockerfile + gateway/docker-compose.yml；两者内容保持一致。

FROM python:3.11-slim

WORKDIR /app

COPY gateway/requirements.txt ./gateway/requirements.txt
RUN pip install --no-cache-dir -r gateway/requirements.txt

COPY gateway/ ./gateway/
COPY backend/ ./backend/

WORKDIR /app/gateway
EXPOSE 9000

# 监听 $PORT（Railway 注入），本地/自建 Docker 可设 AIES_GATEWAY_PORT。
CMD ["python", "gateway_server.py"]
