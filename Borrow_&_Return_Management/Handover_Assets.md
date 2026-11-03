# Use Case: Handover Assets

**Description:** Bàn giao tài sản.

**Precondition:** Borrow request is APPROVED.

**Postcondition:** Assets are marked as Borrowed, Reserved reduced.

## Actors
- **Inventory Manager**

## Data Entities
- **AuditLog**
- **Asset**
- **StockBalance**
- **BorrowRequest**

## Flows
### EXCEPTION: Invalid Request Exception
1. Item/Asset not found or already handed over. 2. System blocks action and shows error.

### MAIN
1. Inventory Manager verifies BorrowRequest (APPROVED). 2. System updates BorrowRequest to HANDED_OVER. 3. For each asset, System decreases Reserved and On-hand in StockBalance, increases Borrowed in StockBalance. 4. System records AuditLog.

## Business Rules
- AuditLog required for asset handover.
- Handover reduces Reserved and On-hand. Increases Borrowed.

