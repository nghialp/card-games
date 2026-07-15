# 🚀 Hướng dẫn chạy & deploy

> Cập nhật: 2026-07-15. File này là nguồn sự thật cho mọi lệnh chạy/deploy —
> khi thay đổi cách chạy, cập nhật file này trong cùng commit.

## 1. Yêu cầu môi trường

- Node.js ≥ 22, pnpm 10 (`corepack enable` là đủ)
- Docker (cho Postgres + Redis)

## 2. Chạy local (development)

```bash
# 1. Cài dependencies (một lần, ở thư mục gốc)
pnpm install

# 2. Hạ tầng: Postgres :5433 + Redis :6380
#    (cố ý không dùng 5432/6379 để tránh đụng project khác trên máy dev)
docker compose -f infra/docker-compose.yml up -d

# 3. Cấu hình server (một lần)
cp apps/server/.env.example apps/server/.env

# 4. Tạo/cập nhật schema database (một lần + mỗi khi schema.prisma đổi)
cd apps/server
DATABASE_URL='postgresql://cardgames:cardgames@localhost:5433/cardgames' \
  pnpm exec prisma migrate dev
cd ../..

# 5. Chạy server API + WebSocket tại http://localhost:3000
pnpm dev --filter @card-games/server

# 6. Chạy web client tại http://localhost:5173 (terminal khác)
pnpm dev --filter @card-games/web
# server không ở cổng 3000? → VITE_SERVER_URL=http://localhost:3100 pnpm dev --filter @card-games/web
```

### Chơi thử một mình với 3 bot

```bash
# Bot vào phòng cược 10 và chờ đủ 4 người mới bắt đầu:
BOT_COUNT=3 BOT_READY_AT=4 BOT_BET=10 BOT_TIMEOUT_MS=1800000 \
  pnpm --filter @card-games/server bot:match
# Mở http://localhost:5173 → nhập tên → chọn cược 10 → Chơi ngay → Sẵn sàng
```

Biến của bot script: `BOT_COUNT` (số bot, mặc định 4), `BOT_BET` (mức cược,
mặc định 10 — phải khớp mức cược bạn chọn trên web), `BOT_READY_AT` (bot chỉ
sẵn sàng khi phòng đủ N người), `BOT_TIMEOUT_MS`, `SERVER_URL`, `BOT_STOP_AFTER`.

Kiểm tra server sống: `curl http://localhost:3000/health` → `{"status":"ok"}`

> Server **vẫn chạy được khi thiếu `DATABASE_URL`/`REDIS_URL`** (log warning):
> không có Redis thì room state mất khi restart; không có Postgres thì
> kết quả trận/ví không được lưu. Đủ cho việc dev UI nhanh.

### Lệnh hay dùng

| Lệnh | Tác dụng |
|---|---|
| `pnpm build` | Build tất cả package (Turborepo, có cache) |
| `pnpm test` | Chạy toàn bộ unit test |
| `pnpm --filter @card-games/game-tienlen test` | Chỉ test luật bài |
| `pnpm --filter @card-games/server bot:match` | **E2E smoke test**: 4 bot vào phòng chơi nguyên 1 ván (server phải đang chạy; trỏ server khác bằng `SERVER_URL=`) |
| `pnpm --filter @card-games/server exec prisma studio` | GUI xem dữ liệu DB |
| `pnpm --filter @card-games/server exec prisma migrate dev` | Tạo migration mới sau khi sửa schema.prisma |
| `docker compose -f infra/docker-compose.yml down` | Tắt Postgres/Redis |

### Biến môi trường server (`apps/server/.env`)

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `PORT` | `3000` | Cổng HTTP + WebSocket |
| `CORS_ORIGIN` | `*` | Đặt thành origin web client ở production |
| `DATABASE_URL` | — | Postgres; thiếu → không lưu trận/ví (chỉ nên khi dev) |
| `REDIS_URL` | — | Redis; thiếu → mất room state khi restart, không scale ngang được |
| `JWT_SECRET` | — | Bắt buộc đổi ở production |
| `TURN_TIMEOUT_MS` | `20000` | Thời gian mỗi lượt đánh |

### Redis & PostgreSQL làm gì

- **Redis**: mọi thay đổi phòng/ván được write-through (`room:{id}`). Server
  restart → các ván `playing` được khôi phục, người chơi reconnect về đúng ghế
  với nguyên bài trên tay. Đã kiểm chứng bằng kill -9 giữa ván.
  Socket.IO Redis adapter tự bật khi có `REDIS_URL` (cần cho multi-instance).
- **PostgreSQL** (qua Prisma): khi ván kết thúc, một transaction ghi
  `matches`, `match_players`, cộng/trừ `wallets` (số dư khởi tạo 1000)
  và thêm bản ghi `transactions` append-only để đối soát.

## 3. Build & chạy production (bare-metal / VPS)

```bash
pnpm install --frozen-lockfile
pnpm build

# Áp migration (không tạo mới — chỉ chạy các migration đã commit)
cd apps/server && DATABASE_URL='postgresql://...' pnpm exec prisma migrate deploy && cd ../..

# Server
NODE_ENV=production PORT=3000 CORS_ORIGIN=https://yourdomain.com \
DATABASE_URL='postgresql://...' REDIS_URL='redis://...' JWT_SECRET='...' \
  node apps/server/dist/main.js

# Web: build tĩnh nằm ở apps/web/dist — serve bằng Nginx/Caddy/Cloudflare Pages
```

### Giữ server sống bằng PM2

```bash
npm i -g pm2
pm2 start apps/server/dist/main.js --name card-games-server
pm2 save && pm2 startup   # tự chạy lại sau reboot
pm2 logs card-games-server
```

### Nginx mẫu (reverse proxy + WebSocket)

```nginx
server {
  listen 443 ssl;
  server_name api.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    # bắt buộc cho Socket.IO
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
  }
}
```

⚠️ Khi chạy nhiều instance server sau load balancer: Redis adapter đã có,
nhưng phải bật **sticky session theo room** — một phòng chỉ được xử lý bởi
một instance (xem game-design.md mục 3.4).

## 4. Deploy bằng Docker (cách khuyến nghị)

Stack production tự chứa: Postgres + Redis + server + web (nginx serve static
và proxy `/socket.io`). Migration tự chạy trước khi server start
(service `migrate` one-shot).

```bash
# Từ thư mục gốc repo — build và chạy tất cả, web ở cổng 8080
POSTGRES_PASSWORD='mật-khẩu-mạnh' JWT_SECRET='chuỗi-ngẫu-nhiên' \
  docker compose -f infra/docker-compose.prod.yml up -d --build

curl http://localhost:8080/health   # → {"status":"ok","redis":"ok","db":"ok"}

# Xem log / tắt
docker compose -f infra/docker-compose.prod.yml logs -f server
docker compose -f infra/docker-compose.prod.yml down
```

Chi tiết:

- [apps/server/Dockerfile](../apps/server/Dockerfile) — multi-stage,
  `pnpm deploy` đóng gói riêng server + prod deps, `prisma generate` trong image.
- [apps/web/Dockerfile](../apps/web/Dockerfile) — build static, serve bằng
  nginx theo [infra/nginx.conf](../infra/nginx.conf). Không đặt
  `VITE_SERVER_URL` khi build → client kết nối same-origin qua proxy.
- Postgres/Redis **không expose cổng ra host** — chỉ nội bộ docker network.
- Deploy VPS thật: copy repo lên máy, chạy đúng lệnh trên, rồi trỏ
  Cloudflare/Caddy/nginx ngoài vào cổng 8080 để có HTTPS.

## 5. Observability

| Endpoint | Nội dung |
|---|---|
| `GET /health` | `{status, redis, db}` — dùng cho load balancer/uptime check (nginx có proxy) |
| `GET /metrics` | Prometheus: `cardgames_rooms`, `cardgames_players_online`, `cardgames_matches_in_progress`, `cardgames_matches_finished_total` + metrics Node mặc định. **Không expose qua nginx** — scrape nội bộ cổng 3000 |

Sentry: đặt `SENTRY_DSN` là bật, không đặt là tắt — không cần đổi code.

## 6. Checklist trước khi lên production

- [ ] Đổi `JWT_SECRET` + `POSTGRES_PASSWORD`, đặt `CORS_ORIGIN` cụ thể
- [ ] HTTPS/WSS: đặt reverse proxy có SSL trước cổng 8080
- [ ] `pnpm test` xanh + chạy `bot:match` trỏ vào staging (`SERVER_URL=https://…`)
- [ ] Đặt `SENTRY_DSN` + cấu hình Prometheus scrape `server:3000/metrics`
- [ ] Backup volume `prod-postgres-data`
- [ ] Nhiều instance server? Bật sticky session theo room trước (game-design.md 3.4)
