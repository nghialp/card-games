# 🧭 Lộ trình microservice (và vì sao chưa nên tách vội)

> Cập nhật: 2026-07-16. Quyết định hiện tại: **giữ modular monolith**.
> Động cơ đang cân nhắc: (1) scale phần realtime, (2) deploy độc lập từng phần.
> Tài liệu này trả lời thẳng cho hai động cơ đó và ghi lộ trình tách khi có tín hiệu.

---

## 1. TL;DR

- Kiến trúc hiện tại (`apps/server` NestJS module hoá) **đã sẵn sàng để tách** khi cần —
  ranh giới module rõ, contract chung qua `@card-games/types` + `shared-libs/*`,
  Redis adapter + Docker + CI/CD đã có.
- **Chưa nên tách bây giờ**: chưa launch, 1 VPS, 1 nhóm dev. Microservice thêm
  chi phí (network, tracing, nhất quán dữ liệu, deploy nhiều service, message queue)
  mà chưa có lợi ích tương xứng.
- **Điểm mấu chốt cho "scale realtime": microservice không phải đòn bẩy.** Xem mục 2.
- Giữ **checklist mục 5** để monolith luôn "tách được trong 1–2 ngày" khi tín hiệu tới.

---

## 2. Trả lời thẳng cho hai động cơ

### 2a. "Scale phần realtime" → không cần tách microservice

Sự thật kỹ thuật: phần game realtime hiện **giữ state phòng in-memory theo từng
instance** (`RoomService`, một `Map` trong RAM), write-through xuống Redis
(`room:{id}`) và khôi phục khi restart. Socket.IO **Redis adapter đã bật**
(`apps/server/src/redis-io.adapter.ts`) nên broadcast tới phòng đã hoạt động
xuyên instance.

Nút thắt thật sự **không phải** "monolith hay microservice" mà là **sở hữu phòng**:
một phòng chỉ được đúng **một** instance xử lý (nếu không, hai instance cùng ghi
một ván → hỏng state). Bài toán này **giống hệt nhau** dù bạn chạy N bản monolith
hay tách riêng game-service. → **Tách service không tự giải quyết việc scale realtime.**

Cách scale realtime **không cần tách** (làm được ngay khi có tải):

| Mức | Cách làm | Ghi chú |
|---|---|---|
| **Dọc** (vertical) | Tăng RAM/CPU 1 instance | Game theo lượt rất nhẹ (vài event/giây mỗi phòng) → 1 box mạnh gánh vài nghìn CCU. Làm trước tiên. |
| **Ngang** (horizontal) | N bản monolith + **sticky session theo phòng** + **registry phòng trên Redis** | Việc thật cần làm (mục 6). Đây mới là "scale realtime", và nó độc lập với quyết định microservice. |

**Kết luận:** khi cần scale realtime, ưu tiên làm mục 6 (sở hữu phòng + registry),
chưa cần đụng tới việc tách service. Chỉ tách `socket-gateway`/`game-service`
riêng khi có **lý do vận hành khác** (mục 2b), không phải để scale.

### 2b. "Deploy độc lập từng phần" → microservice là đòn bẩy, nhưng hiện chưa đáng

Đây mới là động cơ chính đáng để tách. Nhưng với **1 nhóm dev + pre-launch**,
lợi ích ("sửa payment không deploy lại cả hệ thống") nhỏ, trong khi chi phí lớn.

Giải pháp trung gian rẻ hơn nhiều: **modular monolith + CI/CD nhanh** (đã có).
Deploy lại toàn bộ server hiện mất ~vài phút và không gián đoạn (restart nhanh,
state ở Redis). Khi nào việc deploy-lại-toàn-bộ thật sự cản trở (release nhiều
lần/ngày, nhiều nhóm) → mới tách theo mục 4.

---

## 3. Ranh giới tách sẵn có (module → service tương lai)

Mỗi module trong `apps/server/src` gần như đã là một service, chỉ chưa tách process:

| Module hiện tại | Tách thành | Độ khó | Trạng thái dữ liệu |
|---|---|---|---|
| `auth` | auth-service | Dễ | Stateless (JWT) + bảng users/refresh_tokens |
| `users` (profile, leaderboard) | user/match-service | Dễ | Đọc Postgres |
| `shop` (payment) + `shop/rewards` | shop-service | Dễ | Postgres + webhook cổng thanh toán |
| `game` (RoomService + gateway) | **socket-gateway + game-service** | **Khó** | **Stateful realtime** — xem mục 6 |
| `notification`, `analytics` (`shared-libs`) | notification/analytics-service | Dễ | Vốn nên async qua queue |
| `metrics`, `persistence` | Thư viện dùng chung, không tách | — | — |

---

## 4. Lộ trình strangler (khi có tín hiệu — KHÔNG big-bang)

Tách dần, mỗi bước chạy được và có giá trị, không viết lại từ đầu.

- **P-A — Dựng đường ống (làm 1 lần):** thêm API gateway (nginx/Kong) định tuyến
  theo path, message queue (NATS/Redis Streams) cho sự kiện nội bộ, service-to-service
  auth (JWT nội bộ / mTLS), tracing (OpenTelemetry). Đây là "thuế" cố định của
  microservice — làm trước khi tách cái đầu tiên.
- **P-B — Tách 1 service CRUD làm mẫu:** `notification` hoặc `rewards` — ít rủi ro,
  ít phụ thuộc. Dùng làm khuôn (Dockerfile, CI, health, config) cho các service sau.
- **P-C — Tách nhóm CRUD còn lại:** auth, users, shop. Cân nhắc DB riêng từng service
  (hoặc chung DB, tách schema) — đổi tùy nhu cầu độc lập dữ liệu.
- **P-D — Tách realtime (cuối cùng, khó nhất):** `socket-gateway` (kết nối WS,
  stateless) tách khỏi `game-service` (logic ván). **Bắt buộc giải mục 6 trước.**

**Trigger để bắt đầu từng phase** (đừng làm sớm hơn):

| Tách | Chỉ làm khi |
|---|---|
| notification/analytics | Có tác vụ nền nặng làm chậm request, hoặc cần retry/queue |
| auth/user/shop | Nhiều nhóm dev đụng nhau, hoặc cần release CRUD độc lập nhiều lần/ngày |
| socket-gateway/game | Cần deploy logic game mà không rớt kết nối WS đang chơi; hoặc 1 game ngốn CPU riêng (Poker) |

---

## 5. Checklist "microservice-ready" giữ trong monolith (làm ngay, rẻ)

Giữ các quy tắc này để sau tách chỉ mất 1–2 ngày mỗi service, không phải refactor lớn:

- [ ] **Module không import chéo trực tiếp** — giao tiếp qua service interface, không
      với tay vào bảng DB của module khác.
- [ ] **Tác dụng phụ đi qua sự kiện, không gọi thẳng.** Ví dụ khi ván kết thúc:
      phát domain-event `match.finished` thay vì `game` gọi trực tiếp `notification`/
      `analytics`. Trong monolith có thể dùng Nest `EventEmitter`; sau này đổi emitter
      thành message queue là xong, không sửa nơi phát/nhận.
- [ ] **Không phụ thuộc trạng thái in-memory dùng chung giữa module.** (RoomService
      đã đúng: nguồn sự thật có thể chuyển hẳn về Redis — mục 6.)
- [ ] **Config/env theo tiền tố module** (`AUTH_*`, `SHOP_*`, `GAME_*`) để tách ra
      là copy đúng nhóm env.
- [ ] **Health + metrics theo module** (đã có `/health`, `/metrics`).
- [ ] **Contract dùng chung ở `packages/types` + `shared-libs`** (đã làm) — mọi DTO
      qua đây, không định nghĩa trùng.
- [ ] **Idempotency cho thao tác quan trọng** (đã có: `seq` trong game, credit đơn
      nạp idempotent) — bắt buộc khi giao tiếp qua network không tin cậy.

---

## 6. Việc phải giải trước khi scale/tách realtime: "sở hữu phòng"

Đây là 80% công sức của cả "scale realtime ngang" lẫn "tách game-service".

**Vấn đề:** hiện mỗi instance có `Map` phòng riêng. Chạy 2 instance thì:
- `room:list`/`room:quickjoin` chỉ thấy phòng của instance mình → sảnh lệch.
- Hai instance có thể cùng xử lý một phòng → tranh ghi state.

**Hai hướng giải (chọn 1):**

1. **Sticky theo phòng + registry Redis** (ít đổi code hơn):
   - Registry phòng dùng chung trên Redis (id, gameType, betAmount, số người, instance-owner).
   - `room:list`/join đọc registry; joiner được định tuyến (sticky) tới **instance sở hữu** phòng.
   - Mỗi phòng vẫn giữ state in-memory ở đúng instance owner → không tranh ghi.
   - Cần LB hỗ trợ sticky theo khoá phòng (hoặc gateway tự route theo owner trong registry).

2. **State phòng nằm hẳn trên Redis + 1 writer/phòng** (thuần hơn, khó hơn):
   - Nguồn sự thật là Redis; instance nào cũng xử lý được nhưng phải có **lock/consistent-hashing**
     đảm bảo mỗi phòng chỉ một writer tại một thời điểm.
   - Snapshot ván đã JSON-serializable sẵn (`TienLenMatch.snapshot/restore`) nên khả thi.

**Khuyến nghị:** khi tới lúc, làm **hướng 1** trước (rẻ, an toàn), đủ để scale ngang
mà vẫn là monolith. Chỉ khi tách hẳn `socket-gateway` (WS stateless) khỏi
`game-service` mới cân nhắc hướng 2.

---

## 7. Chi phí & rủi ro của việc tách (để cân nhắc)

- **Chi phí cố định**: API gateway, message queue, service discovery, distributed
  tracing/logging, CI/CD nhiều pipeline, nhiều Dockerfile, quản lý version contract.
- **Nhất quán dữ liệu**: giao dịch xuyên service (nạp củ → cập nhật ví → ghi lịch sử)
  phải chuyển sang saga/outbox thay vì 1 transaction Postgres như hiện tại.
- **Debug khó hơn**: một luồng đi qua nhiều service, cần trace để lần.
- **Rủi ro over-engineering**: hầu hết startup game bài chạy tốt trên monolith tới
  hàng chục nghìn CCU. Tách quá sớm là nguồn nợ kỹ thuật phổ biến nhất.

→ Vì vậy: **giữ monolith, theo checklist mục 5, và chỉ tách theo trigger mục 4.**
