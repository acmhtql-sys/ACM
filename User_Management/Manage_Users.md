# Use Case: Manage Users

**Description:** Admin quản lý danh sách người dùng.

**Precondition:** Admin đăng nhập.

**Postcondition:** Thông tin user được cập nhật.

## Actors
- **System Administrator**

## Data Entities
- **User Account**

## Flows
### EXCEPTION: User Not Found
User không tồn tại. Hệ thống báo lỗi.

### MAIN
Admin cập nhật thông tin user. Hệ thống lưu thay đổi.

## Business Rules
- Chỉ Admin được sửa user

