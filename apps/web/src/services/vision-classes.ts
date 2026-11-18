/**
 * ACM Vision AI – 85 Trained Classes Specification (Ultralytics YOLO11n)
 * Checkpoint: best.pt (Kaggle trained on UBTECH & ACM Lab Components)
 * SHA256: c9b1f5d528a2f75ce3766f06fe6b502ecd3e04f1095c8932cc0ba9b00b7448d3
 */

export interface TrainedClassDefinition {
  classId: number;
  className: string;
  friendlyNameVi: string;
  defaultItemCode: string;
  category: 'ELECTRONIC' | 'SENSOR' | 'CABLE' | 'MECHANICAL' | 'STRUCTURE' | 'ACCESSORY';
}

export const YOLO11_85_CLASSES: TrainedClassDefinition[] = [
  { classId: 0, className: 'Single_joint_part -Yellow-', friendlyNameVi: 'Khớp nối đơn (Vàng)', defaultItemCode: 'JNT-SGL-YEL', category: 'MECHANICAL' },
  { classId: 1, className: '11-hole_stick', friendlyNameVi: 'Thanh nối 11 lỗ', defaultItemCode: 'STK-11H', category: 'STRUCTURE' },
  { classId: 2, className: '13-hole_stick', friendlyNameVi: 'Thanh nối 13 lỗ', defaultItemCode: 'STK-13H', category: 'STRUCTURE' },
  { classId: 3, className: '15-hole_stick', friendlyNameVi: 'Thanh nối 15 lỗ', defaultItemCode: 'STK-15H', category: 'STRUCTURE' },
  { classId: 4, className: '1x2_Dual_joint', friendlyNameVi: 'Khớp nối đôi 1x2', defaultItemCode: 'JNT-1X2', category: 'MECHANICAL' },
  { classId: 5, className: '1x3_Dual_joint', friendlyNameVi: 'Khớp nối đôi 1x3', defaultItemCode: 'JNT-1X3', category: 'MECHANICAL' },
  { classId: 6, className: '2x2_Dual_joint', friendlyNameVi: 'Khớp nối đôi 2x2', defaultItemCode: 'JNT-2X2', category: 'MECHANICAL' },
  { classId: 7, className: '2x3_Dual_right_angle_joint', friendlyNameVi: 'Khớp vuông góc đôi 2x3', defaultItemCode: 'JNT-2X3-RA', category: 'MECHANICAL' },
  { classId: 8, className: '2x4_Right_angle_joint', friendlyNameVi: 'Khớp vuông góc 2x4', defaultItemCode: 'JNT-2X4-RA', category: 'MECHANICAL' },
  { classId: 9, className: '3-hole_stick', friendlyNameVi: 'Thanh nối 3 lỗ', defaultItemCode: 'STK-3H', category: 'STRUCTURE' },
  { classId: 10, className: '3x3_Joint_brick', friendlyNameVi: 'Khối gạch khớp 3x3', defaultItemCode: 'BRK-3X3-JNT', category: 'STRUCTURE' },
  { classId: 11, className: '3x3_Mat', friendlyNameVi: 'Tấm đệm cao su 3x3', defaultItemCode: 'MAT-3X3', category: 'ACCESSORY' },
  { classId: 12, className: '3x5_Curved_part_-yellow-', friendlyNameVi: 'Thanh cong 3x5 (Vàng)', defaultItemCode: 'BEAM-CSX5-YEL', category: 'STRUCTURE' },
  { classId: 13, className: '3x5_Curved_part_blue', friendlyNameVi: 'Thanh cong 3x5 (Xanh dương)', defaultItemCode: 'BEAM-CSX5-BLU', category: 'STRUCTURE' },
  { classId: 14, className: '3x7_Curved_stick', friendlyNameVi: 'Thanh cong 3x7', defaultItemCode: 'STK-3X7-CRV', category: 'STRUCTURE' },
  { classId: 15, className: '3x7_Dual_curved_stick-blue-', friendlyNameVi: 'Thanh cong kép 3x7 (Xanh)', defaultItemCode: 'STK-3X7-BLU', category: 'STRUCTURE' },
  { classId: 16, className: '3x7_dual_curved stick -Gray-', friendlyNameVi: 'Thanh cong kép 3x7 (Xám)', defaultItemCode: 'STK-3X7-GRY', category: 'STRUCTURE' },
  { classId: 17, className: '45- servo_clip -L-', friendlyNameVi: 'Kẹp Servo 45 độ (Trái)', defaultItemCode: 'CLP-SRV-45L', category: 'MECHANICAL' },
  { classId: 18, className: '45- servo_clip -R-', friendlyNameVi: 'Kẹp Servo 45 độ (Phải)', defaultItemCode: 'CLP-SRV-45R', category: 'MECHANICAL' },
  { classId: 19, className: '4x4_Curved_stick_-blue-', friendlyNameVi: 'Thanh cong 4x4 (Xanh)', defaultItemCode: 'STK-4X4-BLU', category: 'STRUCTURE' },
  { classId: 20, className: '4x6_curved_stick -Gray', friendlyNameVi: 'Thanh cong 4x6 (Xám)', defaultItemCode: 'STK-4X6-GRY', category: 'STRUCTURE' },
  { classId: 21, className: '4x6_curved_stick-Blue-', friendlyNameVi: 'Thanh cong 4x6 (Xanh)', defaultItemCode: 'STK-4X6-BLU', category: 'STRUCTURE' },
  { classId: 22, className: '5-hole_stick', friendlyNameVi: 'Thanh nối 5 lỗ', defaultItemCode: 'STK-5H', category: 'STRUCTURE' },
  { classId: 23, className: '5x5_Joint_brick', friendlyNameVi: 'Khối gạch khớp 5x5', defaultItemCode: 'BRK-5X5-JNT', category: 'STRUCTURE' },
  { classId: 24, className: '5x5_Rubber_mat', friendlyNameVi: 'Tấm đệm cao su 5x5', defaultItemCode: 'MAT-5X5', category: 'ACCESSORY' },
  { classId: 25, className: '7-hole_stick -White-', friendlyNameVi: 'Thanh nối 7 lỗ (Trắng)', defaultItemCode: 'STK-7H-WHT', category: 'STRUCTURE' },
  { classId: 26, className: '7-hole_stick-blue-', friendlyNameVi: 'Thanh nối 7 lỗ (Xanh)', defaultItemCode: 'STK-7H-BLU', category: 'STRUCTURE' },
  { classId: 27, className: '9-hole_stick-blue-', friendlyNameVi: 'Thanh nối 9 lỗ (Xanh)', defaultItemCode: 'STK-9H-BLU', category: 'STRUCTURE' },
  { classId: 28, className: 'Base_brick', friendlyNameVi: 'Khối đế lắp ráp (Base brick)', defaultItemCode: 'BRK-BASE', category: 'STRUCTURE' },
  { classId: 29, className: 'Baseboard', friendlyNameVi: 'Tấm đế lắp ráp chính (Baseboard)', defaultItemCode: 'KIT-BASE-01', category: 'STRUCTURE' },
  { classId: 30, className: 'Blue_short_plug', friendlyNameVi: 'Chốt cắm ngắn (Xanh)', defaultItemCode: 'PLUG-BLU', category: 'ACCESSORY' },
  { classId: 31, className: 'Bluetooth_speaker', friendlyNameVi: 'Loa Bluetooth Robot', defaultItemCode: 'SPK-BT-01', category: 'ELECTRONIC' },
  { classId: 32, className: 'Bushing', friendlyNameVi: 'Bạc lót trục (Bushing)', defaultItemCode: 'BSH-01', category: 'MECHANICAL' },
  { classId: 33, className: 'Curved_slice', friendlyNameVi: 'Miếng ghép cong mỏng', defaultItemCode: 'SLC-CRV', category: 'STRUCTURE' },
  { classId: 34, className: 'Driven_connector_-wheel-', friendlyNameVi: 'Khớp nối truyền động bánh xe', defaultItemCode: 'CON-WHL', category: 'MECHANICAL' },
  { classId: 35, className: 'Dual-decked_joint_brick_blue', friendlyNameVi: 'Khối gạch khớp 2 tầng (Xanh)', defaultItemCode: 'BRK-DD-BLU', category: 'STRUCTURE' },
  { classId: 36, className: 'Dual-decked_joint_brick_yellow', friendlyNameVi: 'Khối gạch khớp 2 tầng (Vàng)', defaultItemCode: 'BRK-DD-YEL', category: 'STRUCTURE' },
  { classId: 37, className: 'Dual_joint_part -Short-', friendlyNameVi: 'Khớp đôi ngắn', defaultItemCode: 'JNT-DL-SHT', category: 'MECHANICAL' },
  { classId: 38, className: 'Dual_joint_part_-Long-', friendlyNameVi: 'Khớp đôi dài', defaultItemCode: 'JNT-DL-LNG', category: 'MECHANICAL' },
  { classId: 39, className: 'Dual_servo_clip', friendlyNameVi: 'Kẹp Servo đôi', defaultItemCode: 'CLP-SRV-DL', category: 'MECHANICAL' },
  { classId: 40, className: 'Flat_head_shaft', friendlyNameVi: 'Trục đầu phẳng (Flat head shaft)', defaultItemCode: 'SFT-FLAT', category: 'MECHANICAL' },
  { classId: 41, className: 'Green_short_plug', friendlyNameVi: 'Chốt cắm ngắn (Xanh lá)', defaultItemCode: 'PLUG-GRN', category: 'ACCESSORY' },
  { classId: 42, className: 'I-shaped_brick', friendlyNameVi: 'Khối gạch chữ I', defaultItemCode: 'BRK-ISHAPE', category: 'STRUCTURE' },
  { classId: 43, className: 'IR_sensor', friendlyNameVi: 'Cảm biến hồng ngoại (IR)', defaultItemCode: 'SEN-IR', category: 'SENSOR' },
  { classId: 44, className: 'Joint_brick', friendlyNameVi: 'Khối gạch khớp nối', defaultItemCode: 'BRK-JNT', category: 'STRUCTURE' },
  { classId: 45, className: 'LED_lamp', friendlyNameVi: 'Mô-đun đèn LED RGB', defaultItemCode: 'LED-5MM-RGB', category: 'ELECTRONIC' },
  { classId: 46, className: 'Large_blade_L', friendlyNameVi: 'Cánh lớn (Trái)', defaultItemCode: 'BLD-LRG-L', category: 'STRUCTURE' },
  { classId: 47, className: 'Large_blade_R', friendlyNameVi: 'Cánh lớn (Phải)', defaultItemCode: 'BLD-LRG-R', category: 'STRUCTURE' },
  { classId: 48, className: 'Light_sensor', friendlyNameVi: 'Cảm biến ánh sáng quang trở', defaultItemCode: 'SEN-LIGHT', category: 'SENSOR' },
  { classId: 49, className: 'Long_blade -L-', friendlyNameVi: 'Cánh dài (Trái)', defaultItemCode: 'BLD-LNG-L', category: 'STRUCTURE' },
  { classId: 50, className: 'Long_blade -R-', friendlyNameVi: 'Cánh dài (Phải)', defaultItemCode: 'BLD-LNG-R', category: 'STRUCTURE' },
  { classId: 51, className: 'Long_finger', friendlyNameVi: 'Ngón tay kẹp robot dài', defaultItemCode: 'FNG-LNG', category: 'MECHANICAL' },
  { classId: 52, className: 'Main_1', friendlyNameVi: 'Bo mạch điều khiển Main 1 (MCU)', defaultItemCode: 'MAIN-01', category: 'ELECTRONIC' },
  { classId: 53, className: 'Main_2', friendlyNameVi: 'Bo mạch điều khiển Main 2 (MCU)', defaultItemCode: 'MAIN-02', category: 'ELECTRONIC' },
  { classId: 54, className: 'Motor', friendlyNameVi: 'Động cơ DC Motor giảm tốc', defaultItemCode: 'MOT-01', category: 'ELECTRONIC' },
  { classId: 55, className: 'Poly-directinal_wheel', friendlyNameVi: 'Bánh xe đa hướng Omni', defaultItemCode: 'WHEEL-OMNI', category: 'MECHANICAL' },
  { classId: 56, className: 'Poly_directional_wheel', friendlyNameVi: 'Bánh xe đa hướng Omni', defaultItemCode: 'WHEEL-OMNI', category: 'MECHANICAL' },
  { classId: 57, className: 'Red_plug', friendlyNameVi: 'Chốt cắm đỏ (Red plug)', defaultItemCode: 'PLUG-RED', category: 'ACCESSORY' },
  { classId: 58, className: 'Round_joint_brick', friendlyNameVi: 'Khối gạch khớp tròn', defaultItemCode: 'BRK-RND-JNT', category: 'STRUCTURE' },
  { classId: 59, className: 'Servo', friendlyNameVi: 'Động cơ RC Servo SG90', defaultItemCode: 'SERVO-SG90', category: 'ELECTRONIC' },
  { classId: 60, className: 'Servo_wire -Blue-', friendlyNameVi: 'Dây cáp tín hiệu Servo (Xanh)', defaultItemCode: 'CAB-SRV-BLU', category: 'CABLE' },
  { classId: 61, className: 'Servo_wire_-Short-', friendlyNameVi: 'Dây cáp tín hiệu Servo (Ngắn)', defaultItemCode: 'CAB-SRV-SHT', category: 'CABLE' },
  { classId: 62, className: 'Servo_wire_Gray', friendlyNameVi: 'Dây cáp tín hiệu Servo (Xám)', defaultItemCode: 'CAB-SRV-GRY', category: 'CABLE' },
  { classId: 63, className: 'Short_finger', friendlyNameVi: 'Ngón tay kẹp robot ngắn', defaultItemCode: 'FNG-SHT', category: 'MECHANICAL' },
  { classId: 64, className: 'Single_joint_part_blue', friendlyNameVi: 'Khớp đơn (Xanh dương)', defaultItemCode: 'JNT-SGL-BLU', category: 'MECHANICAL' },
  { classId: 65, className: 'Small_blade_L', friendlyNameVi: 'Cánh nhỏ (Trái)', defaultItemCode: 'BLD-SML-L', category: 'STRUCTURE' },
  { classId: 66, className: 'Small_blade_R', friendlyNameVi: 'Cánh nhỏ (Phải)', defaultItemCode: 'BLD-SML-R', category: 'STRUCTURE' },
  { classId: 67, className: 'Small_curved_panel', friendlyNameVi: 'Tấm ốp cong nhỏ', defaultItemCode: 'PNL-SML-CRV', category: 'STRUCTURE' },
  { classId: 68, className: 'Sound_sensor', friendlyNameVi: 'Cảm biến âm thanh (Sound)', defaultItemCode: 'SEN-SOUND', category: 'SENSOR' },
  { classId: 69, className: 'Square_frame', friendlyNameVi: 'Khung vuông đế (Square frame)', defaultItemCode: 'FRAME-01', category: 'STRUCTURE' },
  { classId: 70, className: 'Square_panel -Gray-', friendlyNameVi: 'Tấm ốp vuông (Xám)', defaultItemCode: 'PNL-SQR-GRY', category: 'STRUCTURE' },
  { classId: 71, className: 'Square_panel -White-', friendlyNameVi: 'Tấm ốp vuông (Trắng)', defaultItemCode: 'PNL-SQR-WHT', category: 'STRUCTURE' },
  { classId: 72, className: 'Square_sevro_clip', friendlyNameVi: 'Kẹp vuông Servo', defaultItemCode: 'CLP-SRV-SQR', category: 'MECHANICAL' },
  { classId: 73, className: 'Switch_main_1', friendlyNameVi: 'Công tắc nguồn Main 1', defaultItemCode: 'SW-MAIN-01', category: 'ELECTRONIC' },
  { classId: 74, className: 'Switch_main_2', friendlyNameVi: 'Công tắc nguồn Main 2', defaultItemCode: 'SW-MAIN-02', category: 'ELECTRONIC' },
  { classId: 75, className: 'Switch_wire_main_1', friendlyNameVi: 'Dây cáp công tắc Main 1', defaultItemCode: 'CAB-SW-M1', category: 'CABLE' },
  { classId: 76, className: 'Switch_wire_main_2', friendlyNameVi: 'Dây cáp công tắc Main 2', defaultItemCode: 'CAB-SW-M2', category: 'CABLE' },
  { classId: 77, className: 'Temp_hum_sensor', friendlyNameVi: 'Cảm biến nhiệt độ & độ ẩm DHT22', defaultItemCode: 'DHT22-AM2302', category: 'SENSOR' },
  { classId: 78, className: 'Touch_sensor', friendlyNameVi: 'Cảm biến chạm (Touch sensor)', defaultItemCode: 'SEN-TOUCH', category: 'SENSOR' },
  { classId: 79, className: 'Turning_brick', friendlyNameVi: 'Khối xoay chuyển hướng', defaultItemCode: 'BRK-TURN', category: 'MECHANICAL' },
  { classId: 80, className: 'Two_hole_slice_L', friendlyNameVi: 'Miếng ghép 2 lỗ (Trái)', defaultItemCode: 'SLC-2H-L', category: 'STRUCTURE' },
  { classId: 81, className: 'Two_hole_slice_R', friendlyNameVi: 'Miếng ghép 2 lỗ (Phải)', defaultItemCode: 'SLC-2H-R', category: 'STRUCTURE' },
  { classId: 82, className: 'Ultrasonic_sensor', friendlyNameVi: 'Cảm biến siêu âm HC-SR04', defaultItemCode: 'SR04-ULTRASONIC', category: 'SENSOR' },
  { classId: 83, className: 'Wheel_hub_Tire', friendlyNameVi: 'Bánh xe kèm lốp cao su', defaultItemCode: 'WHEEL-TIRE', category: 'MECHANICAL' },
  { classId: 84, className: 'Yellow_long_plug', friendlyNameVi: 'Chốt cắm dài (Vàng)', defaultItemCode: 'PLUG-YEL', category: 'ACCESSORY' },
];

export const CLASS_NAME_TO_DEFINITION_MAP = new Map<string, TrainedClassDefinition>();
YOLO11_85_CLASSES.forEach((c) => {
  CLASS_NAME_TO_DEFINITION_MAP.set(c.className.toLowerCase(), c);
});

/**
 * Finds the trained class definition matching a class name, item code, or item name
 */
export function findMatchingTrainedClass(query: string): TrainedClassDefinition | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();

  // 1. Direct class name match
  const exact = CLASS_NAME_TO_DEFINITION_MAP.get(q);
  if (exact) return exact;

  // 2. Direct SKU code match
  const byCode = YOLO11_85_CLASSES.find((c) => c.defaultItemCode.toLowerCase() === q);
  if (byCode) return byCode;

  // 3. Substring / normalized match
  return YOLO11_85_CLASSES.find(
    (c) =>
      c.friendlyNameVi.toLowerCase().includes(q) ||
      q.includes(c.friendlyNameVi.toLowerCase()) ||
      c.className.toLowerCase().includes(q) ||
      q.includes(c.className.toLowerCase().replace(/[_-]/g, ' '))
  );
}
