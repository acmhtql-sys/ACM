# ACM D8 — PG17 post-identity / DBA Stage4C execution gate review

**Ngày tổng hợp:** 2026-11-09 (Asia/Ho_Chi_Minh)  
**Loại:** REVIEW-ONLY / NO SQL / NO DB WRITES  
**Nhánh nguồn cố định:** [Draft PR #89](https://github.com/acmhtql-sys/ACM_QLLK/pull/89), commit `a7fa15b805e965a0aa9cbb87f617ee5abcae092e`  
**Kết luận:** `PG1D_IDENTITY_PASS` · `STATIC_SECURITY_PASS_WITH_LIMITATIONS` · `DBA_FINAL_DDL_PENDING` · `PG3_EXECUTION_HOLD` · **`RELEASE_NO_GO`**

> Đây là tài liệu đối chiếu và checklist cần quyết định, **không phải** Prisma schema cuối, SQL migration, DDL, script chạy thử, DBA/AppSec execution approval hay chứng nhận môi trường đã cô lập hoàn toàn. Không chạy `prisma migrate`, `psql` writer, `initdb` lần hai, rollback/restore, hoặc can thiệp UAT/Windows PostgreSQL hiện hữu, GitHub `main`, Render, Supabase và dữ liệu thật. Không tự động mở Stage4C writer/503 gate.

## 1. Bằng chứng môi trường mới đã xác nhận, đúng phạm vi

| Cổng | Bằng chứng | Kết luận có giới hạn |
|---|---|---|
| PG0C/PG1C preflight | [Issue #12 preflight](https://github.com/acmhtql-sys/ACM_QLLK/issues/12#issuecomment-6724121184) | Branch/head/9 paths + 12 hashes, D7 Git EOL 4/4, fake transaction 20/20; không chứng minh writer PG17 |
| PG1C Create | [Issue #12 Create PASS](https://github.com/acmhtql-sys/ACM_QLLK/issues/12#issuecomment-6724168552) | Cluster **mới**, NEW-ONLY, PostgreSQL 17.11; không động tới service hiện hữu |
| PG1D FIX3 | [Issue #12 identity PASS](https://github.com/acmhtql-sys/ACM_QLLK/issues/12#issuecomment-6729354176) | SHA-verified FIX3 và hai phê duyệt riêng; `postgres` / `acm_d8_admin`, endpoint `127.0.0.1:55433`, PGDATA chính xác `%LOCALAPPDATA%\ACM_D8_PG17_55433_NEW_ONLY`, version `170011`, `transaction_read_only=on`, `pg_is_in_recovery()=f` |
| Static config & HBA | [Issue #12 security evidence](https://github.com/acmhtql-sys/ACM_QLLK/issues/12#issuecomment-6729480763) | `port=55433`, `listen_addresses='127.0.0.1'`; `postgresql.auto.conf` 0 active directives; six HBA entries use `scram-sha-256`; không chứng minh tất cả cấu hình runtime |
| Windows ACL & existing service | Cùng bằng chứng Issue #12 | PGDATA/`postgresql.conf`/`pg_hba.conf`: owner local `ACER`, SYSTEM/Administrators/ACER FullControl inherited; `AreAccessRulesProtected=False`; existing `postgresql-x64-17` Running |

**Còn mở ở cổng bảo mật (bổ sung quan sát 09/11):** bước rà **tên** của toàn bộ 21 directive trong `postgresql.conf` không tìm thấy `include`, `include_dir`, `include_if_exists`, `config_file` hoặc `hba_file` được khai báo trực tiếp; `postgresql.auto.conf` trước đó có 0 directive active. Tuy nhiên, đây là tìm kiếm tĩnh trên tệp chính, **không xác nhận cấu hình runtime/đường dẫn config thực**. Phải xác minh `max_connections` có **hai lần khai báo** và ACL cha có SID capability chưa xác định đầy đủ, sau đó mới cân nhắc đánh dấu cổng bảo mật. Các HBA rule `::1/128` không chứng minh có listener TCP IPv6. Không tuyên bố security-isolation PASS cuối cùng.


## 1A. Bổ sung quan sát 2026-11-09 — directive inventory và ACL thư mục cha

Người vận hành chỉ **đọc tệp và ACL**, không kết nối SQL hay sửa hệ thống. Kết quả đã được sao chép từ PowerShell, không phải phép thử trên máy người vận hành do GitHub thực hiện.

- **21 dòng active** trong `postgresql.conf`, theo tên: `datestyle`, `default_text_search_config`, `dynamic_shared_memory_type`, `lc_messages`, `lc_monetary`, `lc_numeric`, `lc_time`, `listen_addresses`, `log_connections`, `log_directory`, `log_disconnections`, `log_file_mode`, `log_timezone`, `logging_collector`, `max_connections` (**2 lần**), `max_wal_size`, `min_wal_size`, `port`, `shared_buffers`, `timezone`. Phép kiểm tra **không thấy tên** chỉ thị include/redirection trong tệp chính.
- **Duplicate `max_connections`**: cần xem thứ tự + giá trị hai dòng, xác nhận có hiệu lực theo PostgreSQL runtime bằng phương pháp được phê duyệt riêng nếu cần. Không tự sửa `postgresql.conf`, restart hay khẳng định con số runtime chỉ từ danh sách tên.
- **ACL thư mục cha** `%LOCALAPPDATA%`: owner `DESKTOP-T4JBFIE\\ACER`; FullControl hiển thị cho `NT AUTHORITY\\SYSTEM`, `BUILTIN\\Administrators`, `DESKTOP-T4JBFIE\\ACER`, cùng một ACE khác là SID bắt đầu `S-1-15-3-1024-...` với cột FileSystemRights bị PowerShell rút gọn (hiện `...le, Synchronize`). **Không suy luận SID này là an toàn hay nguy hiểm từ dòng bị cắt**. Cần xem toàn bộ `IdentityReference`, `FileSystemRights`, `AccessControlType`, `InheritanceFlags`, `PropagationFlags`, `IsInherited` trên *parent* và *PGDATA/file*; những lần trước PGDATA/config/HBA chỉ hiển thị 3 ACE FullControl **được kế thừa**, `AreAccessRulesProtected=False`. ACE ở cha có thể không truyền xuống con (tùy inheritance flags); chưa chứng minh quyền thực tế của SID đó trong thư mục cluster.
- **Existing Windows service**: `postgresql-x64-17` vẫn `Running` ở thời điểm người vận hành kiểm tra.
- **Verdict**: `STATIC_FILE_INVENTORY_PASS_WITH_TWO_OPEN_OBSERVATIONS`, `ACL_INHERITANCE_NOT_FULLY_RESOLVED`, `NO_SQL_EXECUTION`, `RELEASE_NO_GO`.

**Hành động tiếp theo chỉ đọc:** (a) xem hai `max_connections` cùng số dòng; (b) hiển thị đầy đủ ACE/flags cha + PGDATA + hai config file, không thay đổi ACL; (c) nếu khác biệt, STOP và yêu cầu AppSec/Owner review; (d) không đọc ra mật khẩu, không chạy DDL/migration hay đổi config.

## 2. Baseline source — không đồng nhất với schema cuối

- **RC5/current on PR #89 head:** [`apps/api/prisma/schema.prisma`](https://github.com/acmhtql-sys/ACM_QLLK/blob/a7fa15b805e965a0aa9cbb87f617ee5abcae092e/apps/api/prisma/schema.prisma), Git blob SHA-1 `ec969e68f00e17fe2b037dc4c5b58fcff6744983`, **19 models**. `ReturnTransaction.returnNumber @unique` tồn tại; legacy `IdempotencyRecord` liên kết `StockTransaction` và TTL không đủ chứng minh G05/G06.
- **Stage4C inert snapshot:** [`apps/api/prisma/schema.prisma` trên nhánh review](https://github.com/acmhtql-sys/ACM_QLLK/blob/review/d8-wr7e-stage4c-inert-20261029/apps/api/prisma/schema.prisma), Git blob SHA-1 `fbf12e51a53c2ecd128dd24d438c100b71ea850e`, **20 models** gồm `BorrowReturnOperation`. **Chỉ là skeleton**: `@@unique([borrowRequestId, physicalEvidenceRef])` không chứng minh global case-insensitive; thiếu verified/received custody, code registry, durable scoped key, QC/LOST và immutability.
- **G03 proposal:** [RFC G03/G05/G06 tại PR #89](https://github.com/acmhtql-sys/ACM_QLLK/blob/a7fa15b805e965a0aa9cbb87f617ee5abcae092e/docs/deployment/ACM_STAGE4C_GLOBAL_EVIDENCE_REGISTRY_G03_G05_G06_RFC_20261108.md) yêu cầu **một registry cấp mã toàn ACM**, bao phủ RC5 legacy và Stage4C; code bị hủy không tái sử dụng, case-insensitive ASCII, per-operation code, durable 365-day claim.
- **DBA quyết định thiết kế:** [Issue #11: G01–G10 DESIGN-APPROVED, G11 BLOCK](https://github.com/acmhtql-sys/ACM_QLLK/issues/11#issuecomment-6723126432). [Đối chiếu giới hạn quyết định](https://github.com/acmhtql-sys/ACM_QLLK/issues/11#issuecomment-6723281735): đây **không phải** chữ ký byte-exact final DDL, và reviewer DBA từng khai báo tham gia PR #37/chưa xác minh độc lập.
- **PG3 plan:** [Issue #13](https://github.com/acmhtql-sys/ACM_QLLK/issues/13) được DBA + AppSec đồng ý **kế hoạch** [#6723211306](https://github.com/acmhtql-sys/ACM_QLLK/issues/13#issuecomment-6723211306) / [#6723215003](https://github.com/acmhtql-sys/ACM_QLLK/issues/13#issuecomment-6723215003), nhưng [entry-gate clarification](https://github.com/acmhtql-sys/ACM_QLLK/issues/13#issuecomment-6723280747) yêu cầu final SQL/Prisma SHA + authority cho **các file thực thi cụ thể**. Identity PG1D đã bổ sung ở [#13 update](https://github.com/acmhtql-sys/ACM_QLLK/issues/13#issuecomment-6729485594).

**Quan sát cần DBA quyết định:** G01 ghi **“19→20 model trong một migration”** tại quyết định thiết kế, nhưng G03 lại yêu cầu thêm `evidence_code_registry`, G07 model QC độc lập và G09 incident/state machine. Như vậy **không được mặc định 20 model là tổng số model cuối**; cần bảng liệt kê mọi model/tables, mô tả liệu QC/Incident/registry là model độc lập hay đã được hợp nhất, và xác nhận số model chính xác trước khi tạo DDL. Đây là **gap trong việc cụ thể hóa thiết kế**, không phải phê duyệt tự ý tăng model.

## 3. Ma trận G01–G11: điều kiện hoàn tất thực sự

| ID | Thiết kế tại #11 | Artifact/chứng cứ phải có trước SQL/PG3 |
|---|---|---|
| G01 | DESIGN-APPROVED | Canonical `schema.prisma` duy nhất từ RC5 hiện hành; inventory 19-model baseline, tất cả model mới + quan hệ; **số model cuối cần DBA chốt**, một forward migration, guarded rollback |
| G02 | DESIGN-APPROVED | Custody `receivedBy` / `verifiedBy`, timestamp timezone, role+FK+CHECK `verifiedBy <> receivedBy`, audit chứng từ; không gán VERIFY = RECEIVE |
| G03 | DESIGN-APPROVED (Proposal A) | Registry global ASCII-case-insensitive, canonical được DB bảo đảm với `COLLATE "C"`, UNIQUE toàn namespace bao phủ RC5+Stage4C và CANCELLED forever; nguồn legacy và collision/backfill thủ công cần owner+DBA chốt; chống UPDATE/DELETE/claim tùy ý |
| G04 | DESIGN-APPROVED | Partial UNIQUE đúng `PREPARED` + `RECONCILIATION_REQUIRED`, 2-session PREPARE, lỗi DB `23505/P2002` → 409 chung, không lộ constraint hay mã |
| G05 | DESIGN-APPROVED | Durable `borrow+key` và canonical payload/actor/endpoint; giữ ≥365 ngày, độc lập TTL 24h, replay đúng receipt; receipt/claim không bị nhầm với idempotency cache |
| G06 | DESIGN-APPROVED | Composite FK `(returnTransactionId,borrowRequestId)` → `(id,borrowRequestId)`, UNIQUE đích, immutable COMMITTED receipt, once-only posting, non-destructive rollback |
| G07 | DESIGN-APPROVED | QC model per `ReturnDetail`, người phê duyệt QC độc lập; LOST phải có sự cố hợp lệ, không tạo RECEIVE giả |
| G08 | DESIGN-APPROVED | Quarantine-first atomic ledger; CHECK `reserved + quarantined + kitAllocated <= onHand`, không cộng tồn 2 lần khi QC release |
| G09 | DESIGN-APPROVED | State machine `ReturnDetail` – Incident – Asset; xử lý LOST/serial và audit tồn kho |
| G10 | DESIGN-APPROVED | Lock order chung RC5/Stage4C, transaction SERIALIZABLE, xử lý `40001/40P01/P2034`; không retry mù trạng thái COMMIT unknown |
| G11 | **BLOCK** | Identity PG17 đã PASS nhưng **chưa có** approved migration, PG17 catalog/drift, negative checks, two-session race, backup/restore, artifact hash và independent signoff |

## 4. Những điểm phải có trong **một** final review packet DBA (chưa tồn tại)

1. `schema.prisma` canonical G01–G10, **Git commit + file SHA-256**, bản diff so với RC5; không dùng SQL 2A/2B review-only làm migration.
2. **Forward SQL** và **guarded rollback SQL** tách riêng, mỗi file có SHA-256. Chỉ review ngoại tuyến; SQL thực thi chưa được phép. Rollback phải fail-closed khi tồn tại operation/receipt/registry đã cấp, không DROP dữ liệu hợp lệ.
3. Contract các bảng/constraints: registry global; provenance; chuẩn hóa ASCII `COLLATE "C"` + CHECK khớp `original_ref`; unique, partial unique, composite FK; trạng thái, delete/restrict, bất biến/tamper proof; transaction/writer error mapping.
4. Quyết định OWNER+DBA về `ReturnTransaction.returnNumber` lịch sử: có cùng namespace mã ACM không, inventory nguồn nào tin cậy, collision `ACM-001`/`acm-001` và CANCELLED, quy trình xử lý mà **không backfill tự động**.
5. Kế hoạch PG17 **synthetic-only**: database mục tiêu khác real/UAT, nguồn backup/restore, operator, khung thời gian, mã SHA mỗi artifact, approval DBA/AppSec cho đúng bytes + owner permission cấp riêng để chạy SQL/rollback.
6. Verification matrix: PostgreSQL catalog + Prisma drift; constraint negative controls; race 2 sessions; COMMIT exactly once; 409 không rò rỉ; backup/restore và registry anti-reissue; mọi kết quả fail phải STOP, không tự xóa hay restart cluster.

## 5. Quyết định hiện tại và công việc an toàn có thể tiến hành

**Được phép trong nhánh review riêng:** phân tích source, xây dựng danh mục model/DDL và thiết kế offline, kiểm tra SHA/commit, chuẩn bị report, chạy test thuần không chạm DB nếu đã audit và được duyệt, review GitHub Draft PR. **Chưa được phép:** chạy bất kỳ schema migration/DDL/DML/seed/concurrency-writer/rollback/restore nào trên PG17 hoặc môi trường khác, merge `main`, bật Stage4C router 503, hoặc sửa Render/Supabase.

**Ưu tiên reviewer:**
- OWNER + DBA: chốt namespace RC5 legacy và **model/table inventory cuối**; kiểm tra G01 mâu thuẫn giữa “20 model” và các model registry/QC/Incident thực sự.
- DBA: thiết kế FK/constraints/guards và tạo một bộ final schema + forward/guarded rollback **chỉ dưới dạng ứng viên review**, ghi đúng commit/file hashes; không dùng `prisma migrate deploy`.
- AppSec: xác minh generic 409, registry immutable, issuer anti-oracle/rate limit, role/IDOR và lỗi serialization.
- QA/Owner: xác nhận backup+restore synthetic-only, negative matrix, bằng chứng PG17 và signed execution gate tại #13.

**Dứt khoát chưa GO**: `PG1D_IDENTITY_PASS` không thay thế `G11`; `DESIGN-APPROVED` không thay thế phê duyệt DDL. Giữ `RELEASE_NO_GO`, `PG3_EXECUTION_HOLD`.
