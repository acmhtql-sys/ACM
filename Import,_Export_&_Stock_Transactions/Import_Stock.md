# Use Case: Import Stock

**Description:** Nhập linh kiện vào kho.

**Precondition:** User is logged in as Inventory Manager.

**Postcondition:** Stock balance updated, StockTransaction recorded, AuditLog updated.

## Actors
- **Inventory Manager**

## Data Entities
- **StockBalance**
- **Item**
- **StockTransactionDetail**
- **StockTransaction**

## Flows
### EXCEPTION: Invalid Data Exception
1. System detects invalid Item ID or invalid Location. 2. System rejects import and prompts Manager to correct data. 3. Manager corrects data or cancels import.

### MAIN
1. Inventory Manager creates a new import request for multiple items. 2. System validates existence of items and valid locations. 3. System calculates new stock levels for each item. 4. Inventory Manager confirms import. 5. System updates StockBalance (On-hand increased), creates StockTransaction, and records AuditLog.

## Business Rules
- Rollback if any line item fails validation.
- Available = On-hand - Reserved - Quarantined - KitAllocated.

