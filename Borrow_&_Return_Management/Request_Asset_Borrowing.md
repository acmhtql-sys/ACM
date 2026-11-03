# Use Case: Request Asset Borrowing

**Description:** Student tạo yêu cầu mượn tài sản và được phê duyệt.

**Precondition:** Student đã đăng nhập.

**Postcondition:** Yêu cầu mượn được phê duyệt và số lượng được giữ chỗ.

## Actors
- **Inventory Manager**
- **Student**

## Data Entities
- **StockReservation**
- **BorrowRequest**

## Flows
### EXCEPTION: Insufficient Stock
Số lượng yêu cầu vượt quá tồn kho khả dụng, hệ thống từ chối yêu cầu.

### MAIN
Student tạo yêu cầu mượn, chọn các item/asset. Hệ thống kiểm tra tồn kho khả dụng. Inventory Manager duyệt phiếu. Hệ thống cập nhật StockReservation và trạng thái phiếu mượn.

## Business Rules
- Phiếu mượn phải được duyệt bởi Inventory Manager.
- Không được mượn vượt số lượng khả dụng.

