# 🃏 Card Games

Nền tảng chơi bài online multiplayer realtime (Tiến lên miền Nam trước, mở rộng Phỏm/Mậu binh/Poker sau) — web + mobile trên cùng một engine TypeScript.

## Chạy nhanh

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres + Redis
cp apps/server/.env.example apps/server/.env
pnpm dev --filter @card-games/server               # API + WS :3000
pnpm dev --filter @card-games/web                  # web :5173
```

Smoke test — 4 bot tự chơi nguyên một ván qua socket (server phải đang chạy):

```bash
pnpm --filter @card-games/server bot:match
```

Đầy đủ lệnh chạy/deploy: **[docs/deploy.md](docs/deploy.md)**

## Cấu trúc

```
apps/
  server/          NestJS — REST + Socket.IO + game engine (modular monolith)
  web/             React + Vite
packages/
  types/           Card, RoomState, socket events — contract chung client/server
  game-tienlen/    Luật Tiến lên thuần TS (combo, chặt, TienLenMatch) + unit tests
shared-libs/
  packages/        auth, user, payment, notification, analytics (skeleton)
infra/
  docker-compose.yml   Postgres 16 + Redis 7 cho dev
docs/
  game-design.md   Thiết kế tổng thể: ý tưởng, tech stack, kiến trúc server
  client-plan.md   Kế hoạch web + mobile, checklist chuẩn bị
  deploy.md        Hướng dẫn chạy & deploy (luôn cập nhật)
```

## Tài liệu

- [Thiết kế tổng thể](docs/game-design.md) — game, công nghệ, hệ thống server, roadmap
- [Kế hoạch client web + mobile](docs/client-plan.md)
- [Kế hoạch phát triển mobile](docs/mobile-plan.md) — tách client-core, IAP, reconnect, lộ trình
- [Hướng dẫn deploy](docs/deploy.md)
- [Lộ trình microservice](docs/microservices-roadmap.md) — vì sao giữ monolith, khi nào & cách tách
- [Phác thảo kiến trúc ban đầu](docs/initial-architecture-sketch.md) (đã được thay thế bởi game-design.md)

## Kiểm thử

```bash
pnpm test                                      # toàn bộ
pnpm --filter @card-games/game-tienlen test    # 20 test luật bài
```
