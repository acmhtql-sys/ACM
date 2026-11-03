# Use Case: Return Assets

**Description:** Trả tài sản.

**Precondition:** Borrow request is HANDED_OVER.

**Postcondition:** Borrowed stock reduced, On-hand updated based on condition.

## Actors
- **Inventory Manager**

## Data Entities
- **AuditLog**
- **ReturnTransaction**
- **Asset**
- **StockBalance**
- **BorrowRequest**

## Flows
### EXCEPTION: Discrepancy Exception
Manager records unexpected damage or discrepancy in count.

### MAIN
1. Inventory Manager receives returned assets. 2. Manager records condition (Good, Damaged, Missing). 3. System updates BorrowRequest to RETURNED. 4. For Good: Decrease Borrowed, Increase On-hand. 5. For Damaged: Decrease Borrowed, Increase Quarantined. 6. For Missing: Decrease Borrowed, record Missing report, no On-hand increase. 7. System records AuditLog.

## Business Rules
- Damaged assets increase Quarantined, reduce On-hand.
- AuditLog required for return.
- Return reduces Borrowed, increases On-hand.

