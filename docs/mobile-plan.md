# 📱 Kế hoạch phát triển Mobile (Tiến Lên / Card Games)

> Cập nhật: 2026-07-16. Bổ sung & cập nhật cho [client-plan.md](client-plan.md)
> theo hiện trạng backend đã có (auth JWT, shop/payment, rewards, lobby, game realtime).
> Đọc kèm: [microservices-roadmap.md](microservices-roadmap.md).

---

## 1. Microservice có giúp gì cho mobile không? — Gần như không

Monolith hay microservice là quyết định **backend**, gần như **trực giao** với mobile.
App nói chuyện với **một** endpoint (REST + WebSocket) bất kể sau lưng là 1 hay N service.

| | Ảnh hưởng tới mobile |
|---|---|
| Tốc độ dev app, UX, kích thước app, offline | **Không đổi** |
| Nếu tách mà để client gọi thẳng nhiều service | **Hại**: nhiều round-trip trên mạng yếu → chậm. Bắt buộc có **API gateway / BFF** che topology |
| Push notification, verify IAP, WebSocket ổn định | Mobile cần — nhưng là **backend concern**, giải trong monolith y hệt |

**Kết luận:** build mobile ngay trên monolith hiện tại. Thứ mobile thật sự cần từ backend
đã có hoặc dễ thêm: contract ổn định (`@card-games/types` ✔), auth JWT + refresh (✔),
endpoint verify IAP (mở rộng nhẹ `shop`), push (`notification`). Khi nào tách service
(theo microservices-roadmap.md) thì **thêm một API gateway** là mobile không phải sửa gì.

---

## 2. Chiến lược cốt lõi: tách `client-core` dùng chung web ↔ mobile

Nguyên tắc (đã nêu ở client-plan.md, giờ cụ thể hoá theo code thật): **tách phần "não"
khỏi phần "mặt"**. Web (`apps/web`) và mobile (`apps/mobile`) khác nhau ở tầng render,
dùng chung logic.

Chuyển các phần **không phụ thuộc UI** từ `apps/web/src` ra package `packages/client-core`:

| Từ `apps/web/src` | Vai trò | Tái dùng |
|---|---|---|
| `lib/socket.ts` | Socket client + reconnect + phiên (token/guest) | 100% |
| `lib/api.ts` | REST client (auth, shop, rewards, users) + map lỗi VN | 100% |
| `store/game.ts` | Zustand: state ván + lobby + actions | ~95% (bỏ `lib/sound` web-specific) |
| `store/auth.ts` | Đăng nhập/đăng ký/refresh/số dư | ~95% (đổi lưu token: localStorage → SecureStore) |
| `games.ts` | Catalog game | 100% |

Cộng với **`@card-games/game-tienlen`** (luật bài pure TS) và **`@card-games/types`** đã có:
mobile **dùng lại luật bài để validate/highlight nước đánh client-side** y như web
(`selectionValid`, `findBeatingCombos`) — không viết lại luật. Ước lượng tái dùng
**~65–70%** code client.

> Chỉ 2 điểm cần trừu tượng hoá khi tách core: **lưu trữ token** (web `localStorage`
> vs mobile `expo-secure-store`) và **âm thanh** (web WebAudio vs mobile expo-av) →
> inject qua interface, không hard-code trong core.

---

## 3. Bản đồ backend hiện có → màn hình / module mobile

Backend đã sẵn sàng để mobile tiêu thụ ngay:

| Màn hình mobile | REST / Socket đang có | Ghi chú |
|---|---|---|
| Đăng nhập / Đăng ký | `POST /auth/register\|login\|refresh`, `GET /auth/me` | Token lưu SecureStore |
| Trang chủ (chọn game) | `games.ts` (client) | Giống hub web |
| Sảnh (danh sách bàn) | `room:list`, `room:create`, `room:join`, `room:quickjoin` | Poll 3s như web (hoặc push sau) |
| Bàn chơi | `game:ready\|play\|pass`, ← `game:hand\|played\|passed\|turn\|ended`, `chat:*` | Dùng lại `store/game` |
| Hồ sơ / lịch sử | `GET /users/me/profile` | |
| BXH tuần | `GET /leaderboard/weekly` | |
| Nạp củ | `GET /shop/packages`, `POST /shop/orders` | **Trên mobile phải qua IAP** — xem mục 4.1 |
| Điểm danh / xem QC | `GET /rewards/status`, `POST /rewards/checkin\|ad` | Rewarded ad SDK thật thay modal mô phỏng |

---

## 4. Những phần PHẢI viết riêng cho mobile (khác web)

### 4.1. IAP — nạp củ trên mobile bắt buộc qua Apple/Google

Không được dùng MoMo/Stripe cho hàng hoá số trong app (Apple/Google sẽ reject).
Luồng đúng, **nối vào chính cơ chế credit đơn idempotent đã có** (`ShopService.creditOrder`):

```
App: mua gói qua StoreKit/Play Billing (RevenueCat)
  → nhận receipt/purchase token
  → POST /shop/iap/verify { platform, packageId, receipt }   ← ENDPOINT MỚI cần thêm
Server: verify receipt với Apple/Google (server-side)
  → hợp lệ → creditOrder(...) (tái dùng, idempotent chống cộng đôi)
  → trả số dư mới
```

- Chỉ cần **thêm 1 endpoint verify** + provider `iap` trong `shop-service` (nhỏ).
  Cơ chế cộng củ, transaction, chống trùng đã có sẵn.
- **RevenueCat** khuyến nghị (bọc StoreKit + Play Billing + verify) — đỡ tự xử receipt.
- Gói `shop/packages` dùng chung, nhưng **giá hiển thị lấy từ store** (App Store/Play
  quản giá theo vùng), không hiển thị VND cứng như web.

### 4.2. Push notification

- `expo-notifications` + FCM/APNs, nối vào `shared-libs/notification` (đã có skeleton).
- Use case: tới lượt khi app ở background, mời chơi, phần thưởng ngày, kết quả trận.
- Cần: xin quyền, đăng ký device token → lưu ở server (thêm bảng `device_tokens`).

### 4.3. App lifecycle & reconnect — tận dụng đúng cơ chế server vừa làm

Đây là chỗ mobile khác web nhiều nhất và **khớp trực tiếp** với fix "rời phòng" vừa xong:

- App vào **background** → OS thường cắt WebSocket. Đây là **rớt mạng tạm** (`connected=false`),
  **KHÔNG** phải rời chủ động (`left`). Server đã giữ ghế 60s và cho reconnect về đúng ván
  qua `reattach` → mobile chỉ cần **reconnect khi app foreground trở lại**.
- ⚠️ Tuyệt đối **không gọi `room:leave`** khi app background — nếu không người chơi sẽ
  bị xử bỏ cuộc oan. Chỉ gọi `room:leave` khi user chủ động bấm "Rời phòng".
- Cần: nghe `AppState` (active/background), quản lý reconnect + backoff, fetch lại snapshot
  khi resume (server tự gửi `game:hand` + `game:turn` khi reattach — đã có).

### 4.4. Khác

- **SecureStore** cho access/refresh token (không dùng AsyncStorage cho token nhạy cảm).
- **Orientation: portrait** (chốt sớm — ảnh hưởng toàn bộ layout bàn chơi).
- Safe area / notch, haptic khi đánh bài, giữ màn hình sáng khi trong ván (`expo-keep-awake`).
- Animation dùng `react-native-reanimated` + `gesture-handler` (thay Framer Motion của web).

---

## 5. Công nghệ (chốt lại từ client-plan.md)

Expo (React Native) + EAS Build/Update, Expo Router, Zustand (qua client-core),
socket.io-client, RevenueCat (IAP), expo-notifications (push), expo-secure-store.
**Dev bằng development build, KHÔNG dùng Expo Go** (cần native module: RevenueCat, reanimated).

Chuẩn bị tài khoản/dịch vụ, thiết bị test, rủi ro review store (gambling/G1), checklist:
xem [client-plan.md §3–4](client-plan.md) — không lặp lại ở đây.

---

## 6. Lộ trình mobile (bám sau khi web đã ổn định protocol)

| Phase | Thời gian | Nội dung |
|---|---|---|
| **M0 — Tách core** | 1 tuần | Rút `packages/client-core` từ `apps/web` (socket/api/store), trừu tượng hoá token-storage + sound. Web build lại trên core → đảm bảo không vỡ. |
| **M1 — Khung app** | 1 tuần | Expo app + Expo Router + dev build; màn Đăng nhập/Đăng ký + Trang chủ (dùng core) |
| **M2 — Sảnh + Bàn chơi** | 2 tuần | Lobby (list/create/join) + bàn chơi portrait + reanimated + reconnect theo AppState |
| **M3 — Kiếm/nạp củ** | 1.5 tuần | Điểm danh + rewarded ad SDK + **IAP** (endpoint `/shop/iap/verify` + RevenueCat) |
| **M4 — Push + hoàn thiện** | 1 tuần | expo-notifications, icon/splash, screenshot store |
| **M5 — Phát hành thử** | 2–4 tuần | TestFlight + Google Internal Testing (đệm cho vòng review đầu) |

**Song song từ đầu (độ trễ cao):** đăng ký Apple Developer + Google Play Console,
tìm hiểu giấy phép G1 nếu phát hành nghiêm túc (xem client-plan.md).

---

## 7. Việc backend cần thêm để phục vụ mobile (nhỏ, làm trong monolith)

- [ ] `POST /shop/iap/verify` + provider `iap` (tái dùng `creditOrder` idempotent)
- [ ] Bảng `device_tokens` + đăng ký/gỡ token; gửi push qua `notification`
- [ ] (Tuỳ chọn) rewarded ad **server-side verification** (SSV callback) thay vì client tự báo —
      chống gian lận khi dùng ad network thật (đã ghi TODO trong `rewards.service.ts`)

→ Tất cả đều là mở rộng nhẹ trong monolith, **không cần microservice**.
