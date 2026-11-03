# Use Case: Manage Stock Inventory

**Description:** Inventory Manager cập nhật số lượng tồn kho của các linh kiện/thiết bị tại các vị trí.

**Precondition:** Inventory Manager đã đăng nhập.

**Postcondition:** Số lượng tồn kho được cập nhật chính xác.

## Actors
- **Inventory Manager**

## Data Entities
- **StockBalance**
- **Item**

## Flows
### EXCEPTION: Invalid Input
Số lượng nhập vào không hợp lệ hoặc vượt ngưỡng cho phép, hệ thống từ chối và báo lỗi.

### MAIN
Inventory Manager chọn item và vị trí kho. Hệ thống hiển thị số lượng tồn hiện tại. Manager nhập số lượng điều chỉnh. Hệ thống cập nhật StockBalance và ghi log.

## Business Rules
- Mọi thay đổi tồn kho phải có Audit Log.
- Số lượng tồn kho không được âm.

