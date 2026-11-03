# Use Case: Login

**Description:** Người dùng đăng nhập vào hệ thống để truy cập các tính năng.

**Precondition:** Người dùng có tài khoản hợp lệ.

**Postcondition:** Người dùng đăng nhập thành công vào hệ thống.

## Actors
- **User**

## Data Entities
- **User Account**

## Flows
### EXCEPTION: Invalid Credentials
Nhập sai thông tin đăng nhập, hệ thống hiển thị thông báo lỗi.

### MAIN
Người dùng nhập email và mật khẩu. Hệ thống xác thực thông tin. Nếu hợp lệ, chuyển hướng tới Dashboard.

## Business Rules
- Tài khoản bị khóa sau 5 lần nhập sai.
- Mật khẩu phải được hash trước khi lưu.

