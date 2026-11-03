# Use Case: Check Stock Availability

**Description:** Kiểm tra số lượng khả dụng.

**Precondition:** Người dùng đăng nhập.

**Postcondition:** Người dùng nhận được thông tin.

## Actors
- **Student**
- **Inventory Manager**

## Data Entities
- **Stock Balance**

## Flows
### ALT: Item Not Found
Item không tồn tại. Báo lỗi.

### MAIN
Người dùng tra cứu Item. Hệ thống trả về số lượng khả dụng.

## Business Rules
- Tồn khả dụng = On-hand - Reserved - Borrowed - Quarantined - KitAllocated

