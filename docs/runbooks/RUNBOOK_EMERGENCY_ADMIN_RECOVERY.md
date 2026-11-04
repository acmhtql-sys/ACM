# RUNBOOK: Emergency Administrator Account Recovery (Break-Glass)

- **System:** ACM – Components & Equipment Management System (Monorepo)
- **Document Type:** Operational Disaster Recovery Runbook (Review-Only)
- **Classification:** STRICT INTERNAL CONFIDENTIAL
- **Scope:** Disaster recovery procedure when all administrative accounts are inaccessible or locked out.

---

## 1. Mục đích và Nguyên tắc An toàn (Purpose & Security Principles)

Tài liệu này quy định quy trình chuẩn (Standard Operating Procedure - SOP) để khôi phục quyền quản trị tối cao (ADMIN) trong trường hợp thảm họa (toàn bộ tài khoản ADMIN bị khóa do tấn công brute-force, quên mật khẩu hoặc bị vô hiệu hóa nhầm).

### Nguyên tắc bất khả xâm phạm:
1. **Không mở API Backdoor:** Tuyệt đối không tạo bất kỳ HTTP endpoint, route ẩn, hoặc tham số bypass nào trong ứng dụng web/API để phục hồi tài khoản. Mọi HTTP bypass đều là lỗ hổng bảo mật nghiêm trọng (CWE-288).
2. **Out-of-band Execution:** Phục hồi khẩn cấp chỉ được thực hiện thông qua kết nối an toàn (SSH/Bastion) trực tiếp vào môi trường máy chủ nội bộ bởi Kỹ sư trưởng hệ thống (Lead DevOps / Lead Security Engineer).
3. **Dual Custody (Xác thực hai người):** Việc kích hoạt quy trình break-glass bắt buộc phải có sự phê duyệt bằng văn bản từ Chỉ huy sự cố (Incident Commander) hoặc Chủ dự án.
4. **Bảo toàn Audit Log:** Mọi hành động can thiệp trực tiếp phải ghi lại dấu vết kiểm toán (`AuditLog`) không thể xóa, ghi rõ lý do sự cố, người thực hiện và mã số ticket.
5. **Thu hồi phiên tức thì (SEC-01 Invalidation):** Khi mật khẩu được đặt lại qua CLI, trường mật khẩu mới sẽ tự động sinh mã HMAC-SHA256 (`pwdTag`) mới, vô hiệu hóa ngay lập tức toàn bộ JWT tokens hiện hữu trên mọi thiết bị.

---

## 2. Kịch bản Kích hoạt (Activation Criteria)

Quy trình này CHỈ ĐƯỢC PHÉP kích hoạt khi thỏa mãn đồng thời các điều kiện sau:
- Không còn bất kỳ tài khoản ADMIN nào có trạng thái `isActive = true` và `isLocked = false`.
- Hệ thống bị gián đoạn hoạt động quản trị nghiêm trọng (SEV-1 / P0 Outage).
- Đã có biên bản phê duyệt khẩn cấp từ Incident Commander.

---

## 3. Quy trình Chẩn đoán Trước Phục hồi (Pre-Recovery Diagnostics)

Trước khi thực hiện bất kỳ thay đổi nào, Kỹ sư trực tiếp phải kiểm tra số lượng và trạng thái tài khoản ADMIN hiện tại trong cơ sở dữ liệu:

```bash
# Kết nối an toàn vào PostgreSQL qua psql (chế độ Read-Only):
psql -d acm_inventory -U postgres -c "
  SELECT id, email, full_name, role, is_active, is_locked, failed_login_attempts, updated_at
  FROM users
  WHERE role = 'ADMIN';
"
```

*Nếu vẫn còn ít nhất 1 tài khoản ADMIN hoạt động (`is_active = true` và `is_locked = false`), DỪNG QUY TRÌNH và sử dụng tài khoản đó qua giao diện quản trị chuẩn.*

---

## 4. Thiết kế Kịch bản Phục hồi CLI (Emergency Recovery Script Specification)

Kịch bản phục hồi được thiết kế dưới dạng tập lệnh TypeScript nội bộ `apps/api/scripts/emergencyAdminRecovery.ts`, thực thi cục bộ thông qua `tsx` trên máy chủ:

### Yêu cầu chức năng của Script:
1. Nhận các tham số dòng lệnh bắt buộc:
   - `--email <admin_email>`: Địa chỉ email của tài khoản ADMIN cần mở khóa/phục hồi.
   - `--reason <incident_ticket_id>`: Mã số ticket sự cố (e.g. `INC-20261104-01`).
   - `--operator <operator_id>`: Định danh của kỹ sư thực hiện.
2. Kiểm tra tính hợp lệ của tài khoản:
   - Nếu tài khoản chưa tồn tại hoặc không phải `ADMIN`, script từ chối xử lý trừ khi có cờ tường minh `--promote`.
3. Khởi tạo mật khẩu tạm thời:
   - Sinh chuỗi ngẫu nhiên bằng `crypto.randomBytes(16).toString('hex')` (32 ký tự bảo mật cao).
   - Hash mật khẩu bằng `bcryptjs` với salt rounds = 12.
4. Thực thi trong giao dịch Serializable (`prisma.$transaction`):
   - Cập nhật `isLocked = false`, `isActive = true`, `failedLoginAttempts = 0`.
   - Cập nhật `passwordHash = newHashedPassword`.
   - Tạo bản ghi `AuditLog`:
     - `action = 'USER_STATUS_UPDATE'`
     - `entityType = 'User'`
     - `actorId = '00000000-0000-0000-0000-000000000000'` (SYSTEM_BREAKGLASS)
     - `details = { method: 'CLI_BREAKGLASS', reason, operator, targetEmail }`
5. Xuất mật khẩu tạm thời một lần duy nhất ra màn hình console (không ghi vào file log hoặc disk).

---

## 5. Quy trình Sau Phục hồi (Post-Recovery Actions)

1. **Đăng nhập và đổi mật khẩu bắt buộc:**
   - Quản trị viên sử dụng mật khẩu tạm thời để đăng nhập ngay lập tức.
   - Truy cập trang cá nhân hoặc giao diện quản trị để đặt mật khẩu chính thức mới.
2. **Kiểm tra tính hợp lệ của phiên làm việc:**
   - Xác nhận cơ chế SEC-01 đã vô hiệu hóa mọi phiên làm việc cũ.
3. **Đóng quyền Break-Glass:**
   - Xóa bỏ mọi thông tin đăng nhập tạm thời trên màn hình console.
   - Cập nhật trạng thái sự cố trên ticket điều hành.
4. **Họp đánh giá sau sự cố (PIR - Post-Incident Review):**
   - Xác định nguyên nhân gốc rễ (RCA) khiến toàn bộ ADMIN bị khóa (ví dụ: cấu hình rate-limit quá chặt chẽ, lỗi phân quyền, hoặc tấn công từ chối dịch vụ).
   - Đưa ra giải pháp phòng ngừa dài hạn.

---

> [!NOTE]
> Tài liệu này được biên soạn cho mục đích thẩm tra và chuẩn bị quy trình vận hành an toàn. Tuyệt đối không tự ý chạy script hoặc can thiệp dữ liệu khi không có sự phê chuẩn chính thức.
