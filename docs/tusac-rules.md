# 🀄 Luật Tứ Sắc — Đặc tả hoàn chỉnh

> **Trạng thái:** Luật đã chốt (2026-07-16). **T1a đã xong** — `packages/game-tusac`:
> bộ bài 112 lá + `detectMeld` + `isWinningHand` + 16 unit test.
> Tài liệu này là **nguồn luật chính thức** cho các bước sau (T1b: luật "ăn"; T2: state machine).
> (Bản Q&A review ban đầu đã được gộp thành luật chốt bên dưới.)

---

## 1. Tổng quan

Tứ Sắc (四色 — "bốn màu") là game bài dân gian, cơ chế gần **Mahjong / Phỏm**:
rút bài — đánh bài — ghép nhóm. Ai gom hết bài thành các **nhóm hợp lệ** (không còn
lá lẻ/"rác") thì **tới** (ù) và thắng. Không dùng bộ 52 lá → engine riêng
(`game-tusac`), không tái dùng `game-tienlen`.

- Số người: **2–4** (thường 4).
- Vòng chơi **ngược chiều kim đồng hồ**.

---

## 2. Bộ bài — 112 lá

| Thành phần | Chi tiết |
|---|---|
| **7 quân** (theo cờ tướng) | Tướng, Sỹ, Tượng, Xe, Pháo, Mã (Ngựa), Tốt (Chốt) |
| **4 màu (sắc)** | Đỏ, Vàng, Xanh, Trắng |
| **Số bản mỗi (quân, màu)** | 4 |

→ 7 × 4 × 4 = **112 lá**. Một lá xác định bởi **(quân, màu)**; có 4 lá giống hệt nhau.

**Hiển thị lá bài (UI):** nền theo sắc, chữ **đen in đậm**. Hai bộ ký tự Hán theo phe
(giống bộ bài giấy): **Đỏ & Vàng** dùng 帥 仕 相 俥 砲 傌 兵; **Xanh & Trắng** dùng
將 士 象 車 炮 馬 卒 (thứ tự Tướng–Sỹ–Tượng–Xe–Pháo–Mã–Tốt).

---

## 3. Số người, chia bài & nhà cái

- 2–4 người. **Nhà cái** nhận **21 lá** (dư 1 để đánh trước), **mỗi người còn lại 20 lá**
  (áp dụng cho cả bàn 2, 3 hay 4 người). *(Ngoài đời chia 5 lá một lượt — nghi thức,
  không ảnh hưởng engine.)*
- Phần bài còn lại làm **nọc** (còn gọi **tỳ**, draw pile).

**Chọn nhà cái (CHỐT):**
- Ván đầu tiên: **ai vào phòng trước** là nhà cái.
- Các ván sau: **ai tới ván trước** cầm cái.
- Nhà cái rời phòng: **người bên tay phải** (kế tiếp theo lượt) cầm cái.

### 3.1. Khái niệm cơ bản

| Thuật ngữ | Nghĩa |
|---|---|
| **Chẵn** | Nhóm 2–4 lá giống nhau cùng màu (đôi/khạp/quằn); Tốt 3–4 lá **khác màu**; Tướng 1–4 lá |
| **Lẻ** | Bộ ba **liền**: Tướng–Sỹ–Tượng hoặc Xe–Pháo–Mã cùng màu |
| **Rác (cu ki)** | Lá thừa không xếp được vào chẵn/lẻ |
| **Xên** | Bài đã hết rác (tròn cấu trúc), đang chờ tới |
| **Chờ tới** | Hết rác hoặc còn 1 rác/1 phôi — chỉ cần 1 lá phù hợp là tới |
| **Bụng** | Tay kiểu Xe-Xe-Pháo-Mã (đôi chồng lên liền) — không được xé đôi ra ăn nếu làm thừa rác (nguyên tắc ít-rác-nhất §5.1 xử tự động) |
| **Tề bài** | Chủ động đánh bớt 1 lá của bụng để giữ bộ liền |
| **Đứt đầu** | Thiếu 1 quân của bộ liền (vd có Sỹ-Tượng thiếu Tướng = "đứt đầu tướng") |
| **Nhập xác** | Đang đứt đầu tướng mà lật/ăn được Tướng → thành liền |
| **Đền bài** | Ngoài đời: ăn sai/tới lộn phải đền — **bản digital không cần**: engine chặn mọi nước sai (anti-rác, validate tới) |

---

## 4. Nhóm hợp lệ để "tới" (dùng cho `isWinningHand`)

Tay bài **tròn** khi chia hết thành các nhóm sau, **mỗi lá dùng đúng 1 lần, không lá lẻ**:

1. **Đôi / Khạp / Quằn** — 2 / 3 / 4 lá **cùng quân, cùng màu** (áp dụng mọi quân, kể cả Tướng).
2. **Tướng lẻ** — 1 con Tướng đứng riêng vẫn hợp lệ (**chỉ Tướng** mới được đứng lẻ).
3. **Liền Xe–Pháo–Mã** — Xe + Pháo + Mã **cùng một màu**.
4. **Liền Tướng–Sỹ–Tượng** — Tướng + Sỹ + Tượng **cùng một màu**.
5. **Liền Tốt** — **3 hoặc 4 Tốt khác màu** (3 màu khác nhau, hoặc đủ cả 4 màu) là **một** nhóm.

→ Sỹ, Tượng, Xe, Pháo, Mã, Tốt **đứng lẻ = rác**. Không ràng buộc cấu trúc kiểu Mahjong
(không cần "đôi đầu"); chỉ cần **không còn lá lẻ**.

*(Đã cài đặt trong `isWinningHand` — backtracking phân hoạch, docs code: `packages/game-tusac/src/melds.ts`.)*

---

## 5. Luật "ăn" / tương tác khi chơi — nguồn cho state machine (T1b/T2)

Đây là phần đặc trưng & phức tạp nhất của Tứ Sắc: khi có lá được đánh ra (hoặc tự lật
từ nọc), người chơi được **ăn** (lấy lá đó ghép nhóm rồi phơi ra bàn) theo các luật dưới.
"Rác" = lá/lẻ chưa thuộc nhóm nào. "Khui" = hạ nhóm bắt buộc xuống bàn. "Liền" = bộ đã đủ.

### 5.1. Nguyên tắc chung

- **Nguyên tắc "ít rác nhất" (CHỐT):** một nước ăn **tùy chọn** chỉ hợp lệ nếu để lại
  **ít rác nhất**. Nếu tồn tại nước ăn khác để lại **ít lá lẻ hơn**, thì nước làm thừa
  rác bị loại. *(Nguyên tắc tổng quát này tái tạo đúng mọi ca cụ thể ở §5.2–5.4 — vd
  "2 Xe + Pháo + Mã → không được đôi Xe", và cả luật **Bụng** §3.1. Đã cài trong
  `legalClaims` + `looseCount`.)*
- **Anti-rác TUYỆT ĐỐI (CHỐT — bổ sung khi test):** nước ăn không được để lại **nhiều
  rác hơn hiện trạng tay bài** — ăn không được TẠO rác mới. Vd Tướng + đôi Sỹ (0 rác),
  lật Tượng: **không được xé Tướng+Sỹ ăn liền** (sẽ để 1 Sỹ thành rác). Ngược lại
  Tướng + 1 Sỹ rác thì ăn liền hợp lệ (giảm rác).
- **Khạp không được xé — mọi trường hợp (CHỐT — bổ sung khi test):** ô nào đang có
  **≥3 lá giống nhau** thì mọi nước lấy lá từ ô đó đều bị cấm (kể cả ăn thành đôi hay
  ghép liền), **trừ chính nước khui** (giật lá thứ 4).
- **Liền không được xé (CHỐT — bổ sung khi test):** đã có bộ liền hoàn chỉnh
  (Tướng-Sỹ-Tượng / Xe-Pháo-Mã cùng màu / 3 Tốt khác màu) thì **không được xé** ra
  ăn bất kỳ lá nào — kể cả khi lá để lại là Tướng lẻ (vd liền T-S-Tg, lật Tướng:
  cấm dùng Sỹ+Tượng ăn). **Riêng liền 3 Tốt** được ăn **đúng con Tốt màu còn lại**
  để nâng trọn bộ thành liền 4 Tốt. Ngoại lệ bụng (§3.1): liền chưa "chốt" khi có
  lá đôi chồng lấp (vd Xe-Xe-Pháo-Mã) thì vẫn ăn theo nguyên tắc ít-rác-nhất.
  - Ví dụ đã chốt: **2 Tướng + Sỹ + Tượng** sắp đúng là {Tướng lẻ} + {liền T-S-Tg}
    — **hết rác** → lật Sỹ/Tượng **không được ăn** (xé kiểu gì cũng phá liền/tạo rác).
- **Ăn đúng cửa (CHỐT — cập nhật từ tusac-bosung.md):** lá đánh ra thuộc **cửa** của
  người kế bên phải người đánh. **Ăn bằng rác** (1 rác + lá ăn thành đôi) và **ăn vào
  lẻ** (liền) **chỉ dành cho người đúng cửa**. Người khác cửa chỉ được **giành** bằng
  đôi (→khạp), khui (→quằn), hoặc tới.
- **Ưu tiên chẵn trước, lẻ sau (CHỐT):** khi nhiều người muốn cùng một lá:
  `tới > khui (quằn) > đôi (khạp) > ăn rác thành đôi (cửa) > ăn lẻ/liền (cửa)`.
  Trong nhóm chẵn, ai nhiều lá chẵn hơn ưu tiên hơn (đôi > 1 rác). Đồng hạng → gần
  người đánh hơn (theo chiều lượt) thắng.
- **Lá lật từ nọc là công khai, KHÔNG vào tay (CHỐT — cập nhật):** người tới lượt
  **lật** 1 lá từ nọc, lá lật hiển thị công khai — "chỉ có thể ăn hoặc bỏ":
  - **Người lật là cửa** của lá đó (được ăn rác/lẻ/đôi/khui/tới như §5.1).
  - Người khác được **giành** (đôi/khui/tới) theo ưu tiên trên.
  - **Không ai ăn** → lá bỏ ra bàn (đống rác công khai), **người bên phải người lật
    lật tiếp** — không ai phải đánh rác trong chuỗi lật.
  - Ai **ăn** lá (đánh ra hoặc lật) → phơi nhóm xuống chiếu, **chiếm lượt** và phải
    **đánh trả 1 lá rác** vào cửa bên phải mình.
- **Quằn hạ ngay (CHỐT):** có **4 lá giống nhau** (khui khi ăn HOẶC quằn có sẵn khi chia)
  thì **hạ xuống chiếu ngay lập tức** thành quằn phơi; tới khi có quằn phơi = **tới quan**.
- **Khui bắt buộc:** khi đang có **khạp** (3 lá giống nhau) mà lá thứ 4 xuất hiện
  (bị đánh hoặc tự lật), **bắt buộc phải khui** (hạ 4 lá xuống bàn) — trừ khi việc **Tới**
  được ưu tiên hơn (xem §7). Khạp **không được xé lẻ** để ăn như đôi.
- **Quằn (4 lá cùng quân+màu):** hạ xuống bàn **ngay** (cả khui lúc đánh lẫn quằn có sẵn).
  Nếu người có quằn **tới** → **tới quan** (×2 tiền, xem §10).
- **Ăn bằng rác** (ghép các lá lẻ để ăn, vd Pháo+Mã ăn Xe): **chỉ được khi tới lượt mình**.
- **Giật vòng (ăn ngoài lượt):** chỉ được khi hoàn thành bằng **đôi, khạp, hoặc tới**.
- **Lật Tướng (CHỐT):** khi lá lật là Tướng — người khác được **Khui** (giật bằng 3 Tướng)
  hoặc **Tới**; nếu **không ai khui/tới**, người lật **kéo Tướng về phơi trước mặt mình**
  (Tướng lẻ hợp lệ) và **bắt buộc đánh ra 1 lá rác** (giữ lượt). Khác lá thường
  (không ai ăn → bỏ vào đống rác, người kế lật). Tướng bị **đánh ra** từ tay (không phải
  lật) mà không ai ăn thì vẫn vào đống rác như thường.

### 5.2. Bộ Xe – Pháo – Mã (chỉ tính **cùng màu**)

- **1 lẻ** (1 Xe/Pháo/Mã): là **rác** — có thể đánh đi, hoặc ăn lá cùng loại+màu do người
  khác đánh / tự lật (chỉ khi tới lượt, vì là ăn bằng rác).
- **Đôi** (2 lá): không phải rác. Được **giật** (ăn ngoài lượt) lá cùng loại+màu ở bất kỳ đâu,
  hoặc ghép với 1 rác để ăn một lá khác — trừ khi có người **tới** con đó (tới ưu tiên).
- **Khạp** (3 lá): không phải rác. Được giật lá thứ 4 ở bất kỳ đâu, **không được** ghép với
  rác nào khác để ăn — trừ khi có người **tới** con đó.
- **Quằn** (4 lá): hạ 4 lá xuống bàn; tới → **tới quan**.
- **Liền** (Xe+Pháo+Mã cùng màu): không phải rác, **không được đánh cũng không được ăn**.
- **2 lẻ** (vd trên tay có Pháo + Mã):
  - Bàn trên đánh **Xe** → dùng Pháo + Mã để ăn (tạo liền).
  - Bàn trên đánh **Pháo/Mã** → dùng Pháo/Mã tương ứng để ăn (đôi).
- **1 đôi + 1 rác** (2 Xe + 1 Pháo): được đôi Xe ở bất kỳ đâu, hoặc ăn Pháo/Mã. (Tương tự
  cho các nhóm khác.)
- **1 đôi + 2 rác** (2 Xe + 1 Pháo + 1 Mã): **không được đôi Xe**; chỉ được ăn — nếu bàn
  trên đánh Xe: (a) lấy 1 Xe để ăn, hoặc (b) dùng Pháo + Mã để ăn.
- **2 đôi + 1 rác** (2 Xe + 2 Mã + 1 Pháo):
  - Đối thủ đánh Xe/Mã → có thể đôi.
  - Bàn trên đánh Xe hoặc Mã → dùng Xe/Mã, hoặc tổ hợp với Pháo để ăn.
  - Bàn trên đánh Pháo → dùng Pháo để ăn, hoặc dùng Xe + Mã để ăn Pháo.
- **3 đôi:** chỉ có thể đôi.
- **Khạp + 1 rác** (3 Xe + 1 Pháo): Pháo là rác độc lập.
  - Có Mã: **không được ăn**.
  - Có Xe: **khui** (đặt 3 Xe xuống bàn); nếu tới → tới quan.
  - Có Pháo: ăn Pháo.
- **Khạp + 2 rác** (3 Xe + 1 Pháo + 1 Mã):
  - Có Xe: **bắt buộc khui** (ăn bằng 3 Xe). Nếu bạn chỉ còn 2 rác (Pháo + Mã) thì có thể
    **Tới** (Tới ưu tiên hơn khui).
  - Có Mã: chỉ dùng Mã để ăn.
  - Có Pháo: chỉ dùng Pháo để ăn.
  - Lưu ý: khạp **không được xé lẻ** để ăn như đôi.

### 5.3. Bộ Tướng – Sỹ – Tượng (chỉ tính **cùng màu**)

- **Tướng:** không xem là rác; **không thể ăn hay đôi kiểu riêng lẻ**; nhưng có thể ghép
  với Sỹ + Tượng tạo **liền**.
- **1–2 Tướng + 1 Sỹ/Tượng:** nếu có Sỹ hoặc Tượng (bàn trên đánh / tự lật) → ghép Tướng
  với lá đang có để ăn con còn lại. *(Vd: 1–2 Tướng + Sỹ → kết hợp Tướng + Sỹ để ăn Tượng.)*
- **1–2 Tướng + 1 đôi (Sỹ hoặc Tượng):** Tướng không cần làm gì, không ăn được.
  - Đôi Sỹ: có Sỹ → có thể đôi. Đôi Tượng: có Tượng → có thể đôi.
- **1–2 Tướng + 1 Sỹ + 1 Tượng (liền):** không thể đánh cũng không thể ăn.
- **1–2 Tướng + 2 Sỹ + 1 Tượng (liền + dư Sỹ):** khi có Sỹ, ăn theo nhiều cách:
  - dùng **đôi Sỹ** (giật vòng);
  - dùng 1 Sỹ để ăn (bàn trên đánh hoặc tự lật);
  - dùng Tướng + Tượng để ăn (bàn trên đánh hoặc tự lật).
- **3 Tướng:** là 1 **khạp**. Khi người khác lật Tướng → có thể khui để chiếm lượt và
  đánh ra 1 rác.
- **3 Tướng + Sỹ:**
  - Ai đó lật Tướng → giật bằng 3 Tướng + chiếm lượt đánh.
  - Bàn trên đánh Sỹ / tự lật Sỹ → dùng Sỹ để ăn.
  - Nếu là Tượng → không ăn được.
- **1 Sỹ + 1 Tượng:**
  - Tự lật Tướng → dùng Sỹ + Tượng để ăn (gọi là **nhập xác**).
  - Lật / được đánh Sỹ/Tượng → dùng Sỹ/Tượng tương ứng để ăn.
- **3 Tướng + 1 Sỹ + 1 Tượng:**
  - Tướng được lật: nếu hết rác → dùng Sỹ + Tượng để **tới Tướng**; ngược lại **bắt buộc khui**.
  - Lật/đánh Sỹ/Tượng → bắt buộc dùng Sỹ/Tượng để ăn.
- **3 Tướng + 2 Sỹ + 1 Tượng** (hoặc 1 Sỹ + 2 Tượng): Tướng, Sỹ, Tượng độc lập, không ghép
  được gì.
- **1–2 Tướng + 1 Sỹ + 3 Tượng** (hoặc 3 Sỹ + 1 Tượng):
  - Đánh Tượng: bắt buộc khui; nếu bài hết rác (chỉ còn Sỹ) → được chọn **Tới** hoặc **Khui**.
  - Đánh Sỹ: chỉ dùng Sỹ để ăn.
- **1–2 Tướng + đôi Sỹ hoặc đôi Tượng:** chỉ có thể đôi, **không xé đôi** để ghép Tướng đi ăn.

### 5.4. Bộ Tốt (chỉ tính **khác màu** cho liền)

- **1 Tốt lẻ:** có thể ăn 1 Tốt cùng màu.
- **2 Tốt cùng màu:** có thể đôi 1 Tốt cùng màu khác (được đánh ra).
- **3 Tốt cùng màu:** có thể **khui** 1 Tốt cùng màu khác.
- **4 Tốt cùng màu:** hạ 4 Tốt xuống bàn (quằn → tới quan nếu tới).
- **2 Tốt khác màu** (2 rác, vd Xanh + Vàng):
  - Có Tốt Xanh/Vàng → dùng 1 con cùng màu để ăn.
  - Có Tốt Trắng/Đỏ → dùng cả 2 con để ăn (tạo liền 3 màu).
- **3 Tốt khác màu (liền, không rác):** chỉ có thể ăn 1 Tốt **khác màu còn lại** (thành liền 4).
- **4 Tốt khác màu (liền, không rác):** có thể dùng 1 con bất kỳ để ăn Tốt cùng màu (tách ra).
- **1 đôi + 1 rác** (2 Xanh + 1 Đỏ):
  - Có Tốt Xanh → có thể đôi.
  - Có Tốt Đỏ → dùng Tốt Đỏ để ăn.
  - Có Tốt Trắng/Vàng → dùng Tốt Xanh + Đỏ để ăn.
- **1 đôi + 2 rác** (2 Xanh + 1 Đỏ + 1 Trắng):
  - Có Tốt Xanh → **không được đôi**; chỉ dùng 1 Tốt Xanh để ăn, hoặc dùng Tốt Đỏ + Trắng để ăn.
  - Có Tốt Đỏ/Trắng → dùng Tốt Đỏ/Trắng tương ứng để ăn.
  - Có Tốt Vàng → dùng Tốt Đỏ + Trắng để ăn.
- **1 đôi + liền** (2 Xanh + 1 Đỏ + 1 Trắng + 1 Vàng — không rác):
  - Có Tốt Xanh → đôi được, hoặc dùng 1 Tốt Xanh để ăn, hoặc dùng 3 Tốt khác màu còn lại để
    ăn (**không** được dùng 2 Tốt để ăn).
  - Có Tốt Đỏ/Vàng/Trắng → dùng Tốt Xanh + 1 Tốt khác màu để ăn.
  - Nguyên tắc: sau khi ăn **không được để lại rác**.
- **2 đôi + 1 lẻ** (2 Xanh + 2 Đỏ + 1 Vàng — có 1 rác):
  - Có Tốt Xanh → đôi được, hoặc dùng 1 Tốt Xanh để ăn, hoặc dùng 1 Đỏ + 1 Vàng để ăn.
  - Có Tốt Đỏ → tương tự Tốt Xanh.
  - Có Tốt Vàng → dùng Tốt Vàng để ăn, hoặc dùng Tốt Xanh + Đỏ để ăn.
  - Có Tốt Trắng → dùng Tốt Xanh + Đỏ để ăn.
- **2 đôi + 2 lẻ** (2 Xanh + 2 Đỏ + 1 Vàng + 1 Trắng — không rác: xếp thành 2 liền
  {Xanh+Đỏ+Vàng} và {Xanh+Đỏ+Trắng}):
  - Có Tốt Xanh/Đỏ → **không được đôi** (tạo thêm rác); chỉ ăn bằng 1 màu tương ứng, hoặc
    dùng Vàng + Trắng để ăn.
  - Có Tốt Vàng/Trắng → chỉ dùng tổ hợp Xanh + Đỏ để ăn.
- **3 đôi + 1 lẻ** và **4 đôi** (Tốt): **được ăn hoặc đôi tuỳ ý** (free choice).
- **Khi có khạp + tổ hợp khác:** ưu tiên **giữ khạp** (khui khạp) thay vì xé để ăn tổ hợp.

---

## 6. Lượt chơi

Vòng **ngược chiều kim đồng hồ**. Mỗi lượt:

1. **Lấy bài:** rút 1 lá từ **nọc**, HOẶC **ăn** lá vừa bị đánh/lật nếu hợp lệ (§5), phơi
   nhóm ăn ra bàn.
2. **Đánh ra:** chọn 1 lá đánh xuống (trừ khi vừa tới). Khi **lật Tướng** thì bắt buộc đánh ra rác.
3. Đến người kế tiếp.

---

## 7. Ưu tiên khi nhiều người cùng muốn 1 lá

Thứ tự ưu tiên (chẵn trước, lẻ sau):
**Tới > Khui (quằn, bắt buộc) > Đôi (khạp, bắt buộc*) > Ăn rác thành đôi (chỉ cửa) > Ăn lẻ/liền (chỉ cửa)**.

- Nhiều người cùng **Tới**: ưu tiên theo **thứ tự lượt tính từ người đánh/lật** (ngược
  chiều kim đồng hồ). Vd A lật 1 con mà cả C và D cùng tới → **C tới** (đứng trước D).
- **Khạp:** có thể chen lượt, **bắt buộc khui** trong mọi trường hợp (trừ khi được tới).
- **Đôi:** bắt buộc đôi, **trừ khi đang chờ tới** thì được bỏ đôi (xem §8).
- Ăn bằng **rác** / **ăn lẻ**: chỉ người **đúng cửa** (kế bên phải người đánh; với lá
  lật thì chính người lật là cửa) — người khác cửa không được dù có bộ chờ sẵn.

---

## 8. Cơ chế "báo" (bỏ đôi khi chờ tới)

Khi đang **chờ tới** — bài chỉ còn **1 rác** hoặc **1 phôi** (bộ 2 lá chờ 1 lá để thành
liền: vd Xe+Pháo chờ Mã, Tướng+Sỹ chờ Tượng, 2 Tốt khác màu chờ lá thứ 3) — mà có lá
**đôi** được đánh ra:

- Người chơi **được chọn**: **đôi** (bình thường bắt buộc), hoặc **bỏ đôi** để giữ thế chờ tới.
- Nếu **bỏ đôi** → hiển thị chữ **"bỏ đôi"** + **âm thanh** để mọi người biết đang chờ bài.

Ngoài trạng thái chờ tới, gặp lá đôi thì **bắt buộc đôi**.

---

## 9. Điều kiện thắng & kết thúc ván

- **Tới:** tay bài (kể cả lá vừa rút/ăn) **tròn** theo §4. Người tới thắng.
- **Hết nọc** mà chưa ai tới → **xử hoà**.
- **Không có "đền bài"** (không phạt người còn rác khi có người tới).

---

## 10. Tính tiền (MVP — mức cược cố định)

Người tới thu của **mỗi người thua**; nối vào ví "củ" 🍠 + ghi `matches`/`match_players`
như Tiến Lên. Ví dụ mức cược 10 củ:

| Trường hợp | Thu mỗi người thua |
|---|---|
| **Tới trơn** (không có quằn hạ bàn) | mức cược (10 củ) |
| **Tới quan** (có **quằn** đã hạ bàn — 4 lá cùng quân+màu, kể cả quằn Tốt) | ×2 (20 củ) |
| **Tướng vàng** (mỗi lá Tướng vàng trong bài người tới) | + 0.5 × cược **mỗi lá, mỗi người thua** (áp dụng cả tới trơn lẫn quan) |
| **Đậu heo / hốt heo** (chế độ bật/tắt theo phòng) | mỗi ván mỗi người đóng vào "heo" một mức cấu hình; **cộng dồn** tới khi có người **tới quan** thì người đó **hốt hết**, rồi heo reset |

---

## 11. Mô hình engine & thuật toán (`packages/game-tusac`)

Thuần TypeScript, không I/O, có unit test (giống `game-tienlen`).

**Mô hình dữ liệu** (đã cài — `src/tiles.ts`):
```
Piece = 0..6   // Tướng, Sỹ, Tượng, Xe, Pháo, Mã, Tốt
Color = 0..3   // Đỏ, Vàng, Xanh, Trắng
Tile  = { piece, color }        // 4 bản mỗi (quân,màu)
Counts = number[28]             // vector đếm cho backtracking
```

**Đã cài (T1a):** `createDeck` (112), `deal` (cái 21 / còn lại 20), `detectMeld` (phân loại
1 nhóm), **`isWinningHand`** (backtracking phân hoạch — §4).

**Sẽ làm:**
- `legalClaims(hand, tile, context)` — từ luật §5, liệt kê các cách ăn hợp lệ + đánh dấu
  **bắt buộc** (khui/đôi).
- `TuSacMatch` — state machine: rút/đánh/ăn/khui/tới, ưu tiên §7, cơ chế "báo" §8, hết nọc hoà.
- `scoreMatch` — §10 (tới trơn/quan, tướng vàng, đậu heo).

---

## 12. Lộ trình triển khai

| Bước | Nội dung | Trạng thái |
|---|---|---|
| **T1a** | `game-tusac`: deck, `detectMeld`, `isWinningHand` + test | ✅ **Xong** (16 test) |
| **T1b** | `canWin` + `legalClaims` — luật ăn §5 (nguyên tắc ít-rác-nhất) + test | ✅ **Xong** (12 test) |
| **T2** | `TuSacMatch` state machine: rút/đánh/ăn/khui/tới + ưu tiên §7 + "báo" §8 + hết nọc hoà | ✅ **Xong** (6 test) |
| **T3** | `scoreMatch` §10: tới trơn/quan, tướng vàng, đậu heo | ✅ **Xong** (8 test) |
| **T4a** | Server: `TuSacService` + socket `tusac:*` + bot chơi trọn ván | ✅ **Xong** (bot verify) |
| **T4b** | UI web bàn Tứ Sắc (nọc, ăn/giật/khui/phơi nhóm) + sảnh + GamesHub | ✅ **Xong** (playwright verify) |

**Còn lại (hậu T4):** lưu kết quả/ví vào Postgres + Redis persistence cho phòng Tứ Sắc,
đậu heo theo phòng (engine đã hỗ trợ, thiếu config phòng), cơ chế "báo bỏ đôi" hiển thị
cho người khác (hiện chỉ là lựa chọn cá nhân), reconnect về ván đang chơi.
