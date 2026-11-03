# Use Case: Logout

**Description:** Người dùng thoát khỏi hệ thống.

**Precondition:** User đã đăng nhập.

**Postcondition:** Session bị hủy, người dùng không thể truy cập các chức năng cần xác thực.

## Actors
- **User**

## Data Entities
- **Session**

## Flows
### ALT: Already Logged Out
Người dùng đã đăng xuất từ trước hoặc session hết hạn. Hệ thống thông báo hoặc tự động chuyển hướng.

### MAIN
Người dùng chọn chức năng đăng xuất. Hệ thống xóa session và chuyển hướng về trang Login.

## Business Rules
- Người dùng phải đăng nhập trước khi logout

