# AI English Learning Studio — 托管网关

这是桌面应用「AI English Learning Studio」的**中转网关**。它持有开发者的真实
DeepSeek / COZE 密钥，对用户只暴露一个激活码。桌面客户端在「激活码（托管）」
模式下，把翻译/批改/辩论/评分/释义/游戏对话等 AI 调用转发到这里，由网关校验
激活码后注入真实密钥并调用对应引擎。

## 目录

- `gateway_server.py` — Flask 服务（`POST /v1/ai`、`GET /v1/health`）
- `auth.py` — 激活码存储与校验（SQLite）
- `ops.py` — op → AI 引擎映射，复用 `../backend` 现有引擎
- `audit.py` — 按激活码的调用审计日志（`data/usage.log`）
- `manage_codes.py` — 生成/吊销/查询激活码的 CLI
- `deploy.sh` — 一键部署脚本（Docker + 可选 HTTPS）
- `Caddyfile` — HTTPS 反向代理配置
- `Dockerfile` / `docker-compose.yml` — 部署

## 一键部署（推荐）

服务器上装好 Docker，把 `gateway/` 和 `backend/` 两个目录传上去（如
`scp -r gateway backend user@IP:/srv/aies/`），然后：

```bash
cd /srv/aies/gateway
cp .env.example .env        # 填入真实 DeepSeek/Coze 密钥
chmod +x deploy.sh

# 测试（明文 HTTP）
./deploy.sh

# 正式上线（HTTPS，需域名解析到本机；国内域名需已备案）
DOMAIN=your-domain.com ./deploy.sh
```

`deploy.sh` 会：构建并启动网关 → 等待就绪 → 生成 10 个激活码（可用
`COUNT/EXPIRES/DAILY_LIMIT` 环境变量覆盖）→ 若给了 `DOMAIN` 则启动 Caddy 上
HTTPS。

## 手动部署（不用 deploy.sh）

```bash
cd gateway
cp .env.example .env
docker compose up -d --build
docker compose exec gateway python manage_codes.py create --count 10 --expires 30d --daily-limit 200
```

## Railway 部署（PaaS，免运维）

Railway 自带 HTTPS 域名、自动注入 `PORT` 环境变量，用根目录的 `Dockerfile`
（仓库根 `/Dockerfile`）构建。步骤：

1. 把仓库推到 GitHub，Railway → New Project → Deploy from GitHub repo。
2. 在 Variables 里填环境变量：`AIES_DEEPSEEK_API_KEY` / `AIES_COZE_API_KEY` /
   `AIES_DEBATE_BOT_ID` / `AIES_DISCUSS_BOT_ID` / `AIES_MINECRAFT_BOT_ID` /
   `AIES_COZE_API_URL`（**不需要** DOMAIN，Railway 自带 HTTPS）。
3. 加一个 **Volume**，挂载到 `/app/gateway/data`（持久化激活码库 + 用量日志）。
4. 部署后得到 `https://<服务名>.up.railway.app`，这就是桌面端的「服务器地址」。
5. 生成激活码：Railway 面板打开 Shell，执行
   `python manage_codes.py create --count 10 --expires 30d --daily-limit 200`。

> 注意：不挂 Volume 的话，每次重启/重部署激活码库都会丢。

## HTTPS（生产必须）

正式发行**必须上 HTTPS**，否则激活码明文传输会被窃听盗用。用 Caddy（自动申请
并续期证书）：

```bash
docker run -d --name aies-caddy --network host \
  -e DOMAIN=your-domain.com \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v aies_caddy_data:/data \
  caddy:2
```

防火墙只放行 80/443，**不放行 9000**（9000 只应被 Caddy 从本机访问）。

## 激活码管理

```bash
docker compose exec gateway python manage_codes.py create --count 10 --expires 30d --daily-limit 200
docker compose exec gateway python manage_codes.py list
docker compose exec gateway python manage_codes.py revoke AIES-XXXX-XXXX-XXXX-XXXX
docker compose exec gateway python manage_codes.py stats
```

`--expires` 支持 `never` / `30d` / `1y` / ISO 日期；`--daily-limit` 与
`--total-limit` 为 0 表示不限。

## 用量审计

每次 `/v1/ai` 请求都会往 `data/usage.log` 追加一行 JSON
（`{ts, code, op, ok, detail}`），用于发现异常用量：

```bash
docker compose exec gateway tail -f data/usage.log
```

## 密钥安全

- 真实密钥只通过环境变量注入（`.env`），**不进代码、不进客户端、不进镜像**
  （仓库根目录的 `.dockerignore` 已排除 `gateway/.env` 与 `gateway/data/`）。
- 激活码只做「有效性 + 到期 + 每日/总次数」轻量校验，暂不绑定设备。
- 服务器自身被入侵仍会泄露 `.env`，需靠防火墙 / 最小权限 / 定期轮换 key 兜底。

## 本地开发

```bash
cd gateway
pip install -r requirements.txt
cp .env.example .env
python manage_codes.py create --count 1 --expires 30d --daily-limit 200
python gateway_server.py              # 监听 0.0.0.0:9000
```

冒烟测试：

```bash
curl -X POST http://127.0.0.1:9000/v1/ai \
  -H "Authorization: Bearer AIES-XXXX-XXXX-XXXX-XXXX" \
  -H "Content-Type: application/json" \
  -d '{"op":"novel_define","params":{"word":"hello","context":""}}'
```
