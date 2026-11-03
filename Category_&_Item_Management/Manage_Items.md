# Use Case: Manage Items

**Description:** Quản lý danh mục linh kiện.

**Precondition:** Manager đăng nhập.

**Postcondition:** Item mới được tạo.

## Actors
- **Inventory Manager**

## Data Entities
- **Item**

## Flows
### EXCEPTION: Duplicate Name
Tên trùng. Báo lỗi.

### MAIN
Manager tạo Item mới. Hệ thống lưu.

## Business Rules
- Tên Item là bắt buộc

