# Use Case: Approve Borrow Request

**Description:** Phê duyệt phiếu mượn.

**Precondition:** Borrow request exists in PENDING state.

**Postcondition:** Request is APPROVED, Reserved stock increased.

## Actors
- **Teacher**
- **Inventory Manager**

## Data Entities
- **AuditLog**
- **StockBalance**
- **BorrowRequest**

## Flows
### EXCEPTION: Insufficient Stock Exception
1. System detects available stock < requested quantity. 2. System restricts approval and alerts user.

### MAIN
1. Inventory Manager/Teacher views PENDING borrow request. 2. System checks available stock (BR-006). 3. Manager/Teacher approves request. 4. System updates BorrowRequest status to APPROVED, increases Reserved quantity in StockBalance. 5. System records AuditLog.

## Business Rules
- Reserved increases upon approval.
- Không được duyệt vượt tồn khả dụng (Available).
- Người mượn không được tự duyệt phiếu.

