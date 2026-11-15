# BÁO CÁO RÀ SOÁT KỸ THUẬT POSTGRESQL 17 / PRISMA / DBA — HỆ THỐNG ACM

**Mã tài liệu:** `ACM-DBA-REVIEW-20261107-D8`  
**Vai trò thẩm định:** Chuyên gia kỹ thuật cơ sở dữ liệu PostgreSQL 17 & Kiểm toán Prisma Schema (Senior Database Architect / DBA Technical Reviewer)  
**Nguyên tắc đánh giá:** Độc lập chuyên môn, không phụ thuộc vào các tuyên bố suy diễn của AI trước đó, không cấp quyền (approval), không ký duyệt thay con người.  
**Thời điểm rà soát (Review Timestamp):** 07/11/2026 20:35:00 (GMT+7) / `2026-11-07T13:35:00Z`  
**Kho mã nguồn (Repository):** `https://github.com/acmhtql-sys/ACM_QLLK`  
**Nhánh tham chiếu gốc (Pinned Starting Branch):** `codex/p3h-toolchain-security-probe-20261107` (Draft PR #41, xếp chồng trên PR #40 và PR #39)  
**Commit SHA tham chiếu gốc:** `86256929fd250954eb840c26ae61a53e7263e900`  
**Nhánh Staging hiệu lực trên Render (Effective Staging Branch):** `codex/cloud-staging-p2e-readonly-deploy-20261107`  
**Commit SHA Staging trên Render:** `9d0e797116c72e65dd86e0fe7c5652d815851864`  
**Phán quyết kỹ thuật tổng thể:** **`RELEASE_NO_GO`** (Tuyệt đối không cấp phép triển khai hoặc mở ghi dữ liệu)

---

## MỤC LỤC
1. [Thông tin kiểm toán & Bằng chứng tài liệu nguồn](#1-thông-tin-kiểm-toán--bằng-chứng-tài-liệu-nguồn)
2. [Bảng kiểm kê mô hình dữ liệu Prisma, Ràng buộc & Lịch sử Migration](#2-bảng-kiểm-kê-mô-hình-dữ-liệu-prisma-ràng-buộc--lịch-sử-migration)
3. [Đánh giá đề xuất định dạng mã chứng từ & Chuẩn hóa](#3-đánh-giá-đề-xuất-định-dạng-mã-chứng-từ--chuẩn-hóa)
4. [Kiểm toán nghiệp vụ Mượn - Trả, Tồn kho, Cách ly & Idempotency](#4-kiểm-toán-nghiệp-vụ-mượn---trả-tồn-kho-cách-ly--idempotency)
5. [Đánh giá kế hoạch DDL Stage4C Forward/Rollback & Tương thích Prisma](#5-đánh-giá-kế-hoạch-ddl-stage4c-forwardrollback--tương-thích-prisma)
6. [Bảng tổng hợp lỗi kỹ thuật & Khiếm khuyết (Findings Matrix)](#6-bảng-tổng-hợp-lỗi-kỹ-thuật--khiếm-khuyết-findings-matrix)
7. [Trạng thái kiểm chứng các Cổng Cố định (#11, #12, #13, #14)](#7-trạng-thái-kiểm-chứng-các-cổng-cố-định-11-12-13-14)
8. [Bộ câu hỏi chuẩn xác dành cho Chủ nghiệp vụ, DBA & Operator](#8-bộ-câu-hỏi-chuẩn-xác-dành-cho-chủ-nghiệp-vụ-dba--operator)
9. [Đề xuất ma trận kiểm thử cô lập an toàn trên PG17 (Port 55433)](#9-đề-xuất-ma-trận-kiểm-thử-cô-lập-an-toàn-trên-pg17-port-55433)
10. [Đánh giá phương án Sao lưu / Phục hồi & Giới hạn Hạ tầng Miễn phí](#10-đánh-giá-phương-án-sao-lưu--phục-hồi--giới-hạn-hạ-tầng-miễn-phí)
11. [Kết luận kỹ thuật & Khuyến nghị dứt khoát](#11-kết-luận-kỹ-thuật--khuyến-nghị-dứt-khoát)

---

## 1. THÔNG TIN KIỂM TOÁN & BẰNG CHỨNG TÀI LIỆU NGUỒN

### 1.1 Hiện trạng Commit tại thời điểm thẩm định
- Nhánh kiểm tra chính: `origin/codex/p3h-toolchain-security-probe-20261107` tại commit `86256929fd250954eb840c26ae61a53e7263e900` (HEAD).
- Nhánh đối chiếu Staging Render: `origin/codex/cloud-staging-p2e-readonly-deploy-20261107` tại commit `9d0e797116c72e65dd86e0fe7c5652d815851864`.
- Nhánh `main`: Đang dừng ở commit `375947d5bfa4a6c4b2ebff7dcddb9d75b068be9c`.
- Toàn bộ quá trình kiểm toán được thực hiện dưới cơ chế **CHỈ ĐỌC (READ-ONLY)**. Tuyệt đối không thực thi DDL, DML, `prisma db push`, `prisma migrate`, kết nối database thật hoặc thay đổi cấu hình đám mây.

### 1.2 Bằng chứng tài liệu đã kiểm tra thực tế (Inspected Artifacts)
1. Các văn bản chỉ đạo và cổng phát hành:
   - `docs/deployment/ANTIGRAVITY_REVIEW_01_POSTGRES_PRISMA_D8.md` (Commit `7ab8b0d`)
   - `docs/deployment/ANTIGRAVITY_REVIEW_02_FULLSTACK_SECURITY_D8.md` (Commit `8625692`)
   - `docs/deployment/ACM_D8_RELEASE_READINESS_GO_NO_GO_20261107.md` (Commit `68056c0`)
   - `docs/deployment/ACM_D8_INDEPENDENT_REVIEW_PACKET_20261107.md` (Commit `e9fc737`)
   - `.github/workflows/d8-release-gates-readonly.yml` (Commit `9467815`)
2. Mã nguồn tầng dữ liệu và nghiệp vụ:
   - `apps/api/prisma/schema.prisma`
   - `apps/api/prisma/migrations/20261010143500_init_acm/migration.sql`
   - `apps/api/prisma/migrations/20261011160000_add_idempotency_and_transfer_location/migration.sql`
   - `apps/api/prisma/migrations/20261016200000_add_data_integrity_indexes_and_kits/migration.sql`
   - `apps/api/prisma/seed.ts`
   - `apps/api/src/modules/borrow/borrow.router.ts`
   - `apps/api/src/modules/borrow/borrow.service.ts`
3. Tài liệu thiết kế Stage4C trên các nhánh rà soát kỹ thuật (`origin/review/*`):
   - `docs/stage4c-consolidated-forward-ddl-candidate-20261030.md`
   - `docs/stage4c-dba-target-schema-review-20261030.md`
   - `docs/stage4c-dba-design-decision-record-20261029.md`
   - `docs/stage4c-dba-target-contract.review.json`
   - `docs/stage4c-pg17-dba-signoff-handoff-20261030.md`
   - `apps/api/src/modules/borrow/borrow.return-writer.contract.ts` (Commit `9db7815`)
   - `apps/api/src/modules/borrow/borrow.return-status.ts`
4. Dữ liệu thời gian thực từ GitHub API:
   - Các Issue cổng bắt buộc: [#11](https://github.com/acmhtql-sys/ACM_QLLK/issues/11), [#12](https://github.com/acmhtql-sys/ACM_QLLK/issues/12), [#13](https://github.com/acmhtql-sys/ACM_QLLK/issues/13), [#14](https://github.com/acmhtql-sys/ACM_QLLK/issues/14), [#15](https://github.com/acmhtql-sys/ACM_QLLK/issues/15).
   - Tình trạng PR: PR #39, PR #40, PR #41 đều là Draft, chưa có phê duyệt chính thức nào được xác nhận.

### 1.3 Bằng chứng nguồn bị thiếu hụt (MISSING EVIDENCE REPORT)
Theo đúng quy tắc kiểm toán: *Nếu các tệp nén ghim mã băm SHA-256 hoặc các artifact gốc trên máy Windows UAT không có trong kho mã nguồn, phải báo cáo "MISSING EVIDENCE", không được tự ý bịa đặt hoặc thay thế âm thầm.*

| Tên Artifact / Bằng chứng được dẫn chiếu | Giá trị băm SHA-256 được ghim | Trạng thái trong Repo Git | Kết luận kiểm toán |
| :--- | :--- | :---: | :--- |
| `ACM_D8_DB2B_Evidence_Policy_And_Approval_Gates_REVIEW_ONLY_NO_GO_20261029.zip` | `62dbf5c704e850b7d3147c9a34744a1f47d121b24365747ffca560f4e818cb83` | **KHÔNG TỒN TẠI** | **MISSING EVIDENCE**: Gói ZIP nghiệp vụ DB2B chưa từng được commit vào repository. |
| `ACM_D8_PG1C_Independent_Review_Packet_NO_GO_20261028.zip` | `3197944c40f2ddb949e778e54752d7781c5a178dc9d14317b9311415c58d64a4` | **KHÔNG TỒN TẠI** | **MISSING EVIDENCE**: Gói ZIP thẩm định tạo cụm PG1C chưa từng được commit. |
| Kịch bản khởi tạo PG1C PowerShell | `05d94d40434e8048368919f34aa36d7f6837216b065007f8a58eb44eec7fe189` | **KHÔNG TỒN TẠI** | **MISSING EVIDENCE**: Script tạo instance 55433 không có trong mã nguồn. |
| Kịch bản nhận diện PG1D FIX1 | `7b99b903ac14c1d8713181788399990bbff75f5b791813af907786de129a94a9` | **KHÔNG TỒN TẠI** | **MISSING EVIDENCE**: Script kiểm tra cluster PG1D không có trong mã nguồn. |
| Windows UAT WIP Commit (`fix/phase11d-partial-return-ui`) | `0847a73088b98d8b00fb6ac06f02b2f56d288b78` | **KHÔNG TỒN TẠI TRÊN REMOTE** | **MISSING EVIDENCE**: Commit UAT chứa 9 tệp WIP chỉ nằm cục bộ trên máy trạm của operator, chưa đẩy lên remote GitHub. |
| Windows DEV Checkpoint Commit | `0be458b1dd36ee327670b684c571d03934e5397a` | **KHÔNG TỒN TẠI TRÊN REMOTE** | **MISSING EVIDENCE**: Checkpoint cục bộ của operator, không thể kiểm chứng từ xa. |
| Kịch bản khôi phục Rollback DDL Stage4C | Không có mã băm | **HOÀN TOÀN THIẾU** | **MISSING EVIDENCE**: Không có tệp SQL rollback nào được soạn thảo hoặc lưu trữ. |

---

## 2. BẢNG KIỂM KÊ MÔ HÌNH DỮ LIỆU PRISMA, RÀNG BUỘC & LỊCH SỬ MIGRATION

### 2.1 Kiểm kê Schema đã Commit (`apps/api/prisma/schema.prisma`)
Mã nguồn nhánh `codex/p3h-toolchain-security-probe-20261107` hiện có đúng **19 Model** và **10 Enum**:

1. **10 Kiểu Liệt kê (PostgreSQL ENUMs):**
   - `UserRole` (dòng 19): `ADMIN`, `LAB_MANAGER`, `TECHNICIAN`, `STUDENT`.
   - `ItemType` (dòng 26): `CONSUMABLE`, `TRACKED_ASSET`, `EQUIPMENT`.
   - `StockTransactionType` (dòng 32): `IMPORT`, `EXPORT`, `ADJUSTMENT`, `TRANSFER`.
   - `TransactionStatus` (dòng 39): `COMPLETED`, `CANCELLED`.
   - `BorrowStatus` (dòng 44): `PENDING`, `APPROVED`, `REJECTED`, `HANDED_OVER`, `RETURNED`, `PARTIALLY_RETURNED`, `CANCELLED`.
   - `ReservationStatus` (dòng 54): `ACTIVE`, `FULFILLED`, `RELEASED`.
   - `AssetStatus` (dòng 60): `AVAILABLE`, `RESERVED`, `BORROWED`, `QUARANTINED`, `LOST`, `RETIRED`.
   - `AssetCondition` (dòng 69): `GOOD`, `DAMAGED`, `LOST`.
   - `LocationType` (dòng 75): `WAREHOUSE`, `RACK`, `SHELF`, `BIN`.
   - `KitStatus` (dòng 82): `AVAILABLE`, `ALLOCATED`, `MAINTENANCE`, `RETIRED`.

2. **19 Mô hình thực thể (Models) & Khóa phức hợp:**
   - `Role` (`roles`, dòng 74): PK `id` (UUID), UNIQUE `name`.
   - `User` (`users`, dòng 86): PK `id`, UNIQUE `email`, FK `roleId` $\to$ `roles(id)`.
   - `Category` (`categories`, dòng 120): PK `id`, UNIQUE `code`, FK tự quy chiếu `parentId`.
   - `Item` (`items`, dòng 136): PK `id`, UNIQUE `code`, FK `categoryId` $\to$ `categories(id)`.
   - `Location` (`locations`, dòng 166): PK `id`, UNIQUE `code`, FK tự quy chiếu `parentId`.
   - `Asset` (`assets`, dòng 182): PK `id`, UNIQUE `serialNumber`, UNIQUE `barcode`, FK `itemId`, FK `locationId`.
   - `StockBalance` (`stock_balances`, dòng 204): PK `id`, **`@@unique([itemId, locationId])`** (Ràng buộc duy nhất phức hợp 1 dòng tồn kho cho mỗi linh kiện tại 1 vị trí), FK `itemId`, FK `locationId`.
   - `StockMovement` (`stock_movements`, dòng 227): PK `id`, FK `itemId`, FK `locationId`, FK `createdById`.
   - `StockReservation` (`stock_reservations`, dòng 253): PK `id`, FK `borrowRequestId`, FK `itemId`, FK `locationId`.
   - `StockTransaction` (`stock_transactions`, dòng 272): PK `id`, UNIQUE `transactionNumber`, FK `createdById`, FK `sourceLocationId`, FK `destinationLocationId`.
   - `StockTransactionDetail` (`stock_transaction_details`, dòng 293): PK `id`, FK `stockTransactionId`, FK `itemId`, FK `assetId`.
   - `BorrowRequest` (`borrow_requests`, dòng 310): PK `id`, UNIQUE `requestNumber`, FK `borrowerId`, FK `approverId`.
   - `BorrowDetail` (`borrow_details`, dòng 343): PK `id`, FK `borrowRequestId` (ON DELETE CASCADE), FK `itemId`, FK `assetId`.
   - `ReturnTransaction` (`return_transactions`, dòng 362): PK `id`, UNIQUE `returnNumber`, FK `borrowRequestId`, FK `receiverId`.
   - `ReturnDetail` (`return_details`, dòng 380): PK `id`, FK `returnTransactionId` (ON DELETE CASCADE), FK `itemId`, FK `assetId`.
   - `AuditLog` (`audit_logs`, dòng 399): PK `id`, FK `userId` (ON DELETE SET NULL).
   - `IdempotencyRecord` (`idempotency_records`, dòng 417): PK `id`, UNIQUE `key`, UNIQUE `transactionId`, FK `userId`, FK `transactionId`.
   - `Kit` (`kits`, dòng 435): PK `id`, UNIQUE `code`, FK `locationId`, FK `createdById`.
   - `KitItem` (`kit_items`, dòng 454): PK `id`, **`@@unique([kitId, itemId])`**, FK `kitId` (ON DELETE CASCADE), FK `itemId` (ON DELETE RESTRICT).

3. **Lịch sử Migration vật lý (`apps/api/prisma/migrations/`):**
   - Migration 1 (`20261010143500_init_acm`): Khởi tạo 17 bảng nền tảng, 9 enum.
   - Migration 2 (`20261011160000_add_idempotency_and_transfer_location`): Bổ sung `idempotency_records`, vị trí nguồn/đích cho điều chuyển kho.
   - Migration 3 (`20261016200000_add_data_integrity_indexes_and_kits`): Bổ sung bảng `kits`, `kit_items`, enum `KitStatus` và **16 ràng buộc CHECK toàn vẹn toán học**:
     - `check_kit_item_quantity_positive`: `quantity > 0`
     - 5 CHECK không âm cho số lượng tồn kho: `onHand >= 0`, `reserved >= 0`, `quarantined >= 0`, `kitAllocated >= 0`, `borrowed >= 0`.
     - **Ràng buộc phân bổ tồn kho cốt lõi:**  
       `ALTER TABLE "stock_balances" ADD CONSTRAINT "check_stock_balances_allocation_limit" CHECK ("reserved" + "quarantined" + "kitAllocated" <= "onHand");`
     - 5 CHECK số lượng chi tiết giao dịch phải dương: `quantity > 0`.
     - Ràng buộc hợp lệ số lượng trả:  
       `ALTER TABLE "borrow_details" ADD CONSTRAINT "check_borrow_details_returned_quantity_valid" CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");`
     - 2 CHECK số lượng trước và sau biến động kho: `onHandBefore >= 0`, `onHandAfter >= 0`.

### 2.2 Sự phân kỳ đối với Thiết kế Stage4C Chưa Phê Duyệt (Divergence Analysis)
Thiết kế Stage4C (trình bày tại `docs/stage4c-consolidated-forward-ddl-candidate-20261030.md`) hoàn toàn **không tồn tại** trong mã nguồn đã commit của nhánh `codex/p3h-toolchain-security-probe-20261107`:

| Tiêu chí kỹ thuật | Schema Đã Commit (`p3h`) | Bản nháp Đề xuất Stage4C | Đánh giá phân kỳ & Rủi ro |
| :--- | :--- | :--- | :--- |
| **Bảng chứng từ toàn cục** | Không có | `return_evidence_registry` | Phân kỳ 100%. Schema hiện tại chỉ có `return_transactions` mang tính cục bộ. |
| **Bảng trạng thái thao tác** | Không có | `borrow_return_operations` | Chưa hề có mô hình máy trạng thái (FSM) PREPARED $\to$ COMPLETED / RECONCILIATION. |
| **Bảng chi tiết kiểm định QC** | Không có | `return_operation_lines` | Schema hiện tại không có dữ liệu kiểm định chất lượng (QC) từng dòng. |
| **Giải quyết quyền lưu giữ** | Không có | `return_custody_resolutions` | Chưa có cơ chế Reverse Handover hoặc Approved Disposition. |
| **Ghi nhận mất mát độc lập** | Thuộc `return_details.condition` | `return_loss_incidents` | Thiết kế hiện tại coi LOST như 1 chi tiết trả hàng; Stage4C muốn tách thành sự cố riêng. |
| **Khóa ngoại kép (Composite FK)** | Không có | `UNIQUE (id, "borrowRequestId")` trên `return_transactions` & `borrow_details` | Để bắt buộc ràng buộc dòng trả phải cùng phiếu mượn, Stage4C yêu cầu thêm constraint UNIQUE này trên bảng cũ, điều chưa từng chạy migration. |
| **Kiểu dữ liệu thời gian** | `TIMESTAMP(3)` không múi giờ | `TIMESTAMPTZ(3)` có múi giờ | Nguy cơ xung đột múi giờ khi lưu trữ giao dịch giữa các server UTC và giờ VN (+07:00). |

---

## 3. ĐÁNH GIÁ ĐỀ XUẤT ĐỊNH DẠNG MÃ CHỨNG TỪ & CHUẨN HÓA

### 3.1 Phân tích biểu thức chính quy (Regex Evaluation)
Đề xuất trong Issue #11 và Stage4C DDL:
$$\text{Regex: } \mathbf{\text{`\^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}\$`}}$$

1. **Cấu trúc kỹ thuật:**
   - Ký tự đầu tiên: Bắt buộc là chữ cái Latin (`A-Z`, `a-z`) hoặc chữ số (`0-9`). Ngăn chặn các ký tự điều khiển hoặc ký tự đặc biệt đứng đầu.
   - 0 đến 127 ký tự tiếp theo: Cho phép chữ cái, chữ số, dấu chấm `.`, gạch dưới `_`, hai chấm `:`, gạch chéo `/`, gạch ngang `-`.
   - Độ dài: Giới hạn từ 1 đến 128 ký tự ASCII đơn byte.
2. **Cơ chế chuẩn hóa trong PostgreSQL:**
   ```sql
   comparison_key text GENERATED ALWAYS AS (upper(original_ascii COLLATE "C")) STORED,
   CONSTRAINT return_evidence_registry_unique_key UNIQUE (comparison_key)
   ```
   - Sử dụng `COLLATE "C"` và hàm `upper()` đảm bảo việc gấp chữ hoa chỉ áp dụng cho bảng mã ASCII chuẩn ($a-z \to A-Z$), tránh lỗi phụ thuộc vào locale của hệ điều hành máy chủ.
   - Ràng buộc `UNIQUE (comparison_key)` triệt tiêu hoàn toàn khả năng trùng lặp vô tình do khác biệt chữ hoa/thường (ví dụ: `RT-2026-001` và `rt-2026-001` sẽ xung đột ngay tại mức cơ sở dữ liệu).

### 3.2 Các điểm quyết định bắt buộc thuộc thẩm quyền của Chủ nghiệp vụ (Business Owner)
DBA và AI **không được phép quyết định thay** Chủ phòng Lab/Chủ nghiệp vụ. Các câu hỏi nghiệp vụ cần quyết định bằng văn bản:
1. **Khoảng trắng trong mã vạch/chứng từ thực tế:**  
   Các thiết bị quét mã vạch hoặc chứng từ giấy của phòng Lab có sử dụng dấu cách (space) hay không (ví dụ: `PHIEU TRA 01/2026`)? Biểu thức regex trên **từ chối toàn bộ chuỗi có chứa khoảng trắng**. Nếu mã thực tế có khoảng trắng, hệ thống sẽ chặn 100% thao tác quét.
2. **Phạm vi áp dụng tính duy nhất toàn cục (Global vs Scoped Uniqueness):**  
   Tính duy nhất toàn cục áp dụng cho toàn bộ các loại chứng từ (`PHYSICAL_RETURN`, `REVERSE_HANDOVER`, `CUSTODY_DISPOSITION`). Nếu phòng Lab nhận thiết bị hoàn trả từ một đơn vị khác có mã trùng ngẫu nhiên với một chứng từ hủy 2 năm trước, hệ thống sẽ từ chối vĩnh viễn. Chủ nghiệp vụ có chấp nhận nguyên tắc "không tái sử dụng mã chứng từ ngay cả khi đã hủy" hay không?
3. **Quy tắc phân biệt số 0 đứng đầu (Leading Zeros):**  
   Mã `RT-01` và `RT-001` được cơ sở dữ liệu xem là 2 mã hoàn toàn khác nhau. Quy trình vận hành phòng Lab có cho phép điều này không, hay bắt buộc phải chuẩn hóa số học?
4. **Cơ quan cấp phát chứng từ (Issuance Authority):**  
   Mã chứng từ do hệ thống ACM tự động sinh (server-generated sequence/UUID) hay do kỹ thuật viên quét từ mã in sẵn trên túi đựng / phiếu giấy? Ai chịu trách nhiệm xác thực tính xác thực của mã này?

---

## 4. KIỂM TOÁN NGHIỆP VỤ MƯỢN - TRẢ, TỒN KHO, CÁCH LY & IDEMPOTENCY

Phân tích trực tiếp mã nguồn đang thực thi tại `apps/api/src/modules/borrow/borrow.service.ts` cho thấy hàng loạt lỗ hổng nghiêm trọng ở mức độ Kiến trúc CSDL và Giao dịch:

### 4.1 Lỗ hổng Tranh chấp Đồng thời & Thiếu Khóa Dòng (P0 — Concurrency & Missing `FOR UPDATE`)
- **Vị trí:** [`apps/api/src/modules/borrow/borrow.service.ts:418-468`](file:///d:/ACM_QLLK/apps/api/src/modules/borrow/borrow.service.ts#L418-L468)
- **Bằng chứng mã nguồn:**
  ```typescript
  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.borrowRequest.findUnique({
      where: { id },
      include: { details: { include: { item: true } }, reservations: true },
    });
    // Kiểm tra số lượng còn lại:
    const remainingToReturn = detail.quantity - detail.returnedQuantity;
    if (returnItem.returnedQuantity > remainingToReturn) { throw new AppError(...); }
    ...
    await tx.borrowDetail.update({
      where: { id: detail.id },
      data: { returnedQuantity: { increment: returnItem.returnedQuantity } },
    });
  ```
- **Phân tích cơ chế lỗi:**
  - Prisma `findUnique` phát sinh câu lệnh SQL: `SELECT ... FROM "borrow_requests" WHERE "id" = $1;`. Câu lệnh này **HOÀN TOÀN KHÔNG CÓ `FOR UPDATE`**.
  - Trong mức cô lập mặc định `READ COMMITTED` của PostgreSQL, nếu hai yêu cầu `POST /api/v1/borrow-requests/:id/return` gửi đồng thời (ví dụ: do mạng giật hoặc 2 kỹ thuật viên cùng thao tác):
    - Cả 2 giao dịch đọc cùng lúc `detail.returnedQuantity = 0`.
    - Cả 2 đều tính toán `remainingToReturn = 2` và cho rằng hợp lệ.
    - Cả 2 thực hiện câu lệnh `UPDATE "borrow_details" SET "returnedQuantity" = "returnedQuantity" + 2`.
  - Mặc dù ràng buộc CHECK `check_borrow_details_returned_quantity_valid` (`returnedQuantity <= quantity`) sẽ chặn giao dịch thứ hai commit, lỗi này bị ném ra dưới dạng **PostgreSQL Check Constraint Violation (Internal Server Error 500)** thay vì được xử lý an toàn bằng mã `409 Conflict`.
  - Nghiêm trọng hơn: các cập nhật tồn kho `stockBalance.update` không có khóa dòng sẽ dẫn đến mất mát cập nhật (Lost Updates) trên trường `onHand` và `quarantined`.

### 4.2 Lỗi Hư hỏng Sổ cái Tồn kho khi Trả Linh kiện Khác Vị trí (P0 — Cross-Location Return Ledger Corruption)
- **Vị trí:** [`apps/api/src/modules/borrow/borrow.service.ts:562-588`](file:///d:/ACM_QLLK/apps/api/src/modules/borrow/borrow.service.ts#L562-L588)
- **Bằng chứng mã nguồn:**
  ```typescript
  let destinationLocationId = returnItem.locationId;
  ...
  let bal = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId: detail.itemId, locationId: destinationLocationId } },
  });
  if (!bal) {
    bal = await tx.stockBalance.create({
      data: { itemId: detail.itemId, locationId: destinationLocationId, onHand: 0, borrowed: 0, ... },
    });
  }
  ...
  await tx.stockBalance.update({
    where: { id: bal.id },
    data: {
      borrowed: { decrement: Math.min(bal.borrowed, returnItem.returnedQuantity) },
      onHand: { increment: returnItem.returnedQuantity },
    },
  });
  ```
- **Phân tích toán học & Kịch bản Hư hỏng Dữ liệu:**
  1. Ban đầu: Kỹ thuật viên bàn giao 4 bo mạch ESP32 từ **Vị trí A** (`Location_A`).  
     Hệ thống cập nhật: `StockBalance(A).borrowed = 4`, `StockBalance(A).onHand` giảm 4.
  2. Sinh viên mang trả 4 bo mạch tại **Vị trí B** (`Location_B` - ví dụ: Kệ trả hàng hoặc Tủ bảo quản khác). Kỹ thuật viên chọn `locationId = Location_B`.
  3. Tại `Location_B`, bản ghi tồn kho có `bal.borrowed = 0` (vì hàng mượn xuất đi từ A).
  4. Phép toán thực thi:  
     $$\text{decrement} = \min(\text{bal.borrowed}, 4) = \min(0, 4) = \mathbf{0}$$
     `StockBalance(B).borrowed` được giảm đi 0 $\implies$ Vẫn giữ nguyên 0!  
     `StockBalance(B).onHand` tăng 4 $\implies$ Tồn kho vật lý tăng lên 4.
  5. **Hậu quả thảm họa:** `StockBalance(A).borrowed` **KHÔNG BAO GIỜ ĐƯỢC GIẢM**, vĩnh viễn kẹt ở giá trị 4!  
     Tổng số lượng mượn trên toàn hệ thống bị đội khống thêm 4 đơn vị. Toàn bộ báo cáo tài sản và kiểm kê định kỳ sẽ bị sai lệch vĩnh viễn và vi phạm bất đẳng thức bảo toàn số dư kho!

### 4.3 Xử lý Hàng Hỏng (DAMAGED) và Hàng Mất (LOST)
- **Trường hợp Hàng Hỏng (DAMAGED):**  
  Mã nguồn tăng `onHand` thêm `returnedQuantity` và đồng thời tăng `quarantined` thêm `returnedQuantity`.  
  Đối chiếu ràng buộc CHECK: `reserved + quarantined + kitAllocated <= onHand`.  
  Vì `onHand` tăng 1 và `quarantined` tăng 1, bất đẳng thức vẫn thỏa mãn. Hàng được đưa vào kho nhưng nằm trong trạng thái cách ly, không cho phép mượn tiếp. Điểm này phù hợp về mặt đại số.
- **Trường hợp Hàng Mất (LOST):**  
  Mã nguồn giữ nguyên `onHand` (vì khi xuất mượn `onHand` đã bị trừ), chỉ giảm `borrowed`. Tuy nhiên, lệnh ghi log `stockMovement.create` lại ghi:
  ```typescript
  type: StockTransactionType.EXPORT, quantityDelta: 0, onHandBefore, onHandAfter: onHandBefore
  ```
  Ghi nhận giao dịch loại `EXPORT` với `quantityDelta = 0` là một khiếm khuyết thiết kế sổ cái. Sổ cái biến động kho không thể hiện được lý do tài sản mất mát vật lý, gây khó khăn cho việc kiểm toán tài chính sau này.

### 4.4 Thiếu Cơ chế Idempotency trên Endpoint Trả hàng
- **Vị trí:** [`apps/api/src/modules/borrow/borrow.router.ts:168-195`](file:///d:/ACM_QLLK/apps/api/src/modules/borrow/borrow.router.ts#L168-L195)
- Endpoint `POST /api/v1/borrow-requests/:id/return` hoàn toàn không tiếp nhận header `Idempotency-Key` và không tra cứu bảng `idempotency_records`.
- Nếu xảy ra sự cố mạng chập chờn (HTTP 504 Gateway Timeout sau khi database đã commit), trình duyệt hoặc máy khách gửi lại (retry) yêu cầu sẽ nhận về HTTP 400 (`Chỉ phiếu mượn 'Đang mượn' mới có thể nhận hoàn trả`), khiến người dùng hoang mang và không nhận được mã chứng từ trả `returnNumber`.

---

## 5. ĐÁNH GIÁ KẾ HOẠCH DDL STAGE4C FORWARD/ROLLBACK & TƯƠNG THÍCH PRISMA

### 5.1 Rủi ro Khóa Bảng và Tắc nghẽn Giao dịch (Lock Escalation & Table Rewrites)
Bản phác thảo DDL Stage4C có câu lệnh:
```sql
ALTER TABLE public.return_transactions
  ADD CONSTRAINT return_transactions_id_borrow_ref_unique
  UNIQUE (id, "borrowRequestId");
ALTER TABLE public.borrow_details
  ADD CONSTRAINT borrow_details_id_borrow_ref_unique
  UNIQUE (id, "borrowRequestId");
```
- **Đánh giá DBA:** Việc tạo ràng buộc `UNIQUE` trên các bảng lịch sử đang có dữ liệu sẽ yêu cầu PostgreSQL quét toàn bộ bảng để lập chỉ mục B-Tree và giữ khóa `SHARE ROW EXCLUSIVE`. Khóa này chặn toàn bộ các thao tác ghi (`INSERT`, `UPDATE`, `DELETE`) trên bảng `borrow_details` và `return_transactions` trong suốt thời gian quét.
- Nếu thực hiện trên cơ sở dữ liệu có hàng triệu dòng đang phục vụ trực tiếp, hệ thống sẽ bị treo hoàn toàn các giao dịch mượn/trả.
- **Giải pháp bắt buộc:** Phải tạo chỉ mục đồng thời trước (`CREATE UNIQUE INDEX CONCURRENTLY ...`), sau đó mới gắn ràng buộc bằng cú pháp `ALTER TABLE ... ADD CONSTRAINT ... USING INDEX ...`.

### 5.2 Xung đột Kiến trúc giữa Prisma ORM và Tính năng Nâng cao của PostgreSQL 17
1. **Cột ảo tính toán (Stored Generated Columns):**  
   Cột `comparison_key text GENERATED ALWAYS AS (upper(original_ascii COLLATE "C")) STORED` không thể được định nghĩa nguyên bản trong cú pháp Prisma Schema DSL (`schema.prisma`).
2. **Chỉ mục bộ phận (Partial Unique Indexes):**  
   Chỉ mục `CREATE UNIQUE INDEX ... WHERE state IN ('PREPARED', 'RECONCILIATION_REQUIRED')` không được Prisma Schema DSL hỗ trợ trực tiếp.
3. **Nguy cơ Hủy hoại Dữ liệu (Drift Destruction):**  
   Nếu các bảng và chỉ mục này được tạo thủ công bằng SQL DDL mà không có sự quản lý chặt chẽ của Prisma Migrations, bất kỳ lệnh `npx prisma db push` hoặc `npx prisma migrate dev` vô ý nào từ phía lập trình viên cũng sẽ coi các chỉ mục và ràng buộc này là "dữ liệu lạ" (drift) và tự động tạo script `DROP CONSTRAINT` / `DROP INDEX` để xóa bỏ chúng!

### 5.3 Hoàn toàn Thiếu Kịch bản Rollback (Missing Rollback Plan)
- Trong toàn bộ repository, không có bất kỳ tệp tin nào hướng dẫn cách rollback an toàn khi DDL Stage4C gặp sự cố giữa chừng.
- Nếu một bảng mới được tạo nhưng việc chèn khóa ngoại thất bại do dữ liệu lịch sử bị sai lệch (orphan records), cơ sở dữ liệu sẽ rơi vào trạng thái dở dang. Thiếu kịch bản Rollback có kiểm chứng là vi phạm tiêu chuẩn nghiêm ngặt của DBA đối với một bản phát hành Production.

---

## 6. BẢNG TỔNG HỢP LỖI KỸ THUẬT & KHIẾM KHUYẾT (FINDINGS MATRIX)

Bảng tổng hợp phân loại theo mức độ nghiêm trọng: **P0 (Chặn phát hành / Hư hỏng dữ liệu)**, **P1 (Lỗi nghiệp vụ / Rủi ro cao)**, **P2 (Thiếu sót kiến trúc / Vận hành)**, **P3 (Tối ưu hóa)**.

| ID | Mức độ | Tệp tin & Dòng (File:line) | Bằng chứng kỹ thuật (Evidence) | Phương pháp tái hiện không ghi DB (Reproduction) | Biện pháp khắc phục chuẩn mực (Remediation) | Cổng phát hành (Release Gate) |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **DBA-01** | **P0** | `apps/api/src/modules/borrow/borrow.service.ts:418-468` | `prisma.borrowRequest.findUnique` không dùng `FOR UPDATE`. Hai phiên đồng thời cùng đọc số lượng còn lại và cùng tăng `returnedQuantity`. | Phân tích luồng đồng thời trong `READ COMMITTED`: 2 luồng đọc song song `returnedQuantity = 0`, cả 2 cùng vượt qua kiểm tra logic và gửi UPDATE. | Sử dụng raw SQL `SELECT ... FOR UPDATE` trong transaction của Prisma Client hoặc triển khai khóa lạc quan (Optimistic Locking với trường `version`). | Chặn Cổng #13 & #14 (D8-WR7) |
| **DBA-02** | **P0** | `apps/api/src/modules/borrow/borrow.service.ts:562-588` | Phép toán `Math.min(bal.borrowed, qty)` tại vị trí trả khác vị trí mượn khiến `bal.borrowed` của vị trí mượn gốc không bao giờ được giảm. | Kịch bản toán học: Mượn 4 tại kho A (`A.borrowed = 4`). Trả 4 tại kệ B (`B.borrowed = 0`). `min(0, 4) = 0`. Kho A vẫn giữ nguyên 4. Tổng borrowed toàn hệ thống tăng khống 4. | Truy vấn vị trí giữ chỗ gốc từ `StockReservation` hoặc chi tiết xuất kho để trừ đúng `borrowed` tại vị trí xuất gốc, sau đó cộng `onHand` tại vị trí nhận mới. | Chặn Cổng #13 & #14 (D8-WR7) |
| **DBA-03** | **P0** | `apps/api/src/modules/borrow/borrow.return-writer.contract.ts:1-246` & Issue #14 | Bản chuyển đổi bộ ghi trả hàng D8 chỉ là giao diện cổng thuần túy (interface port), hoàn toàn chưa có Database Adapter kết nối Prisma thật. | Tệp mã nguồn có chú thích ngay dòng 1: *"REVIEW ONLY. NOT a Prisma adapter or a live return route... No DB access, env, HTTP, filesystem or Prisma imports"*. | Lập trình Database Adapter thực tế triển khai giao diện `Stage4CTransactionPort` với đầy đủ câu lệnh khóa và ghi PostgreSQL nguyên tử. | Chặn Cổng #14 (D8-WR7) |
| **DBA-04** | **P1** | `apps/api/src/modules/borrow/borrow.router.ts:168-195` | Router hoàn trả `POST /:id/return` không có middleware hoặc logic xử lý `Idempotency-Key`. | Kiểm tra mã nguồn router: Hoàn toàn không gọi `idempotencyService.validateKey` hay tìm kiếm trong `IdempotencyRecord`. | Tích hợp middleware `idempotency` bắt buộc header `Idempotency-Key`, lưu trữ mã chứng từ sinh ra để phản hồi lại khi có mạng rớt. | Chặn Cổng #13 & #14 |
| **DBA-05** | **P1** | `apps/api/src/modules/borrow/borrow.service.ts:629-644` | Trả hàng báo mất (LOST) ghi log `StockMovement` với `quantityDelta = 0` và `type = EXPORT`. | Đọc trực tiếp code: `quantityDelta: 0, onHandBefore, onHandAfter: onHandBefore, referenceType: 'RETURN_LOST'`. | Tách quy trình báo mất sang bảng `return_loss_incidents` riêng biệt; nếu xuất kho trừ tài sản phải ghi nhận giảm tài sản rõ ràng, không ghi delta 0. | Chặn Cổng #11 & #14 |
| **DBA-06** | **P1** | `docs/stage4c-consolidated-forward-ddl-candidate-20261030.md:37-46` | Tạo ràng buộc `UNIQUE (id, "borrowRequestId")` trực tiếp bằng `ALTER TABLE` gây khóa bảng diện rộng (Exclusive Table Lock). | Kiểm tra cú pháp SQL đề xuất: Thiếu mệnh đề `CONCURRENTLY`, gây khóa ghi trên toàn bộ giao dịch mượn trả khi thi hành DDL. | Tách quy trình: 1) `CREATE UNIQUE INDEX CONCURRENTLY`; 2) `ALTER TABLE ... ADD CONSTRAINT ... USING INDEX`. Bổ sung script Rollback an toàn. | Chặn Cổng #11 & #13 |
| **DBA-07** | **P1** | `docs/stage4c-consolidated-forward-ddl-candidate-20261030.md:15-28` | Cột tính toán ảo `GENERATED ALWAYS AS` và Partial Index không được hỗ trợ trong Prisma Schema DSL. | Thử nghiệm đối chiếu cú pháp Prisma 5.21: Prisma CLI sẽ báo lỗi cú pháp hoặc tự động sinh migration xóa các chỉ mục này khi chạy `migrate dev`. | Quản lý các cấu trúc này thông qua các tệp migration SQL thủ công trong thư mục `prisma/migrations` và cấm tuyệt đối lệnh `prisma db push`. | Chặn Cổng #11 & #13 |
| **DBA-08** | **P2** | `docs/deployment/ACM_D8_RELEASE_READINESS_GO_NO_GO_20261107.md:75-92` | Gói dịch vụ miễn phí (Render Free + Supabase Free) không có sao lưu tự động (No PITR, No Backup), tự động ngủ sau 15 phút, nguy cơ mất dữ liệu hoàn toàn. | Đối chiếu tài liệu chính thức của Supabase & Render: Supabase Free tự động tạm dừng (pause) sau 7 ngày không hoạt động và không có cơ chế phục hồi theo thời gian (PITR). | Thiết lập script sao lưu định kỳ `pg_dump` ngoại vi độc lập (Off-site backup S3/Cold storage) và được kiểm thử phục hồi thành công trước khi đưa vào vận hành. | Chặn Cổng #15 (D8-REL5) |

---

## 7. TRẠNG THÁI KIỂM CHỨNG CÁC CỔNG CỐ ĐỊNH (#11, #12, #13, #14)

Theo nguyên tắc kiểm toán độc lập: *Không được suy diễn trạng thái PASS từ các kết quả chạy mock hoặc bài kiểm tra giả lập.*

```
+----------------------------------------------------------------------------------------------------+
| TỔNG HỢP TRẠNG THÁI CÁC CỔNG GIAO DỊCH VÀ PHÁT HÀNH (GITHUB ISSUES #11 - #15)                       |
+----------------------------------------------------------------------------------------------------+
| CỔNG #11 (Chính sách Chứng từ & DDL Stage4C)        : BLOCKED / HOLD                                |
| CỔNG #12 (Hai Phê duyệt Độc lập tạo PG17 Cô lập)     : BLOCKED / HOLD                                |
| CỔNG #13 (Migration, Rollback & Concurrency PG17)   : BLOCKED / HOLD                                |
| CỔNG #14 (Bộ ghi Return Writer Adapter Thật)        : BLOCKED / HOLD                                |
| CỔNG #15 (Nghiệm thu Toàn diện & Phát hành)         : BLOCKED / RELEASE NO-GO                       |
+----------------------------------------------------------------------------------------------------+
```

### Chi tiết từng cổng:

1. **Issue #11 — D8-DB2B: Phê duyệt nghiệp vụ + DBA cho chính sách chứng từ và DDL Stage4C:**
   - Trạng thái: **`BLOCKED / HOLD`**.
   - Bằng chứng thực tế:
     - Chưa có chữ ký phê duyệt nghiệp vụ của Chủ dự án về biểu thức Regex và quy tắc duy nhất toàn cục.
     - Chưa có văn bản rà soát và phê duyệt DDL chính thức từ DBA con người có thẩm quyền.
     - Thiếu hụt bằng chứng gói ZIP `ACM_D8_DB2B_...zip` trên repository.
2. **Issue #12 — D8-PG1C: Hai phê duyệt độc lập trước khi tạo PostgreSQL 17 cô lập:**
   - Trạng thái: **`BLOCKED / HOLD`**.
   - Bằng chứng thực tế:
     - Hoàn toàn chưa có 2 phê duyệt độc lập từ **hai con người thật khác nhau** (Chủ dự án và Chuyên gia kỹ thuật độc lập).
     - Cluster PostgreSQL 17 tại `%LOCALAPPDATA%\ACM_D8_PG17_55433_NEW_ONLY` **chưa từng được tạo**.
     - Các tệp tin kịch bản `PG1C` và `PG1D FIX1` không có trong kho mã nguồn (Missing Evidence).
3. **Issue #13 — D8-PG3: PostgreSQL 17 isolated: migration, guarded rollback, race/concurrency proof:**
   - Trạng thái: **`BLOCKED / HOLD`**.
   - Bằng chứng thực tế:
     - Vì Cổng #11 và #12 đang bị chặn (HOLD), môi trường cơ sở dữ liệu cô lập chưa tồn tại.
     - Chưa có bất kỳ câu lệnh SQL migration, rollback hay kiểm thử tranh chấp 2 phiên (2-session concurrency) nào được thực thi trên môi trường cơ sở dữ liệu thật.
4. **Issue #14 — D8-WR7: Tích hợp return writer PREPARE/COMMIT với Prisma thật:**
   - Trạng thái: **`BLOCKED / HOLD`**.
   - Bằng chứng thực tế:
     - Mã nguồn adapter kết nối Prisma Client thật chưa được lập trình (mới chỉ dừng ở hợp đồng giao diện `borrow.return-writer.contract.ts`).
     - Lỗi nghiêm trọng hư hỏng tồn kho khi trả chéo vị trí (DBA-02) và thiếu khóa dòng (DBA-01) trong bộ ghi cũ chưa được khắc phục.
     - Router `return-operations` vẫn đang bị chặn (hardcoded 503).
5. **Issue #15 — D8-REL5: Frontend/backend E2E, restore rehearsal, release approval:**
   - Trạng thái: **`BLOCKED / RELEASE NO-GO`**.
   - Toàn bộ các điều kiện tiên quyết từ Cổng 11 đến 14 đều chưa đạt.

---

## 8. BỘ CÂU HỎI CHUẨN XÁC DÀNH CHO CHỦ NGHIỆP VỤ, DBA & OPERATOR

Để các bên liên quan có cơ sở ra quyết định bằng văn bản, DBA kiểm toán đưa ra danh sách các câu hỏi cụ thể:

### 8.1 Dành cho Chủ nghiệp vụ / Quản lý Phòng Lab (Business Owner)
1. **Quy chuẩn mã chứng từ:** Định dạng mã chứng từ phòng Lab hiện tại đang sử dụng là gì? Có trường hợp nào mã chứa dấu cách (space), ký tự tiếng Việt có dấu, hoặc các ký tự đặc biệt ngoài tập `[A-Za-z0-9._:/-]` không?
2. **Nguyên tắc khóa vĩnh viễn:** Khi một giao dịch trả hàng bị HỦY (CANCELLED), mã chứng từ gắn liền với giao dịch đó có được phép tái sử dụng cho một lượt trả hàng khác trong tương lai không, hay phải bị vô hiệu hóa và khóa vĩnh viễn?
3. **Quy trình xử lý chênh lệch kho do mất mát:** Khi sinh viên báo mất linh kiện (LOST), phòng Lab xử lý tài chính thế nào? Có cần ghi nhận trách nhiệm bồi thường của sinh viên vào một bảng theo dõi công nợ/sự cố riêng không?

### 8.2 Dành cho Chuyên gia Cơ sở Dữ liệu Phụ trách (DBA)
1. **Chiến lược di chuyển Schema (Migration Strategy):** Với các tính năng PostgreSQL nâng cao (Stored Generated Column, Partial Unique Index), DBA có đồng ý tách riêng các câu lệnh DDL này thành file SQL migration thuần túy không qua Prisma CLI để tránh việc Prisma vô tình xóa bỏ (drop) không?
2. **Chiến lược Khóa dòng (Locking Strategy):** DBA phê duyệt phương án nào để ngăn chặn Race Condition khi hoàn trả đồng thời: dùng `SELECT ... FOR UPDATE` cưỡng bức trên dòng `BorrowRequest`, hay áp dụng Optimistic Locking với cột số hiệu phiên bản (`version INT`)?
3. **Cơ chế Khôi phục Dữ liệu (Rollback Verification):** Tiêu chuẩn kiểm thử kịch bản rollback là gì? DBA có yêu cầu phải chạy thử nghiệm rollback hoàn chỉnh trên một database clone trước khi chấp thuận cấp phép chạy trên Staging không?

### 8.3 Dành cho Kỹ sư Vận hành Hệ thống (Authorized Local PG Operator)
1. **Kiểm tra Môi trường Cục bộ:** Xác nhận cổng `55433` và thư mục `%LOCALAPPDATA%\ACM_D8_PG17_55433_NEW_ONLY` trên máy trạm Windows có đang bị chiếm dụng bởi bất kỳ tiến trình nào khác không?
2. **Bảo toàn Dịch vụ Hiện hữu:** Xác nhận dịch vụ `postgresql-x64-17` đang chạy trên máy (phục vụ Demo UAT cổng 5433) được bảo vệ tuyệt đối và không bị ảnh hưởng khi khởi tạo cluster mới?
3. **Lưu trữ Bằng chứng Vận hành:** Khi nhận được đủ 2 phê duyệt con người hợp lệ cho Cổng #12, operator sẽ lưu trữ log thực thi và mã băm SHA-256 của cluster identity ở đâu để phục vụ kiểm toán độc lập?

---

## 9. ĐỀ XUẤT MA TRẬN KIỂM THỬ CÔ LẬP AN TOÀN TRÊN PG17 (PORT 55433)

> **CẢNH BÁO TUÂN THỦ TUYỆT ĐỐI:** Đây là bản đề xuất kịch bản kiểm thử phục vụ việc chuẩn bị. **KHÔNG ĐƯỢC PHÉP CHẠY** bất kỳ câu lệnh SQL nào hoặc tạo cluster cho đến khi Cổng #11 và Cổng #12 được con người ký duyệt chính thức.

### 9.1 Kịch bản Truy vấn Kiểm tra Nhận diện Cơ sở Dữ liệu Không Ghi (Read-Only Identity SQL)
Trước khi thực hiện bất kỳ thao tác nào, bắt buộc phải chứng minh phiên làm việc kết nối chính xác vào instance cô lập 55433:
```sql
-- READ-ONLY IDENTITY PREFLIGHT (Chỉ đọc)
SELECT 
  current_database() AS db_name,
  current_user AS user_name,
  inet_server_addr() AS server_ip,
  inet_server_port() AS server_port,
  version() AS pg_version,
  pg_is_in_recovery() AS is_replica;
-- Kỳ vọng: port = 55433, user = acm_d8_admin, db_name = acm_d8_isolated_test
```

### 9.2 Ma trận Kiểm thử Tranh chấp & Ràng buộc Tiêu cực (Negative Controls & Concurrency Matrix)

| Mã ca kiểm thử | Mô tả mục tiêu kiểm thử | Câu lệnh SQL thử nghiệm mô phỏng | Kết quả kỳ vọng (Expected Outcome) | Bằng chứng cần thu thập |
| :--- | :--- | :--- | :--- | :--- |
| **TEST-01** | Trùng lặp mã chứng từ toàn cục khác chữ hoa/thường | Session 1: `INSERT ... ('REC-01');`<br>Session 2: `INSERT ... ('rec-01');` | Session 2 bị chặn: `ERROR: duplicate key value violates unique constraint "return_evidence_registry_unique_key"` | Log lỗi vi phạm ràng buộc Unique của PostgreSQL |
| **TEST-02** | Từ chối ký tự đặc biệt hoặc dấu cách trong mã chứng từ | `INSERT ... ('REC 01 INVALID');` | Bị chặn ngay lập tức: `ERROR: check constraint "return_evidence_registry_format_chk" violated` | Mã lỗi CHECK constraint violation |
| **TEST-03** | Tranh chấp hoàn trả đồng thời trên cùng chi tiết mượn | Session 1: Gửi hoàn trả `qty = 2`<br>Session 2: Gửi hoàn trả `qty = 2` (Tổng mượn = 2) | Một giao dịch thành công (HTTP 200), giao dịch thứ hai bị từ chối sạch sẽ với HTTP 409 Conflict (hoặc bị chặn bởi khóa dòng) | Trạng thái `returnedQuantity = 2`, không bị vượt mức |
| **TEST-04** | Trả linh kiện chéo vị trí kho | Mượn tại Kho A (`borrowed = 4`). Trả tại Kệ B (`borrowed = 0`). | Kho A: `borrowed = 0`. Kệ B: `onHand` tăng 4. Tổng `borrowed` toàn hệ thống giảm chính xác về 0. | Bảng đối soát số dư tồn kho tại cả 2 vị trí |
| **TEST-05** | Hoàn trả vượt quá số lượng đang mượn (Over-return) | Phiếu mượn 2 linh kiện, cố ý gửi yêu cầu trả 5 linh kiện. | PostgreSQL từ chối: `check_borrow_details_returned_quantity_valid violated` | API phản hồi HTTP 400 Bad Request |
| **TEST-06** | Thử nghiệm Hủy sau khi đã nhận hàng vật lý (Cancel after RECEIVE) | Thao tác RECEIVE đã ghi nhận, sau đó gửi lệnh CANCEL thông thường. | Hệ thống từ chối chuyển sang `CANCELLED`, ép buộc chuyển sang `RECONCILIATION_REQUIRED`. | Trạng thái máy FSM không bị bỏ qua khâu giải quyết lưu giữ |

---

## 10. ĐÁNH GIÁ PHƯƠNG ÁN SAO LƯU / PHỤC HỒI & GIỚI HẠN HẠ TẦNG MIỄN PHÍ

### 10.1 Đánh giá Hiện trạng RPO / RTO trên Hạ tầng Đám mây Đề xuất
Dự án ACM đang định hướng sử dụng gói miễn phí: **Render Free (Node.js API)** và **Supabase Free (PostgreSQL)** với chi phí $0.00. Với tư cách DBA, chúng tôi phải cảnh báo rõ ràng các rủi ro vận hành thực tế:

1. **RPO (Recovery Point Objective - Giới hạn mất mát dữ liệu thời gian):**
   - Supabase Free Tier **KHÔNG CÓ TÍNH NĂNG POINT-IN-TIME RECOVERY (PITR)** và **KHÔNG TỰ ĐỘNG SAO LƯU HÀNG NGÀY ĐỘC LẬP**.
   - Nếu xảy ra sự cố hỏng bảng hoặc thao tác xóa nhầm của người dùng, toàn bộ dữ liệu từ lần export thủ công gần nhất sẽ bị mất vĩnh viễn. RPO thực tế hiện tại là **KHÔNG XÁC ĐỊNH (từ 24 giờ đến 7 ngày mất mát)**.
2. **RTO (Recovery Time Objective - Thời gian khôi phục dịch vụ):**
   - Render Free Service sẽ tự động chuyển sang chế độ ngủ (sleep) sau 15 phút không có yêu cầu truy cập. Thời gian khởi động lại (cold start) mất từ **50 đến 90 giây**.
   - Nếu database bị lỗi hoặc tạm dừng (pause sau 7 ngày không dùng), việc khôi phục thủ công phụ thuộc hoàn toàn vào operator. RTO thực tế là **từ 2 đến 8 giờ làm việc**.
3. **Cảnh báo tính khả thi trong vận hành thực tế:**
   - Không thể coi hạ tầng Free Tier là môi trường sẵn sàng cho Sản xuất (Production). Nó chỉ phù hợp cho mục đích Demo hoặc Đánh giá tính năng (Pilot Testing) với dữ liệu tổng hợp.
   - Để có thể phát hành chính thức, Chủ dự án bắt buộc phải:
     - Hoặc thiết lập đường ống (pipeline) tự động chạy `pg_dump` mã hóa đẩy về bộ lưu trữ lạnh ngoài (Offsite S3/Google Cloud Storage) theo lịch cố định (tối thiểu 6 tiếng/lần).
     - Hoặc phê duyệt ngân sách chuyển đổi sang gói có cam kết SLA và tính năng sao lưu PITR tự động.

---

## 11. KẾT LUẬN KỸ THUẬT & KHUYẾN NGHỊ DỨT KHOÁT

### 11.1 Đánh giá Kỹ thuật Tổng thể
1. **Kiến trúc dữ liệu hiện tại:** Chưa sẵn sàng cho việc hoàn trả linh kiện phức tạp (Full/Partial Return, Stage4C FSM). Bộ ghi cũ đang chứa 2 lỗi toán học và tranh chấp dòng nghiêm trọng (P0) có thể làm sai lệch hoàn toàn sổ cái tồn kho.
2. **Thiết kế Stage4C:** Bản nháp DDL có tính logic nghiệp vụ tốt về mặt lý thuyết, nhưng hoàn toàn thiếu kịch bản rollback, tiềm ẩn rủi ro khóa bảng diện rộng và xung đột với Prisma ORM. Đặc biệt, bộ ghi dữ liệu thực tế (Database Adapter) chưa hề được lập trình.
3. **Tuân thủ quy trình kiểm soát:** Các cổng an toàn từ Issue #11 đến Issue #15 đang được giữ ở trạng thái `HOLD` là hoàn toàn chính xác. Chưa có bất kỳ bằng chứng con người độc lập nào xác nhận thông qua.

### 11.2 Quyết định Phát hành (Release Verdict)
```
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|                                     RELEASE_NO_GO                                                  |
|                                                                                                    |
|  - TUYỆT ĐỐI KHÔNG triển khai lên môi trường Production hoặc đưa vào phục vụ người dùng thật.       |
|  - TUYỆT ĐỐI KHÔNG mở cờ ghi (STAGING_READ_ONLY=true, ALLOW_STAGING_AUTH_LOGIN=false giữ nguyên).  |
|  - TUYỆT ĐỐI KHÔNG thực hiện chạy migration DDL Stage4C trên bất kỳ cơ sở dữ liệu dùng chung nào.  |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### 11.3 Khuyến nghị Bước đi Tiếp theo dành cho Đội ngũ Kỹ thuật
1. **Không sửa mã nguồn trong phiên kiểm toán này:** Giữ nguyên trạng mã nguồn hiện tại theo đúng chỉ đạo.
2. **Lấy ý kiến bằng văn bản của Chủ nghiệp vụ:** Trình bộ câu hỏi tại Mục 8.1 lên Chủ phòng Lab để chốt định dạng mã chứng từ và chính sách lưu giữ.
3. **Khắc phục lỗi P0 của bộ ghi trả hàng:** Lập kế hoạch sửa lỗi DBA-01 (Row Locking) và DBA-02 (Cross-Location Borrowed Balance) trên một nhánh phát triển độc lập có kiểm thử cô lập.
4. **Hoàn thiện kịch bản Rollback cho Stage4C:** DBA phụ trách phải biên soạn tệp `rollback.sql` có kiểm chứng thực tế trước khi đề xuất mở bất kỳ cổng migration nào.
5. **Chỉ khi các cổng #11 và #12 được 2 con người thật ký duyệt bằng văn bản ngoài đời thực, operator mới được phép tiến hành tạo cluster PG17 cô lập trên cổng 55433 để chạy thử nghiệm.**

---
*Báo cáo được lập bởi Senior PostgreSQL 17 DBA Technical Reviewer.*  
*Chữ ký kỹ thuật: `ACM_INDEPENDENT_DBA_INSPECTION_VERIFIED_NO_GO`*
