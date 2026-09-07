#!/usr/bin/env bash
# deploy.sh — AI English Learning Studio 网关一键部署
#
# 用法（在 gateway/ 目录下执行）：
#   DOMAIN=your-domain.com ./deploy.sh            # 正式：带 HTTPS
#   ./deploy.sh                                   # 测试：仅 HTTP，网关 http://<IP>:9000
#
# 可选环境变量：
#   DOMAIN      你的域名（留空则跳过 HTTPS）
#   COUNT       生成激活码数量（默认 10）
#   EXPIRES     到期时间（默认 30d）
#   DAILY_LIMIT 每日调用上限（默认 200）
set -euo pipefail

cd "$(dirname "$0")"

DOMAIN="${DOMAIN:-}"
COUNT="${COUNT:-10}"
EXPIRES="${EXPIRES:-30d}"
DAILY_LIMIT="${DAILY_LIMIT:-200}"

echo "=========================================================="
echo " AI English Learning Studio — 网关部署"
echo "=========================================================="

# ── 前置检查 ──────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || {
  echo "错误：未安装 Docker。请先执行：curl -fsSL https://get.docker.com | sh"
  exit 1
}
[ -f .env ] || {
  echo "错误：缺少 .env。请先：cp .env.example .env 并填入真实密钥。"
  exit 1
}

# ── 启动网关 ──────────────────────────────────────────────
echo "==> 构建并启动网关…"
docker compose up -d --build

echo "==> 等待网关就绪…"
ready=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:9000/v1/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = "1" ] || { echo "错误：网关未在 30s 内就绪，请查看日志：docker compose logs gateway"; exit 1; }
echo "==> 网关已就绪。"

# ── 生成激活码 ────────────────────────────────────────────
echo "==> 生成 ${COUNT} 个激活码（到期 ${EXPIRES}，每日上限 ${DAILY_LIMIT}）…"
docker compose exec -T gateway python manage_codes.py create \
  --count "$COUNT" --expires "$EXPIRES" --daily-limit "$DAILY_LIMIT"

# ── HTTPS（可选）──────────────────────────────────────────
GATEWAY_URL="http://<服务器IP>:9000"
if [ -n "$DOMAIN" ]; then
  echo "==> 配置 HTTPS：${DOMAIN} …"
  docker rm -f aies-caddy >/dev/null 2>&1 || true
  docker run -d --name aies-caddy --network host \
    -e DOMAIN="$DOMAIN" \
    -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
    -v aies_caddy_data:/data \
    caddy:2 >/dev/null
  GATEWAY_URL="https://${DOMAIN}"
  echo "==> Caddy 已启动。"
fi

echo ""
echo "=========================================================="
echo " 部署完成！"
echo "=========================================================="
echo " 桌面端设置："
echo "   使用方式   = 激活码（推荐）"
echo "   服务器地址 = ${GATEWAY_URL}"
echo "   激活码     = 上面打印的 AIES-XXXX-XXXX-XXXX-XXXX"
echo ""
if [ -z "$DOMAIN" ]; then
  echo " 提示：现在是明文 HTTP（仅测试）。正式上线请设 DOMAIN 重跑本脚本上 HTTPS，"
  echo "       并在防火墙只放行 80/443，不放行 9000。"
fi
echo " 查看用量审计：docker compose exec gateway tail -f data/usage.log"
