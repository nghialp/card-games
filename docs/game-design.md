# 🃏 Card Games Platform — Bản thiết kế tổng thể

> Phiên bản: 0.1 — 2026-07-12
> Trạng thái: Đề xuất (dựa trên phác thảo trong README.md và shared-libs hiện có)

---

## 1. Ý tưởng sản phẩm

### 1.1. Tầm nhìn

Nền tảng chơi bài online **multiplayer realtime** cho thị trường Việt Nam, chơi được trên web và mobile, hỗ trợ nhiều game bài trên cùng một hạ tầng (một "engine" chung, mỗi game là một plugin luật chơi).

### 1.2. Danh sách game (theo thứ tự ưu tiên)

| Ưu tiên | Game | Số người | Lý do |
|---|---|---|---|
| 1 — MVP | **Tiến lên miền Nam** | 2–4 | Phổ biến nhất VN, luật đơn giản, dễ test |
| 2 | Phỏm (Tá lả) | 2–4 | Độ khó luật trung bình, tệp người chơi lớn |
| 3 | Mậu binh (Binh xập xám) | 2–4 | Ít realtime pressure (chơi theo ván), dễ mở rộng |
| 4 | Poker (Texas Hold'em) | 2–9 | Giá trị cao nhưng luật + betting phức tạp, làm sau cùng |

### 1.3. Tính năng cốt lõi (MVP)

- Đăng ký / đăng nhập (email + OTP, Google)
- Sảnh chờ (lobby): danh sách phòng, tạo phòng, vào phòng nhanh (quick join)
- Phòng chơi 4 người: chia bài, đánh bài theo lượt, đếm giờ lượt (turn timer), bỏ lượt
- Chat trong phòng, emoji
- Điểm ảo (coin) — **không đổi thưởng, không cash-out** (tránh rủi ro pháp lý cờ bạc)
- Lịch sử ván đấu, bảng xếp hạng tuần

### 1.4. Tính năng giai đoạn sau

- Reconnect khi rớt mạng (giữ chỗ 60s)
- Bot lấp chỗ trống / chơi với máy
- Nhiệm vụ ngày, vòng quay may mắn, shop trang trí (avatar, mặt bàn, lưng bài)
- Bạn bè, mời chơi qua link/push notification
- Giải đấu (tournament), mùa giải xếp hạng (ELO)
- Xem lại ván đấu (replay), khán giả (spectator)

### 1.5. Mô hình doanh thu

- Bán coin/vật phẩm trang trí (IAP qua MoMo, ZaloPay, Stripe — shared-libs/payment đã có sẵn skeleton `momo.ts`, `stripe.ts`)
- Quảng cáo rewarded (xem ads nhận coin)
- Battle pass / VIP theo tháng

⚠️ **Pháp lý:** tuyệt đối không có chiều "coin → tiền thật". Chỉ một chiều nạp, coin không chuyển nhượng giữa người chơi (hoặc giới hạn chặt) để không bị xếp vào game đổi thưởng.

---

## 2. Công nghệ sử dụng

### 2.1. Nguyên tắc chọn

- **Một ngôn ngữ xuyên suốt: TypeScript** — dùng chung types + game logic giữa client và server (repo đã theo hướng này với pnpm + tsup).
- **Server-authoritative**: mọi luật chơi chạy trên server; client chỉ render và gửi ý định (intent). Đây là nền tảng chống gian lận.
- **Bắt đầu là modular monolith, tách microservice khi cần** — phác thảo README chia 7 service ngay từ đầu là quá sớm cho MVP (xem mục 3.5).

### 2.2. Stack đề xuất

| Tầng | Công nghệ | Ghi chú |
|---|---|---|
| Ngôn ngữ | TypeScript 5.x | Chung client/server |
| Backend framework | **NestJS** (Fastify adapter) | Cấu trúc module rõ ràng, DI, phù hợp team scale |
| Realtime | **Socket.IO** + Redis adapter | Fallback tốt cho mạng mobile VN; nếu cần hiệu năng cao hơn sau này mới xét uWebSockets.js |
| Game state | **Redis** (state phòng đang chơi) | TTL + snapshot; nguồn sự thật khi ván đang diễn ra |
| Database | **PostgreSQL** + Prisma | User, ví coin, lịch sử trận, giao dịch — cần ACID, không nên dùng MongoDB cho ví tiền |
| Message queue | **Redis Streams** (MVP) → NATS/Kafka khi scale | RabbitMQ/Kafka từ đầu là thừa |
| Web client | **React + Vite**, render bàn chơi bằng **PixiJS** (hoặc DOM/CSS thuần cho MVP) | Zustand cho state, socket.io-client |
| Mobile | **React Native (Expo)** | Tái dùng logic + types TS; Unity chỉ cần nếu muốn đồ họa nặng |
| Monorepo | **pnpm workspace + Turborepo** | Đã có pnpm; thêm Turborepo để cache build |
| Auth | JWT access (15p) + refresh token (DB) | `@shared-libs/auth` đã có jsonwebtoken + bcrypt |
| Hạ tầng | Docker Compose (dev) → 1 VPS/ECS (launch) → Kubernetes (khi >5k CCU) | |
| Observability | Pino logs, Prometheus + Grafana, Sentry | |

### 2.3. Cấu trúc monorepo mục tiêu

```
card-games/
├── apps/
│   ├── server/            # NestJS — API + socket gateway + game engine (monolith MVP)
│   ├── web/               # React + Vite
│   └── mobile/            # Expo (giai đoạn 2)
├── shared-libs/           # ĐÃ CÓ: auth, user, payment, notification, analytics
│   └── packages/
│       ├── game-core/     # THÊM MỚI: engine chung (turn, timer, state machine)
│       ├── game-tienlen/  # THÊM MỚI: luật Tiến lên (pure functions, không I/O)
│       └── types/         # THÊM MỚI: DTO, socket events dùng chung client/server
├── docs/
└── infra/                 # docker-compose, k8s manifests sau này
```

**Điểm mấu chốt:** `game-tienlen` là **pure TypeScript, không side-effect** — cùng một package chạy trên server (phán quyết) và client (dự đoán nước đi hợp lệ, highlight bài đánh được) → UX nhanh mà vẫn server-authoritative. Pure logic cũng dễ unit test luật bài (phần nhiều bug nhất của game bài).

---

## 3. Hệ thống server

### 3.1. Kiến trúc MVP (modular monolith)

```
                    ┌─────────────────────────────────────┐
 Client (web/app)   │           app: server (NestJS)      │
   │   HTTPS  ──────▶  REST: auth, user, lobby, shop      │
   │                │  ─────────────────────────────      │
   │   WSS    ──────▶  Socket.IO: room, game, chat        │
   │                │  ─────────────────────────────      │
   │                │  GameEngine (in-memory + Redis)     │
   │                └──────┬───────────────┬──────────────┘
   │                       │               │
   │                    Redis          PostgreSQL
   │              (room state,        (users, wallet,
   │               pub/sub, queue)     match history)
```

Một process, nhưng code chia module theo đúng ranh giới service tương lai (`auth`, `user`, `lobby`, `game`, `notification`) — sau này tách ra chỉ là chuyện deploy.

### 3.2. Vòng đời một ván bài

1. **Join:** client vào phòng qua socket `room:join` → server kiểm tra chỗ trống, trừ coin cược nếu có.
2. **Start:** đủ người / chủ phòng bấm bắt đầu → server **xào bài bằng CSPRNG** (`crypto.randomInt`), chia bài, lưu full state vào Redis.
3. **Deal:** mỗi người chỉ nhận **bài của chính mình** (`game:hand`), state công khai (ai tới lượt, số lá còn lại của người khác) broadcast cho cả phòng. Không bao giờ gửi bài người khác xuống client.
4. **Turn loop:** client gửi `game:play {cards}` → engine validate bằng `game-tienlen` → hợp lệ thì cập nhật state, broadcast `game:played`; hết 20s không đánh → auto bỏ lượt.
5. **End:** engine xác định thắng thua, tính điểm → ghi kết quả + giao dịch coin vào PostgreSQL (transaction), đẩy sự kiện `match.finished` vào queue → notification + analytics xử lý async.
6. **Cleanup:** state Redis giữ thêm 10 phút cho replay/khiếu nại rồi expire.

### 3.3. Xử lý rớt mạng & chống gian lận

- **Reconnect:** state phòng nằm ở Redis (không phải RAM của socket), client reconnect kèm `roomId + token` → server gửi lại snapshot; giữ chỗ 60s trước khi cho bot thế chỗ hoặc xử thua.
- **Server-authoritative:** client không tự tính gì cả; mọi `game:play` đều validate lại trên server.
- **Ẩn thông tin:** bài của từng người chỉ đi qua socket của người đó.
- **Idempotency:** mỗi action kèm `seq` number, server bỏ qua action trùng/cũ (chống double-submit khi mạng lag).
- **Rate limit** trên socket event, audit log mọi nước đi (phục vụ soi gian lận thông đồng sau này).

### 3.4. Scale khi đông người

- Socket.IO + Redis adapter → chạy N instance sau load balancer (**sticky session** theo `roomId` hash).
- Phòng chơi là đơn vị shard tự nhiên: 1 phòng luôn được xử lý bởi 1 instance (dùng consistent hashing hoặc Redis lock), tránh 2 instance cùng ghi 1 ván.
- Ước lượng: 1 instance Node xử lý thoải mái 3–5k kết nối đồng thời với game theo lượt (mỗi ván chỉ vài event/giây) → chưa cần lo sớm.

### 3.5. Lộ trình tách microservice (chỉ khi có tín hiệu)

| Tách ra | Khi nào |
|---|---|
| `socket-gateway` riêng | Khi cần deploy game logic mà không rớt kết nối WS |
| `game-service` per-game | Khi 1 game cần release độc lập hoặc ngốn CPU riêng (Poker) |
| `notification`, `analytics` | Tách sớm cũng được — vốn đã async qua queue |
| `auth`, `user`, `match` | Cuối cùng — CRUD thuần, tách chỉ vì tổ chức team |

So với phác thảo cũ trong README: **gộp `room-service` + `game-service` + `socket-gateway` làm một** ở MVP (chúng chia sẻ state từng mili-giây, tách ra chỉ thêm latency và độ phức tạp), và **bỏ Kafka/RabbitMQ/Kong** ở giai đoạn đầu.

---

## 4. Thiết kế dữ liệu (rút gọn)

**PostgreSQL** (bền vững):

```
users(id, email, password_hash, display_name, avatar, created_at)
wallets(user_id, balance, updated_at)                  -- mọi thay đổi qua transactions
transactions(id, user_id, amount, type, ref_id, created_at)  -- append-only
matches(id, game_type, started_at, ended_at, result jsonb)
match_players(match_id, user_id, score, coin_delta, rank)
leaderboard_snapshots(week, user_id, points)
```

**Redis** (realtime, TTL):

```
room:{id}          hash   — config, players, status
game:{roomId}      json   — full game state (server-only)
presence:{userId}  string — socketId / instanceId
queue:quickjoin:{gameType}  list — hàng đợi ghép phòng nhanh
```

**Socket events chuẩn hoá** (định nghĩa trong `packages/types`, dùng chung 2 phía):

```
client → server:  room:join, room:leave, game:ready, game:play, game:pass, chat:send
server → client:  room:state, game:hand, game:played, game:turn, game:ended, chat:message, error
```

---

## 5. Roadmap

| Giai đoạn | Thời gian | Nội dung |
|---|---|---|
| **P0 — Nền móng** | 2 tuần | Setup monorepo (apps/ + Turborepo), NestJS skeleton, auth (dùng `@shared-libs/auth`), Postgres + Prisma, Docker Compose dev |
| **P1 — Game engine** | 3 tuần | `game-core` (turn/timer/state machine), `game-tienlen` pure logic + unit test đầy đủ luật, Redis state, Socket.IO room |
| **P2 — Web client MVP** | 3 tuần | Lobby, bàn chơi Tiến lên 4 người, chat, reconnect |
| **P3 — Soft launch** | 2 tuần | Deploy VPS, Sentry + metrics, closed beta, sửa luật/UX theo feedback |
| **P4 — Vận hành** | liên tục | Coin + shop + payment, leaderboard, bot, game thứ 2 (Phỏm), mobile app |

---

## 6. Rủi ro chính

1. **Luật bài sai** → nguồn khiếu nại số 1. Giải pháp: pure logic + bộ test case luật (kể cả case hiếm: tứ quý chặt heo, thối bài, tới trắng…).
2. **Pháp lý cờ bạc** → khóa chặt một chiều coin ngay từ thiết kế ví.
3. **Gian lận thông đồng** (2 người chung phòng chia bài cho nhau xem qua kênh ngoài) → không chặn được 100%, giảm bằng ghép phòng ngẫu nhiên + phân tích pattern sau này.
4. **Over-engineering** → bám modular monolith, chỉ tách service khi có tín hiệu ở mục 3.5.
