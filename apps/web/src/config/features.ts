/**
 * Feature Flag Configuration for ACM Web
 *
 * Giai đoạn Step 4B.2B (Mock-Verified Stage):
 * Mọi thao tác Ghi (POST, PUT, PATCH) đối với Location phải được bảo vệ
 * và vô hiệu hóa mặc định tại runtime trừ khi VITE_ENABLE_LOCATION_WRITES=true.
 */

export const isLocationWriteEnabled = (): boolean => {
  // Safe extraction with default fallback to false
  return import.meta.env.VITE_ENABLE_LOCATION_WRITES === 'true';
};

/**
 * Giai đoạn Step 4B.3B (Mock-Verified Stage):
 * Mọi thao tác Ghi (POST) đối với Stock Transactions (IMPORT, EXPORT, TRANSFER, ADJUSTMENT)
 * phải bị vô hiệu hóa mặc định tại runtime trừ khi VITE_ENABLE_STOCK_TRANSACTION_WRITES=true.
 */
export const isStockTransactionWriteEnabled = (): boolean => {
  // Safe extraction with default fallback to false
  return import.meta.env.VITE_ENABLE_STOCK_TRANSACTION_WRITES === 'true';
};

/**
 * Giai đoạn Step S2C-3A:
 * Nghiệp vụ Điều chỉnh kho (ADJUSTMENT) có rủi ro cao và chưa hoàn thiện Snapshot V2.
 * Phải có chốt chặn độc lập (Independent Feature Gate), tách biệt khỏi write flag chung.
 * Mặc định luôn bị khóa trừ khi được kích hoạt độc lập qua VITE_ENABLE_STOCK_ADJUSTMENT=true.
 */
export const isStockAdjustmentEnabled = (): boolean => {
  // Safe extraction with default fallback to false
  return import.meta.env.VITE_ENABLE_STOCK_ADJUSTMENT === 'true';
};

/**
 * AI Camera-Assisted Component Return & Borrow (Parallel Track):
 * Chế độ nhận diện linh kiện qua camera để hỗ trợ hoàn trả & mượn nhanh.
 * Kích hoạt mặc định trừ khi bị vô hiệu hóa rõ ràng qua VITE_ENABLE_CAMERA_RETURN=false.
 */
export const isCameraReturnEnabled = (): boolean => {
  return import.meta.env.VITE_ENABLE_CAMERA_RETURN !== 'false';
};
