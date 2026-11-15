# BÁO CÁO THẨM ĐỊNH AN TOÀN TOÀN TRÌNH, XÁC THỰC, PHÂN QUYỀN RBAC VÀ KỸ THUẬT PHÁT HÀNH ACM (TASK 02)

**Mã tài liệu:** `ACM-SEC-REVIEW-20261107-D8`  
**Vai trò thẩm định:** Chuyên gia Bảo mật Ứng dụng Cấp cao & Thẩm định Mã nguồn Fullstack TypeScript (Senior Application Security / TypeScript Fullstack Reviewer)  
**Nguyên tắc thẩm định:** **CHỈ RÀ SOÁT KỸ THUẬT (REVIEW-ONLY)**; kết quả là phát hiện kỹ thuật hỗ trợ bởi AI, **tuyệt đối không phải và không thay thế chữ ký phê duyệt của con người**.  
**Thời điểm rà soát (Review Timestamp):** 07/11/2026 20:45:00 (GMT+7) / `2026-11-07T13:45:00Z`  
**Kho mã nguồn (Repository):** `https://github.com/acmhtql-sys/ACM_QLLK`  
**Phán quyết phát hành:** **`RELEASE_NO_GO`** (Chưa đủ điều kiện phát hành sản phẩm)

---

## 1. ĐỐI CHIẾU NHÁNH, MÃ BĂM COMMIT & HIỆN TRẠNG MÃ NGUỒN

### 1.1 Bảng đối chiếu mã băm (Commit Hash Inventory)

| Tên nhánh / Đối tượng kiểm toán | Loại tham chiếu | Mã băm Commit HEAD tại thời điểm rà soát | Điểm rẽ nhánh cơ sở (Merge Base) | Quan hệ xếp chồng (Stacking Relationship) |
| :--- | :---: | :--- | :--- | :--- |
| **`origin/main`** | Nhánh chính (Production) | `375947d0f2e65faf335f0279e12e6daa7be9ac4f` | `375947d...` | Đang đóng băng (Frozen). |
| **Draft PR #39** (`codex/p3-staging-readonly-deployment-20261107`) | Pull Request | `98b65cdb0f297ffa2c46a6008f4e983580707274` | `origin/main` | Rẽ trực tiếp từ `main`. Triển khai Staging Read-Only fail-closed và chặn nén body. |
| **Draft PR #40** (`codex/p3g-zod4-compat-probe-20261107`) | Pull Request | `2e7de43b5ee4439f0346a95b5dc8667639376bb9` | PR #39 (`98b65cd...`) | Xếp chồng trên PR #39. Di chuyển Zod 3 $\to$ Zod 4 và củng cố máy trạng thái Idempotency FSM. |
| **Draft PR #41** (`codex/p3h-toolchain-security-probe-20261107`) | Pull Request (HEAD rà soát) | `86256929fd250954eb840c26ae61a53e7263e900` | PR #40 (`2e7de43...`) | Xếp chồng trên PR #40. Vá phụ thuộc chuỗi cung ứng (qs, postcss, vitest) và tài liệu D8. |
| **Nhánh Staging Render** (`codex/cloud-staging-p2e-readonly-deploy-20261107`) | Backend Live Staging | `9d0e797116c72e65dd86e0fe7c5652d815851864` | `origin/main` | **PHÂN KỲ ĐỘC LẬP**: Chứa 35 commits (bao gồm RC1-RC5 và `render.yaml`), nhưng thiếu Zod 4 và toolchain PR #41. |

### 1.2 Phân tích Phân kỳ Nhánh & Nguy cơ Hợp nhất Trùng lặp (Stacked Diff & Release Drift Analysis)
1. **Phân kỳ giữa Staging Render và Chùm PR #39 $\to$ #40 $\to$ #41:**
   - Nhánh Render Staging (`cloud-staging-p2e-readonly-deploy-20261107`) được rẽ từ `main` nhưng tích hợp toàn bộ các tính năng hoàn chỉnh của dòng RC (Release Candidates RC1 đến RC5 tại commit `ab9bb67`), bao gồm Categories CRUD, AI Camera Return, Kit Locations, và cấu hình `render.yaml` khóa cứng dịch vụ Render Free.
   - Ngược lại, Draft PR #39 được tạo trực tiếp từ `main` cũ (`375947d`), **hoàn toàn bỏ qua các commit của RC1-RC5**. Chùm PR #40 và #41 kế thừa trực tiếp từ PR #39.
   - **CẢNH BÁO NGUY CƠ PHÁT HÀNH (RELEASE DRIFT HAZARD):** Nếu kỹ sư tiến hành merge chùm PR #41 $\to$ #40 $\to$ #39 vào `main`, nhánh `main` sẽ bị mất sạch toàn bộ các bản vá và chức năng nghiệp vụ của RC1-RC5! Nếu triển khai Render từ PR #41, Render sẽ mất tệp cấu hình Blueprint `render.yaml`. Ngược lại, nếu chỉ giữ nhánh Render, hệ thống sẽ thiếu bản vá Zod 4 và các bản vá chuỗi cung ứng npm của PR #41.
2. **Khuyến nghị Kỹ thuật Phát hành:** Bắt buộc phải có một bước đồng bộ và tái cơ sở (rebase/consolidate) giữa RC5 và chùm PR #39-#41 trước khi tính đến bất kỳ kế hoạch hợp nhất nào vào `main`.

---

## 2. BẢNG TỔNG HỢP PHÁT HIỆN LỖI KỸ THUẬT & AN TOÀN (FINDINGS MATRIX)

Phân loại theo mức độ: **P0 (Lỗ hổng Chặn phát hành / Rò rỉ dữ liệu)**, **P1 (Rủi ro Nghiệp vụ / Phân quyền nghiêm trọng)**, **P2 (Thiếu sót Kiến trúc / Chuỗi cung ứng)**, **P3 (Tối ưu hóa mã nguồn)**.

| Mã lỗi (ID) | Mức độ | Tệp tin & Dòng (File:line) | Bằng chứng kỹ thuật (Proof) | Kịch bản khai thác / Lạm dụng (Abuse Scenario) | Biện pháp khắc phục khuyến nghị (Remediation) | Kiểm thử chứng minh (Test Proof) | Cổng phát hành liên đới |
| :---: | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **SEC-01** | **P0** | `apps/web/src/hooks/useAuth.tsx:43-52` & `apps/web/src/services/api.ts:20-25` | Mã JWT và thông tin người dùng được lưu trữ trong `localStorage` (`acm_token`, `acm_user`). | Nếu trang web có lỗ hổng XSS (hoặc tiện ích mở rộng trình duyệt độc hại), kẻ tấn công có thể thực thi `localStorage.getItem('acm_token')` để đánh cắp phiên đăng nhập vĩnh viễn. | Chuyển sang cơ chế xác thực dựa trên Cookie có cờ `HttpOnly`, `SameSite=Strict`, `Secure` để ngăn JavaScript truy cập mã thông báo trực tiếp. | Kiểm thử trình duyệt: JavaScript phía máy khách không thể truy cập document.cookie hoặc localStorage token. | Chặn Cổng #15 (D8-REL5) |
| **SEC-02** | **P0** | `apps/api/src/modules/borrow/borrow.service.ts:562-588` | Lỗi hư hỏng sổ cái tồn kho khi trả hàng chéo vị trí: `Math.min(bal.borrowed, qty)` tại vị trí trả khác vị trí mượn khiến số lượng mượn tại vị trí mượn gốc không bao giờ giảm. | Kỹ thuật viên mượn 4 bo mạch tại Kho A (`A.borrowed = 4`). Sinh viên trả tại Kệ B (`B.borrowed = 0`). `min(0,4) = 0`. Kho A vĩnh viễn kẹt `borrowed = 4`, tổng số mượn toàn hệ thống bị tăng khống vô căn cứ. | Bắt buộc truy vấn vị trí mượn ban đầu từ `StockReservation` hoặc phiếu xuất kho để trừ đúng `borrowed` tại kho nguồn gốc trước khi cộng `onHand` tại kho đích. | Kiểm thử đơn vị & tích hợp: Mượn tại Kho A, trả tại Kệ B; xác minh `A.borrowed = 0` và `B.onHand` tăng 4. | Chặn Cổng #14 (D8-WR7) & #15 |
| **SEC-03** | **P0** | `apps/api/src/modules/borrow/borrow.service.ts:418-445` | Thao tác hoàn trả không sử dụng khóa dòng `SELECT ... FOR UPDATE` khi đọc số lượng đã trả. | Kẻ xấu hoặc mạng chậm kích hoạt 2 request `POST /return` song song. Cả 2 cùng đọc `returnedQuantity = 0`, cùng xác thực hợp lệ và cùng gửi lệnh tăng số lượng, gây lỗi 500 hoặc sai lệch số dư. | Bổ sung câu lệnh khóa dòng cưỡng bức `SELECT ... FOR UPDATE` trong transaction của Prisma hoặc triển khai khóa lạc quan (Optimistic Concurrency). | Kiểm thử 2 phiên PostgreSQL đồng thời gửi cùng 1 payload trả linh kiện; 1 phiên thành công, 1 phiên nhận 409 hoặc chờ khóa. | Chặn Cổng #13 (D8-PG3) & #14 |
| **SEC-04** | **P1** | `apps/api/src/modules/borrow/borrow.router.ts:168-195` | Endpoint `POST /api/v1/borrow-requests/:id/return` hoàn toàn thiếu bảo vệ Idempotency (không tiếp nhận header `Idempotency-Key`). | Mạng rớt giữa chừng (HTTP 504) sau khi DB đã commit. Máy khách gửi lại request sẽ nhận HTTP 400 và không lấy lại được mã chứng từ trả hàng (`returnNumber`). | Tích hợp middleware `idempotency` yêu cầu header `Idempotency-Key` và lưu kết quả giao dịch vào bảng `idempotency_records`. | Kiểm thử mô phỏng mạng rớt sau khi commit; gửi lại cùng key trả về đúng mã chứng từ cũ và HTTP 200. | Chặn Cổng #14 (D8-WR7) |
| **SEC-05** | **P1** | `package.json` & `apps/web/package.json` | Gói `react-router` và `react-router-dom` (phiên bản 6.x) còn tồn đọng cảnh báo bảo mật mức Độ trung bình (Moderate Advisories) chưa được nâng cấp. | Rủi ro liên quan đến xử lý định tuyến mở (Open Redirect) hoặc CSRF trong các luồng điều hướng SPA cũ. | Chuyên gia bảo mật / Chủ dự án phải xem xét chấp nhận rủi ro có văn bản, hoặc lập kế hoạch di chuyển có cô lập lên React Router v7. | Kiểm tra `npm audit` ghi nhận xác nhận chấp thuận rủi ro đối với các cảnh báo Moderate. | Chặn Cổng #15 (D8-REL5) |
| **SEC-06** | **P1** | `apps/api/src/modules/items/items.router.ts:25-50` | Sự khác biệt trong hợp đồng đọc catalog giữa `cloud_staging` (bắt buộc đăng nhập 401) và `local_dev` (cho phép đọc ẩn danh). | Người dùng ngoài có thể quét toàn bộ danh mục linh kiện, tồn kho và mã vạch trong môi trường cục bộ/demo nếu không bật cờ `cloud_staging`. | Thống nhất chính sách phân quyền: Đọc tồn kho chi tiết phải yêu cầu đăng nhập ở mọi môi trường; chỉ thông tin sản phẩm công khai mới cho đọc ẩn danh. | Kiểm thử gọi GET `/items` không có Bearer token trả về đúng 401 trên mọi profile có dữ liệu nhạy cảm. | Chặn Cổng #15 (D8-REL5) |
| **SEC-07** | **P2** | `packages/shared/src/validators.ts:41-450` | Việc thay đổi từ `.uuid()` sang `.guid()` trong Zod 4 chấp nhận cả các định dạng GUID mở rộng (như có dấu ngoặc nhọn hoặc chữ hoa). | Nếu client gửi GUID không chuẩn RFC 4122, Zod 4 chấp thuận nhưng khi đẩy vào cột `id uuid` của PostgreSQL sẽ kích hoạt ngoại lệ định dạng CSDL. | Bổ sung hàm regex chuẩn hóa hoặc duy trì kiểm tra UUID RFC 4122 nghiêm ngặt trước khi chuyển vào tầng cơ sở dữ liệu. | Kiểm thử gửi chuỗi GUID có dấu ngoặc `{...}` qua API; đảm bảo hệ thống chuẩn hóa hoặc từ chối rõ ràng tại tầng xác thực. | Chặn Cổng #15 (D8-REL5) |
| **SEC-08** | **P2** | `docs/deployment/ACM_D8_RELEASE_READINESS_GO_NO_GO_20261107.md:75-92` | Gói dịch vụ miễn phí (Render Free + Supabase Free) tiềm ẩn rủi ro ngừng hoạt động (Sleep sau 15p, Cold start 90s, Pause sau 7 ngày, không có sao lưu tự động). | Người dùng thực tế truy cập bị nghẽn mạng do cold start; rủi ro mất dữ liệu hoàn toàn do không có Point-in-Time Recovery khi xảy ra lỗi vận hành. | Xây dựng script sao lưu ngoại vi tự động (`pg_dump` mã hóa đẩy về S3/Google Cloud) tối thiểu 6 giờ/lần trước khi cho người dùng thật sử dụng. | Diễn tập khôi phục (Restore drill) thành công từ bản dump ngoại vi sang một database cô lập. | Chặn Cổng #15 (D8-REL5) |

---

## 3. ĐÁNH GIÁ CHI TIẾT 8 HẠNG MỤC AN TOÀN BẮT BUỘC

### 3.1 Hạng mục 1: Xác thực & Quản lý Phiên (Authentication & Sessions)
**Trạng thái kiểm chứng:** **`PARTIAL` (Đạt một phần, còn lỗ hổng lưu trữ token)**

1. **Khắc phục lỗi Đăng nhập Ngoại tuyến (Offline Mock Admin):**
   - **Xác minh mã nguồn:** Tệp [`LoginPage.tsx:28-35`](file:///d:/ACM_QLLK/apps/web/src/pages/LoginPage.tsx#L28-L35) đã loại bỏ hoàn toàn cơ chế fallback tạo phiên đăng nhập Admin giả lập khi mất mạng. Khối `catch` hiện tại áp dụng nguyên tắc **Fail-Closed**: Mọi lỗi mạng (`ECONNABORTED`, `ETIMEDOUT`) đều trả về thông báo lỗi, tuyệt đối không tạo phiên làm việc cục bộ.
   - **Thu hồi Token giả mạo cũ:** Tệp [`useAuth.tsx:28-34`](file:///d:/ACM_QLLK/apps/web/src/hooks/useAuth.tsx#L28-L34) chủ động kiểm tra `localStorage.getItem('acm_token') === 'mock-jwt-token-foundation-phase1'`. Nếu phát hiện, hệ thống tự động xóa sạch token và thông tin người dùng, buộc quay về trang đăng nhập.
2. **Xác thực JWT & Bảo vệ Mật khẩu tại Backend:**
   - [`auth.ts:36-58`](file:///d:/ACM_QLLK/apps/api/src/middleware/auth.ts#L36-L58): Xác thực chữ ký và thời hạn bằng `jwt.verify(token, env.JWT_SECRET)`.
   - **Chống leo thang đặc quyền qua Token cũ (Stale Role Tampering):** Middleware `authenticate` bắt buộc truy vấn lại người dùng trong CSDL (`prisma.user.findUnique`) và gán lại `req.user.role = user.role`. Nếu một sinh viên sửa payload JWT để khai man quyền `ADMIN`, hệ thống sẽ ghi đè lại bằng vai trò thực tế từ CSDL.
   - **Kiểm soát trạng thái tài khoản:** Tài khoản bị `isActive = false` trả về 403; tài khoản bị `isLocked = true` trả về 403.
   - **Bảo mật mật khẩu:** Tệp [`users.router.ts:98`](file:///d:/ACM_QLLK/apps/api/src/modules/users/users.router.ts#L98) sử dụng `bcrypt.hash(password, 12)` với 12 vòng muối. Mật khẩu và mã băm mật khẩu hoàn toàn bị loại khỏi danh sách truy vấn (`publicUserSelect`), không bao giờ bị trả về client.
3. **Điểm yếu còn tồn tại:**
   - Mã JWT vẫn đang được lưu trữ trong `localStorage` của trình duyệt ([`SEC-01`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuật--an-toàn-findings-matrix)), tiềm ẩn nguy cơ bị chiếm đoạt nếu có lỗ hổng XSS.

---

### 3.2 Hạng mục 2: Phân quyền & Chống Khai thác IDOR (RBAC / IDOR)
**Trạng thái kiểm chứng:** **`VERIFIED` (Đã xác minh đầy đủ trên mã nguồn)**

1. **Phân quyền Báo cáo & Kiểm toán (ADMIN-only):**
   - Báo cáo tổng hợp: [`reports.router.ts:12`](file:///d:/ACM_QLLK/apps/api/src/modules/reports/reports.router.ts#L12) áp dụng `authenticate, authorizeRoles(UserRole.ADMIN)`.
   - Nhật ký kiểm toán: [`audit-logs.router.ts:12`](file:///d:/ACM_QLLK/apps/api/src/modules/audit-logs/audit-logs.router.ts#L12) áp dụng `authenticate, authorizeRoles(UserRole.ADMIN)`.
   - Các vai trò `LAB_MANAGER`, `TECHNICIAN`, `STUDENT` khi cố tình gọi API này đều nhận về HTTP 403 Forbidden.
2. **Kiểm soát Người dùng Tự hủy Phiếu Mượn (STUDENT Scope & IDOR Prevention):**
   - Tại [`borrow.service.ts:318-335`](file:///d:/ACM_QLLK/apps/api/src/modules/borrow/borrow.service.ts#L318-L335):
     ```typescript
     if (currentUser.role === UserRole.STUDENT) {
       if (req.borrowerId !== currentUser.id) {
         throw new AppError('Bạn không có quyền hủy phiếu mượn của người khác', 403);
       }
       if (req.status !== BorrowStatus.PENDING) {
         throw new AppError('Sinh viên chỉ có thể hủy phiếu mượn khi ở trạng thái PENDING', 400);
       }
     }
     ```
   - Sinh viên hoàn toàn bị chặn nếu cố tình truyền `id` phiếu mượn của sinh viên khác (IDOR bị triệt tiêu).
   - Sinh viên không thể hủy phiếu đã được duyệt (`APPROVED`) hoặc đã bàn giao (`HANDED_OVER`).
   - Vai trò `TECHNICIAN` không có quyền hủy phiếu (bị ném lỗi 403). Chỉ `ADMIN` và `LAB_MANAGER` mới có quyền can thiệp hủy phiếu của người khác.
3. **Phân quyền Xem Danh sách Phiếu Mượn:**
   - Tại [`borrow.service.ts:664-670`](file:///d:/ACM_QLLK/apps/api/src/modules/borrow/borrow.service.ts#L664-L670): Nếu `currentUser.role === UserRole.STUDENT`, câu truy vấn CSDL tự động ép điều kiện `where.borrowerId = currentUser.id`. Sinh viên không thể dùng query param để xem trộm danh sách mượn của người khác.
4. **Phòng chống Tự hạ quyền Quản trị (Admin Self-Demotion / Lockout):**
   - Tại [`users.router.ts:133-135`](file:///d:/ACM_QLLK/apps/api/src/modules/users/users.router.ts#L133-L135): `if (idParsed.data === req.user?.id && data.role && data.role !== UserRole.ADMIN) throw new AppError('Không thể tự hạ quyền quản trị của chính mình', 400);`.
   - Ngăn chặn triệt để nguy cơ Admin tự vô hiệu hóa hoặc hạ quyền dẫn đến hệ thống mất quyền quản trị tối cao.

---

### 3.3 Hạng mục 3: Cơ chế Chống Ghi Đóng Kín trên Cloud Staging (Read-Only Fail-Closed Staging)
**Trạng thái kiểm chứng:** **`VERIFIED` (Đã xác minh đầy đủ về mặt logic phần mềm)**

1. **Nguyên tắc Bất biến Fail-Closed:**
   - [`cloudStagingReadOnly.ts:46-55`](file:///d:/ACM_QLLK/apps/api/src/middleware/cloudStagingReadOnly.ts#L46-L55): Khi `ACM_DEPLOYMENT_PROFILE === 'cloud_staging'`, cấu hình hệ thống tự động ép buộc `readOnly = 'true'`. Tuyệt đối không có bất kỳ tham số nào (kể cả gọi hàm test) có thể làm suy yếu hoặc mở ghi trên Cloud Staging.
   - Toàn bộ các phương thức thay đổi dữ liệu (`POST`, `PUT`, `PATCH`, `DELETE`) bị chặn đứng với mã lỗi **HTTP 403 Forbidden** và mã lỗi `STAGING_READ_ONLY_BLOCKED`.
2. **Chống Vượt rào bằng Ghi đè Phương thức (Method-Override Spoofing):**
   - [`securityPolicy.ts:208-223`](file:///d:/ACM_QLLK/apps/api/src/config/securityPolicy.ts#L208-L223): Hàm `extractEffectiveHttpMethod` kiểm tra và phát hiện toàn bộ các header giả mạo như `X-HTTP-Method-Override`, `X-Method-Override`, `X-HTTP-Method` và query parameter `_method`. Nếu kẻ tấn công gửi request `GET /api/v1/items/1` kèm header `X-HTTP-Method-Override: DELETE`, hệ thống nhận diện phương thức hiệu lực là `DELETE` và lập tức chặn với mã 403.
3. **Phát hiện URL Encoding và Path Traversal Bypass:**
   - [`securityPolicy.ts:195-203`](file:///d:/ACM_QLLK/apps/api/src/config/securityPolicy.ts#L195-L203): Hàm `isAmbiguousOrTraversedPath` quét các mẫu bất thường như `//`, `/./`, `..`, `%`, `\` hoặc dấu gạch chéo cuối URL. Nếu phát hiện URL có dấu hiệu mã hóa để né bộ lọc (ví dụ: `%2Fauth%2Flogin`), ngoại lệ đăng nhập sẽ bị vô hiệu hóa ngay lập tức và chặn bằng 403.
4. **Kiểm soát Nén Body (Zip-bomb / Body-parser DoS Mitigation):**
   - [`app.ts:27-28`](file:///d:/ACM_QLLK/apps/api/src/app.ts#L27-L28): `express.json({ inflate: false, limit: '100kb' })`.
   - Nếu client cố ý gửi body đã nén (`Content-Encoding: gzip`), `body-parser` sẽ từ chối giải nén và [`errorHandler.ts:22-27`](file:///d:/ACM_QLLK/apps/api/src/middleware/errorHandler.ts#L22-L27) phản hồi mã **HTTP 415 Unsupported Media Type**, ngăn chặn triệt để nguy cơ tấn công từ chối dịch vụ làm cạn kiệt CPU.
5. **Cấu hình Đăng nhập Ngoại lệ trên Blueprint:**
   - Trong `render.yaml` trên nhánh Render, biến `ALLOW_STAGING_AUTH_LOGIN` được đặt cứng là `"false"`. Khi biến này là `"false"`, ngay cả endpoint `POST /api/v1/auth/login` cũng bị chặn 403, đưa toàn bộ hệ thống Staging về trạng thái bất khả xâm phạm tuyệt đối.

---

### 3.4 Hạng mục 4: Tương thích Ngữ nghĩa Zod 4 (Zod4 Semantic Compatibility)
**Trạng thái kiểm chứng:** **`PARTIAL` (Cần lưu ý kiểm tra tương thích kiểu UUID CSDL)**

1. **Chuyển đổi cú pháp từ Zod 3 sang Zod 4:**
   - Thay thế cú pháp thông báo lỗi cũ: `{ required_error: '...', invalid_type_error: '...' }` chuyển thành `{ error: '...' }` đồng nhất trên toàn bộ [`validators.ts`](file:///d:/ACM_QLLK/packages/shared/src/validators.ts).
   - Bộ kiểm thử [`validators.test.ts`](file:///d:/ACM_QLLK/packages/shared/src/validators.test.ts) thực thi đạt 100% không có cảnh báo thoái lui (regression).
2. **Đánh giá rủi ro khi dùng `.guid()` thay cho `.uuid()` ([`SEC-07`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuạt--an-toàn-findings-matrix)):**
   - Trong Zod 3, `.uuid()` yêu cầu nghiêm ngặt định dạng chuỗi 36 ký tự theo chuẩn RFC 4122.
   - Trong Zod 4, việc lựa chọn phương thức `.guid()` cho phép chấp nhận các định dạng GUID linh hoạt hơn. Tuy nhiên, bảng CSDL PostgreSQL định nghĩa kiểu trường là `UUID` gốc (16 byte nhị phân). Nếu một GUID chứa định dạng lạ (ví dụ: bọc trong `{...}`) vượt qua được tầng Zod 4, tầng Prisma/PostgreSQL sẽ ném lỗi định dạng dữ liệu (Data Exception). Cần kiểm thử hồi quy để đảm bảo các chuỗi ID gửi từ Frontend luôn tuân thủ chuẩn UUID không dấu ngoặc.

---

### 3.5 Hạng mục 5: Cơ chế Idempotency trong Giao dịch Kho (Stock Transaction Idempotency)
**Trạng thái kiểm chứng:** **`VERIFIED` (Đã kiểm chứng máy trạng thái FSM tại Frontend; Backend cần bổ sung cho Return)**

1. **Xử lý Mạng chập chờn (HTTP 504 Gateway Timeout):**
   - Tại [`useIdempotentTransaction.ts:380-395`](file:///d:/ACM_QLLK/apps/web/src/hooks/useIdempotentTransaction.ts#L380-L395): Khi gặp lỗi 504 hoặc timeout mạng, hàm `retryAmbiguous` **chặn tuyệt đối việc phát lại lệnh POST lần thứ hai**:
     *"Cấm phát lại Stock POST khi trạng thái commit chưa rõ. Phải kiểm tra trạng thái Idempotency (GET) trước."*
   - Phiên làm việc lập tức rơi vào trạng thái `AMBIGUOUS_OUTCOME` và bị khóa cứng giao diện.
2. **Khóa bền vững và Lưu trữ Phiên Bất định:**
   - Dữ liệu giao dịch bất định được ghi nhận vào `sessionStorage` và `Map` bộ nhớ. Người dùng không thể né tránh khóa bằng cách đóng modal hay tải lại trang (F5). Khi mở lại modal, hệ thống quét storage và tự động khôi phục trạng thái khóa `AMBIGUOUS_OUTCOME`.
3. **Cấm Mở khóa Thủ công Bằng Dữ liệu Phía Client:**
   - Hàm `resolveReconciliation` ([`useIdempotentTransaction.ts:415-428`](file:///d:/ACM_QLLK/apps/web/src/hooks/useIdempotentTransaction.ts#L415-L428)) đã bị vô hiệu hóa việc mở khóa bằng client notes/token:
     *"Chức năng giải phóng đối soát thủ công từ giao diện người dùng đã bị vô hiệu hóa vì lý do an toàn. Dữ liệu nhập từ Client không được coi là bằng chứng có thẩm quyền."*
   - Chỉ duy nhất kết quả tra cứu `GET /api/v1/inventory/idempotency/check/:key` có xác nhận thành công từ máy chủ mới được phép giải phóng khóa.
4. **Điểm yếu còn tồn tại tại Backend:**
   - Bộ ghi xuất nhập kho (`stock-transactions`) đã có Idempotency đầy đủ, nhưng **bộ ghi hoàn trả linh kiện (`borrow-requests/:id/return`) hoàn toàn chưa được tích hợp Idempotency** ([`SEC-04`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuật--an-toàn-findings-matrix)).

---

### 3.6 Hạng mục 6: An toàn Chuỗi Cung ứng & Kiểm toán CI (Supply-Chain / CI)
**Trạng thái kiểm chứng:** **`PARTIAL` (0 High/Critical, còn tồn đọng Moderate React Router)**

1. **Vá các lỗ hổng Nghiêm trọng & Cao (High / Critical Vulnerabilities Eliminated):**
   - Commit `4177127` và `93edf4d` trong PR #41 đã cập nhật và khóa phiên bản an toàn cho: `qs`, `postcss-selector-parser`, `vitest`, `vite`, `undici`, `body-parser`, `follow-redirects`.
   - Kết quả quét `npm audit` ghi nhận: **0 Critical, 0 High**.
2. **Cảnh báo Moderate còn tồn đọng ([`SEC-05`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuạt--an-toàn-findings-matrix)):**
   - Các gói `react-router` và `react-router-dom` (v6.x) còn cảnh báo bảo mật mức Trung bình. Việc nâng cấp lên v7 đòi hỏi thay đổi lớn về mặt kiến trúc định tuyến và cần quá trình kiểm thử hồi quy độc lập. Chuyên gia bảo mật và Chủ dự án cần ký chấp thuận rủi ro có kiểm soát đối với các cảnh báo này trước khi phát hành.
3. **Cô lập Mạng trong Luồng CI Playwright:**
   - Tệp [`.github/workflows/p3g-mock-browser-e2e.yml`](file:///d:/ACM_QLLK/.github/workflows/p3g-mock-browser-e2e.yml) thiết lập biến môi trường cục bộ:
     `VITE_API_BASE_URL: http://127.0.0.1:4174/api/v1`.
   - Toàn bộ các ca kiểm thử E2E của Playwright chạy trên máy chủ giả lập nội bộ (Local Mock Server). Trình duyệt Playwright **hoàn toàn không có quyền và không thể kết nối tới Render hay Supabase**, không sử dụng bất kỳ secret nào của môi trường thật. Kết quả xanh của CI này chỉ chứng minh tính đúng đắn của logic giao diện, không được coi là nghiệm thu tầng dữ liệu CSDL.

---

### 3.7 Hạng mục 7: Kỹ thuật Triển khai & Vận hành Đám mây (Deployment & Operations)
**Trạng thái kiểm chứng:** **`BLOCKED` (Hạ tầng Free Tier không đạt chuẩn Production)**

1. **Cấu hình CORS Nghiêm ngặt:**
   - Hàm `isValidCloudCorsOrigin` ([`securityPolicy.ts:88-144`](file:///d:/ACM_QLLK/apps/api/src/config/securityPolicy.ts#L88-L144)) từ chối ký tự đại diện `*`, từ chối `localhost/127.0.0.1` trên môi trường đám mây, bắt buộc giao thức `https://` và tên miền hợp lệ. Cấu hình Render `CORS_ORIGIN` phải khớp chính xác với URL Vercel (không có dấu gạch chéo cuối).
2. **Giới hạn của Gói Dịch vụ Miễn phí (Free Tier Operational Viability):**
   - **Render Free Web Service:** Bị ép ngủ sau 15 phút không hoạt động; thời gian khởi động lại mất từ 50 đến 90 giây; hệ thống tệp tin là tạm thời (ephemeral), không có ổ đĩa lưu trữ cố định.
   - **Supabase Free Database:** Không hỗ trợ sao lưu Point-in-Time Recovery (PITR); không có sao lưu tự động hàng ngày độc lập; tự động tạm dừng dịch vụ sau 7 ngày không truy cập.
   - **Đánh giá rủi ro:** RPO và RTO hoàn toàn phụ thuộc vào việc sao lưu thủ công bằng script của kỹ sư vận hành. Đây là môi trường rủi ro cao, không thể sử dụng cho dữ liệu nghiệp vụ thật của trường/viện mà không có giải pháp sao lưu lạnh ngoại vi độc lập ([`SEC-08`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuạt--an-toàn-findings-matrix)).

---

### 3.8 Hạng mục 8: Ranh giới Thẩm quyền & Các Cổng Phát hành D8 (Authorization Boundaries)
**Trạng thái kiểm chứng:** **`BLOCKED` (Toàn bộ các cổng con người đang ở trạng thái HOLD)**

1. **Kiểm tra trạng thái GitHub Issues trực tiếp:**
   - **Issue #11 (Chính sách Chứng từ & DDL):** `OPEN` / `HOLD`. Chưa có chữ ký phê duyệt nghiệp vụ và DBA.
   - **Issue #12 (Phê duyệt tạo PG17 cô lập):** `OPEN` / `HOLD`. Chưa có 2 phê duyệt từ 2 người thật độc lập.
   - **Issue #13 (Migration / Concurrency CSDL thật):** `OPEN` / `HOLD`. Chưa có cluster và chưa được cấp quyền chạy SQL.
   - **Issue #14 (Bộ ghi Return Writer thật):** `OPEN` / `HOLD`. Chưa có mã nguồn adapter CSDL kết nối Prisma.
   - **Issue #15 (Phán quyết phát hành Release):** `OPEN` / `HOLD` $\implies$ **`RELEASE_NO_GO`**.
2. **Hiện trạng Tìm kiếm Chuyên gia (Issue #42):**
   - Issue #42 ghi nhận rõ ràng: *Cả Reviewer A (DBA) và Reviewer B (Security) đều đang ở trạng thái CHƯA CÓ (PENDING)*.
   - **Nguyên tắc bất biến:** Một kết quả CI xanh (CI #280 PASS) hoặc kết quả kiểm toán 0 High/Critical từ AI **tuyệt đối không tương đương với một sự phê duyệt (Approval) của con người**. AI không có tư cách pháp lý hay thẩm quyền chịu trách nhiệm để ký phát hành hệ thống.

---

## 4. BẢNG KIỂM TRA ĐIỀU KIỆN PHÁT HÀNH (RELEASE-READY CHECKLIST)

### 4.1 Rào cản Kỹ thuật Cốt lõi (Technical Blockers)
- [ ] **[P0] Khắc phục lỗi Sổ cái Trả hàng chéo vị trí ([`SEC-02`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuạt--an-toàn-findings-matrix)):** Sửa đổi logic `borrow.service.ts` để trừ đúng `borrowed` tại kho xuất gốc.
- [ ] **[P0] Khắc phục Tranh chấp thiếu Khóa dòng ([`SEC-03`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuạt--an-toàn-findings-matrix)):** Triển khai khóa dòng `SELECT ... FOR UPDATE` trong transaction hoàn trả linh kiện.
- [ ] **[P0] Lập trình Database Adapter cho D8 Return Writer ([`Issue #14`](https://github.com/acmhtql-sys/ACM_QLLK/issues/14)):** Hiện thực hóa giao diện `borrow.return-writer.contract.ts` kết nối với Prisma Client thật.
- [ ] **[P1] Tích hợp Idempotency cho Endpoint Trả hàng ([`SEC-04`](#2-bảng-tổng-hợp-phát-hiện-lỗi-kỹ-thuạt--an-toàn-findings-matrix)):** Bắt buộc `Idempotency-Key` cho route `POST /borrow-requests/:id/return`.
- [ ] **[P1] Đồng bộ Phân kỳ Nhánh Git (Git Branch Drift Reconciliation):** Tái cơ sở (rebase) hợp nhất các bản vá bảo mật của chùm PR #39-#41 với nhánh RC5 trước khi đưa vào kiểm thử phát hành.
- [ ] **[P2] Xây dựng Đường ống Sao lưu Ngoại vi (Offsite Backup Pipeline):** Thiết lập cronjob chạy `pg_dump` mã hóa đẩy về dịch vụ lưu trữ ngoài để đảm bảo RPO $\le$ 6 giờ.

### 4.2 Rào cản Phi Kỹ thuật & Thủ tục Con người (Non-Technical & Procedural Blockers)
- [ ] **[Thủ tục] Bổ nhiệm 2 Chuyên gia Độc lập (Issue #42):** Xác định danh tính 1 DBA và 1 Security Reviewer con người ngoài đời thực có năng lực chuyên môn để thẩm định hệ thống.
- [ ] **[Thủ tục] Quyết định của Chủ phòng Lab về Mã Chứng từ (Issue #11):** Chủ dự án ký duyệt bằng văn bản về định dạng Regex mã vạch và chính sách không tái sử dụng mã sau khi hủy.
- [ ] **[Thủ tục] Hai Phê duyệt Độc lập bằng Văn bản cho Cổng #12:** Thu thập xác nhận từ Chủ dự án và Chuyên gia kỹ thuật độc lập trước khi cho phép tạo cụm PostgreSQL trên cổng 55433.
- [ ] **[Thủ tục] Diễn tập Khôi phục Dữ liệu (Restore Drill):** Operator thực hiện diễn tập khôi phục bản sao lưu trên CSDL cô lập và ký biên bản nghiệm thu trước sự chứng kiến của DBA.
- [ ] **[Thủ tục] Ký duyệt Phát hành Chính thức (Issue #15):** Toàn bộ các bên liên quan ký văn bản nghiệm thu UAT 4 vai trò và chấp thuận đưa hệ thống vào sử dụng.

---

## 5. KẾT LUẬN THẨM ĐỊNH KỸ THUẬT & PHÁN QUYẾT CUỐI CÙNG

```
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|                       TECHNICAL REVIEW ONLY — NO INDEPENDENT HUMAN APPROVAL                        |
|                                                                                                    |
|                                        RELEASE_NO_GO                                               |
|                                                                                                    |
|  1. Hệ thống ACM đã đạt được những tiến bộ bảo mật quan trọng (Fail-closed Staging Read-Only,      |
|     loại bỏ Offline Mock Login, loại bỏ 100% lỗ hổng High/Critical chuỗi cung ứng npm).            |
|  2. Tuy nhiên, hệ thống VẪN BỊ CHẶN PHÁT HÀNH do còn tồn tại 3 lỗi kỹ thuật mức P0 trong bộ ghi     |
|     hoàn trả linh kiện (hư hỏng sổ cái kho khi trả khác vị trí, thiếu khóa dòng tranh chấp,        |
|     và thiếu Database Adapter kết nối CSDL thật cho Stage4C).                                     |
|  3. Về mặt quản trị phát hành, toàn bộ các Cổng kiểm soát từ #11 đến #15 và #42 đang mở (HOLD)    |
|     và chưa có bất kỳ chữ ký phê duyệt nào của con người.                                         |
|  4. TUYỆT ĐỐI KHÔNG mở cờ ghi (giữ nguyên STAGING_READ_ONLY=true, ALLOW_STAGING_AUTH_LOGIN=false).  |
|  5. TUYỆT ĐỐI KHÔNG hợp nhất vào nhánh main hoặc triển khai phục vụ người dùng thực tế.            |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---
*Báo cáo được thực hiện bởi Senior Application Security & Fullstack Reviewer.*  
*Chữ ký kỹ thuật: `ACM_FULLSTACK_SECURITY_REVIEW_VERIFIED_NO_GO`*
