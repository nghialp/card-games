# 📱 Kế hoạch xây dựng client Web + Mobile

> Phiên bản: 0.1 — 2026-07-12
> Đi kèm: [game-design.md](game-design.md) — kiến trúc server & game engine

---

## 1. Chiến lược tổng thể: viết một lần, chạy hai nơi

Nguyên tắc: **tách phần "não" khỏi phần "mặt"**. Toàn bộ logic không phụ thuộc UI được viết thành package dùng chung, web và mobile chỉ khác nhau ở tầng render.

```
                    ┌──────────────────────────────────────┐
                    │       CODE DÙNG CHUNG (packages/)     │
                    │                                      │
                    │  types/          socket events, DTO  │
                    │  game-tienlen/   luật bài (pure TS)  │
                    │  client-core/    ← THÊM MỚI          │
                    │    ├─ socket client + reconnect      │
                    │    ├─ game state store (Zustand)     │
                    │    ├─ API client (auth, lobby, shop) │
                    │    └─ i18n, format tiền/thời gian    │
                    └──────────┬───────────────┬───────────┘
                               │               │
                    ┌──────────▼─────┐  ┌──────▼──────────┐
                    │  apps/web      │  │  apps/mobile    │
                    │  React + Vite  │  │  Expo (RN)      │
                    │  chỉ có: UI,   │  │  chỉ có: UI,    │
                    │  routing, asset│  │  navigation,    │
                    │                │  │  push, IAP      │
                    └────────────────┘  └─────────────────┘
```

**Vì sao React web + React Native (không phải một codebase duy nhất):**

- Zustand, socket.io-client, và toàn bộ pure logic chạy y hệt trên cả hai — phần khác nhau thật sự chỉ là component render.
- Bàn chơi bài trên web và mobile *nên* khác nhau (landscape vs portrait, hover vs touch, kéo-thả vs chạm) → ép chung UI (kiểu react-native-web) thường cho UX tệ ở cả hai phía.
- Ước lượng tỷ lệ tái sử dụng: ~60–70% code client nằm trong `client-core` + `game-tienlen` + `types`.

**Thứ tự làm: Web trước, mobile sau 1 nhịp.** Web iterate nhanh nhất (không cần build/store), dùng để chốt luật chơi + UX + protocol với server. Mobile bắt đầu khi protocol đã ổn định (cuối P2), không phải làm lại từ đầu vì `client-core` đã có sẵn.

---

## 2. Web client — kế hoạch chi tiết

### 2.1. Stack

| Hạng mục | Lựa chọn |
|---|---|
| Framework | React 19 + Vite + TypeScript |
| State | Zustand (trong `client-core`, dùng chung với mobile) |
| Render bàn chơi | **DOM + CSS animation cho MVP** (lá bài là component, animation bằng Framer Motion). PixiJS chỉ khi cần hiệu ứng nặng |
| Styling | Tailwind CSS |
| Routing | React Router (3 màn: auth, lobby, phòng chơi) |
| Realtime | socket.io-client (qua `client-core`) |
| Deploy | Static build → Cloudflare Pages / Nginx cùng VPS với server |

### 2.2. Danh sách màn hình MVP

1. **Auth** — đăng nhập / đăng ký / OTP
2. **Lobby** — danh sách phòng theo mức cược, nút "Chơi ngay" (quick join), tạo phòng
3. **Phòng chờ** — 4 ghế, trạng thái sẵn sàng, chủ phòng bấm bắt đầu
4. **Bàn chơi** — bài trên tay (fan layout), bài vừa đánh giữa bàn, avatar 3 người còn lại + số lá, đồng hồ lượt, nút Đánh/Bỏ lượt, chat mini
5. **Kết quả ván** — xếp hạng, coin thắng/thua, nút chơi tiếp
6. **Hồ sơ** — avatar, lịch sử trận, số dư coin

### 2.3. Bài toán UI khó cần lưu ý trước

- **Layout bàn 4 người responsive**: desktop landscape đặt 4 phía; mobile-web portrait đặt mình dưới, 3 người trên. Quyết định layout system sớm.
- **Animation chia bài / đánh bài**: dùng FLIP animation (Framer Motion `layoutId`) — lá bài "bay" từ tay xuống bàn. Làm mượt từ đầu, retrofit rất tốn.
- **Chọn nhiều lá để đánh**: tap để chọn (nhấc lá lên), highlight tổ hợp hợp lệ bằng chính `game-tienlen` — đây là chỗ pure logic dùng chung phát huy.
- **Turn timer đồng bộ**: server gửi `turnEndsAt` (timestamp), client tự đếm ngược — không sync từng giây qua socket.

---

## 3. Mobile client — kế hoạch chi tiết

### 3.1. Stack

| Hạng mục | Lựa chọn |
|---|---|
| Framework | **Expo (React Native) + TypeScript**, EAS Build |
| Navigation | Expo Router |
| Animation | react-native-reanimated + gesture-handler (kéo/chạm bài) |
| Push | expo-notifications + FCM/APNs (nối vào `shared-libs/notification` phía server) |
| IAP | RevenueCat (bọc StoreKit + Google Billing, đỡ tự xử receipt) — hoặc react-native-iap nếu muốn tự làm |
| OTA update | EAS Update — sửa bug JS không cần qua review store |
| Deploy | EAS Build → TestFlight / Google Play Internal Testing → production |

### 3.2. Khác biệt so với web (phần phải làm riêng)

- **Orientation**: chốt sớm — đề xuất **portrait** cho casual card game VN (chơi một tay, trên xe bus). Ảnh hưởng toàn bộ layout bàn chơi.
- **App lifecycle**: vào background → socket có thể bị OS cắt → cần logic "resume = reconnect + fetch snapshot" (đã có sẵn trong `client-core` nếu thiết kế đúng).
- **Push notification**: mời chơi, tới lượt (khi app background), nhận thưởng ngày.
- **IAP**: mua coin phải qua Apple/Google IAP (không được trỏ ra web payment cho digital goods — Apple sẽ reject). MoMo/ZaloPay/Stripe chỉ dùng cho bản web.
- **Safe area / notch**, haptic feedback khi đánh bài, giữ màn hình sáng khi trong ván.

### 3.3. Rủi ro review store (chuẩn bị tinh thần trước)

- Game bài + coin ảo sẽ bị cả 2 store soi kỹ mục **gambling**. Cần: không cash-out, không nạp-để-cược-kiểu-casino lộ liễu, khai báo rõ trong App Review Notes rằng coin không có giá trị quy đổi.
- Google Play yêu cầu khai báo "Real-money gambling & contests" form — trả lời "simulated gambling" (đánh bài giải trí).
- Apple xếp simulated gambling vào 17+ rating.
- Việt Nam: game phát hành chính thức cần **giấy phép G1** (game có tương tác nhiều người qua server). Đây là việc pháp lý cần bắt đầu sớm nếu phát hành nghiêm túc — quy trình vài tháng, thường đi qua một studio/publisher có pháp nhân đủ điều kiện.

---

## 4. Checklist chuẩn bị

### 4.1. Tài khoản & dịch vụ (đăng ký sớm — có cái chờ duyệt lâu)

| Hạng mục | Chi phí | Ghi chú |
|---|---|---|
| Apple Developer Program | $99/năm | Duyệt 1–2 ngày; nếu pháp nhân công ty cần D-U-N-S (~1–2 tuần) |
| Google Play Console | $25 một lần | Duyệt nhanh; app mới cần closed testing 12 tester/14 ngày trước khi lên production |
| Domain + SSL | ~$10–15/năm | |
| VPS/Cloud (staging + prod) | ~$20–50/tháng | 1 máy 4GB đủ cho beta |
| Firebase project | Free tier | FCM push (server đã có `shared-libs/notification/firebase.ts`) |
| Sentry | Free tier | Crash/error cho cả web, mobile, server |
| RevenueCat | Free đến $2.5k MTR | Nếu chọn phương án IAP này |
| Expo EAS | Free tier đủ cho dev | Build cloud, OTA update |
| Tài khoản MoMo/ZaloPay Business | — | Cần pháp nhân, quy trình lâu — chỉ cho web payment, làm ở P4 |

### 4.2. Thiết kế & asset

- **Bộ asset 52 lá bài** (SVG/PNG 2 độ phân giải) + lưng bài, chip, bàn — mua trên itch.io/CraftPix (~$20–50) hoặc thuê vẽ; đừng tự vẽ ở MVP.
- Design tokens dùng chung (màu, font, spacing) đặt trong `client-core` để web/mobile đồng bộ nhận diện.
- Figma: chỉ cần wireframe 6 màn MVP + layout bàn chơi 2 orientation. Sound effects (chia bài, đánh bài, thắng) — freesound/asset pack.
- App icon, splash screen, screenshot store (chuẩn bị ở P3-mobile).

### 4.3. Thiết bị & môi trường test

- 1 máy Android tầm trung thật (test hiệu năng animation + mạng yếu) — giả lập không đủ.
- 1 iPhone (hoặc TestFlight qua máy người quen) — bắt buộc có máy thật trước khi submit.
- Test 4 người chơi: 2 cửa sổ ẩn danh + 1 điện thoại + 1 giả lập là đủ cho dev hằng ngày; viết **bot client** (script dùng `client-core`) để tự lấp 4 ghế — đầu tư sớm, tiết kiệm rất nhiều thời gian test.
- Network throttling: test reconnect với chế độ máy bay / Chrome DevTools throttle.

### 4.4. CI/CD

- GitHub Actions: lint + typecheck + unit test `game-tienlen` mỗi PR (Turborepo cache để chỉ build phần đổi).
- Web: auto deploy staging mỗi merge vào `main`.
- Mobile: EAS Build cho branch `release/*`; EAS Update cho hotfix JS.

---

## 5. Lộ trình gộp (server + web + mobile)

Tiếp nối roadmap trong game-design.md, thêm nhánh mobile chạy song song từ P3:

| Giai đoạn | Tuần | Server | Web | Mobile |
|---|---|---|---|---|
| **P0 — Nền móng** | 1–2 | NestJS skeleton, auth, DB, Docker | Setup Vite app, màn auth | — (đăng ký Apple/Google dev ngay tuần 1) |
| **P1 — Engine** | 3–5 | game-core, game-tienlen, socket room | `client-core` (socket, store), lobby | — |
| **P2 — Chơi được** | 6–8 | Hoàn thiện luật, reconnect | Bàn chơi + animation + chat | Setup Expo app, màn auth/lobby (tái dùng client-core) |
| **P3 — Beta** | 9–10 | Deploy, metrics | Closed beta web | Bàn chơi mobile (portrait), TestFlight/Internal testing |
| **P4 — Launch** | 11+ | Payment, leaderboard | Public web | Push, IAP, submit store (đệm 2–4 tuần cho review vòng đầu + closed testing Google) |

**Nhân sự tối thiểu:** 2 dev fullstack TS (1 nghiêng server/engine, 1 nghiêng UI) + 1 designer part-time. Một mình vẫn làm được nhưng timeline ×2.

---

## 6. Việc cần chốt trước khi code (quyết định một lần, khó đổi)

1. **Orientation mobile: portrait hay landscape?** → đề xuất portrait (ảnh hưởng mọi layout).
2. **IAP: RevenueCat hay tự làm?** → đề xuất RevenueCat cho nhanh, migrate sau nếu phí đáng kể.
3. **Tên game + domain + tên package** (`com.company.game`) — đổi sau khi lên store là cực hình.
4. **Pháp lý G1**: phát hành thử nghiệm nhỏ hay đi publisher ngay? — quyết định này quyết định timeline phát hành thật.
