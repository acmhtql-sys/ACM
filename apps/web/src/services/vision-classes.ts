/**
 * ACM Vision AI – 86 Trained Classes Specification (Ultralytics YOLOv8s `best.pt`)
 * Checkpoint: best.pt (Kaggle trained on UBTECH & ACM Lab Components, imgsz=960)
 * SHA256: 2abe7ffa86c021095a6ba0bb8174476ad1eaa7d610cb46c931520e46a3b15288
 */

export interface TrainedClassDefinition {
  classId: number;
  className: string;
  friendlyNameVi: string;
  defaultItemCode: string;
  aliasCodes?: string[];
  category: 'ELECTRONIC' | 'SENSOR' | 'CABLE' | 'MECHANICAL' | 'STRUCTURE' | 'ACCESSORY';
}

export const BEST_86_CLASSES: TrainedClassDefinition[] = [
  { classId: 0, className: 'Large_curved_panel -White-', friendlyNameVi: 'Tấm ốp cong lớn (Trắng)', defaultItemCode: 'PNL-LRG-CRV-WHT', aliasCodes: ['PNL-LRG-WHT', 'PNL-CRV-WHT'], category: 'STRUCTURE' },
  { classId: 1, className: 'Single_joint_part -Yellow-', friendlyNameVi: 'Khớp nối đơn (Vàng)', defaultItemCode: 'JNT-SGL-YEL', category: 'MECHANICAL' },
  { classId: 2, className: '11-hole_stick', friendlyNameVi: 'Thanh nối 11 lỗ', defaultItemCode: 'STK-11H', category: 'STRUCTURE' },
  { classId: 3, className: '13-hole_stick', friendlyNameVi: 'Thanh nối 13 lỗ', defaultItemCode: 'STK-13H', category: 'STRUCTURE' },
  { classId: 4, className: '15-hole_stick', friendlyNameVi: 'Thanh nối 15 lỗ', defaultItemCode: 'STK-15H', category: 'STRUCTURE' },
  { classId: 5, className: '1x2_Dual_joint', friendlyNameVi: 'Khớp nối đôi 1x2', defaultItemCode: 'JNT-1X2', aliasCodes: ['JNT-1X2-DUAL'], category: 'MECHANICAL' },
  { classId: 6, className: '1x3_Dual_joint', friendlyNameVi: 'Khớp nối đôi 1x3', defaultItemCode: 'JNT-1X3', aliasCodes: ['JNT-1X3-DUAL'], category: 'MECHANICAL' },
  { classId: 7, className: '2x2_Dual_joint', friendlyNameVi: 'Khớp nối đôi 2x2', defaultItemCode: 'JNT-2X2', aliasCodes: ['JNT-2X2-DUAL'], category: 'MECHANICAL' },
  { classId: 8, className: '2x3_Dual_right_angle_joint', friendlyNameVi: 'Khớp vuông góc đôi 2x3', defaultItemCode: 'JNT-2X3-RA', category: 'MECHANICAL' },
  { classId: 9, className: '2x4_Right_angle_joint', friendlyNameVi: 'Khớp vuông góc 2x4', defaultItemCode: 'JNT-2X4-RA', category: 'MECHANICAL' },
  { classId: 10, className: '3-hole_stick', friendlyNameVi: 'Thanh nối 3 lỗ', defaultItemCode: 'STK-3H', category: 'STRUCTURE' },
  { classId: 11, className: '3x3_Joint_brick', friendlyNameVi: 'Khối gạch khớp 3x3', defaultItemCode: 'BRK-3X3-JNT', aliasCodes: ['JNT-3X3-BRICK'], category: 'STRUCTURE' },
  { classId: 12, className: '3x3_Mat', friendlyNameVi: 'Tấm đệm cao su 3x3', defaultItemCode: 'MAT-3X3', category: 'ACCESSORY' },
  { classId: 13, className: '3x5_Curved_part_-yellow-', friendlyNameVi: 'Thanh cong 3x5 (Vàng)', defaultItemCode: 'BEAM-CSX5-YEL', aliasCodes: ['PRT-3X5-CRV-YEL'], category: 'STRUCTURE' },
  { classId: 14, className: '3x5_Curved_part_blue', friendlyNameVi: 'Thanh cong 3x5 (Xanh dương)', defaultItemCode: 'BEAM-CSX5-BLU', aliasCodes: ['PRT-3X5-CRV-BLU'], category: 'STRUCTURE' },
  { classId: 15, className: '3x7_Curved_stick', friendlyNameVi: 'Thanh cong 3x7', defaultItemCode: 'STK-3X7-CRV', category: 'STRUCTURE' },
  { classId: 16, className: '3x7_Dual_curved_stick-blue-', friendlyNameVi: 'Thanh cong kép 3x7 (Xanh)', defaultItemCode: 'STK-3X7-BLU', aliasCodes: ['STK-3X7-DC-BLU'], category: 'STRUCTURE' },
  { classId: 17, className: '3x7_dual_curved stick -Gray-', friendlyNameVi: 'Thanh cong kép 3x7 (Xám)', defaultItemCode: 'STK-3X7-GRY', aliasCodes: ['STK-3X7-DC-GRY'], category: 'STRUCTURE' },
  { classId: 18, className: '45- servo_clip -L-', friendlyNameVi: 'Kẹp Servo 45 độ (Trái)', defaultItemCode: 'CLP-SRV-45L', category: 'MECHANICAL' },
  { classId: 19, className: '45- servo_clip -R-', friendlyNameVi: 'Kẹp Servo 45 độ (Phải)', defaultItemCode: 'CLP-SRV-45R', category: 'MECHANICAL' },
  { classId: 20, className: '4x4_Curved_stick_-blue-', friendlyNameVi: 'Thanh cong 4x4 (Xanh)', defaultItemCode: 'STK-4X4-BLU', aliasCodes: ['STK-4X4-CRV-BLU'], category: 'STRUCTURE' },
  { classId: 21, className: '4x6_curved_stick -Gray', friendlyNameVi: 'Thanh cong 4x6 (Xám)', defaultItemCode: 'STK-4X6-GRY', category: 'STRUCTURE' },
  { classId: 22, className: '4x6_curved_stick-Blue-', friendlyNameVi: 'Thanh cong 4x6 (Xanh)', defaultItemCode: 'STK-4X6-BLU', category: 'STRUCTURE' },
  { classId: 23, className: '5-hole_stick', friendlyNameVi: 'Thanh nối 5 lỗ', defaultItemCode: 'STK-5H', category: 'STRUCTURE' },
  { classId: 24, className: '5x5_Joint_brick', friendlyNameVi: 'Khối gạch khớp 5x5', defaultItemCode: 'BRK-5X5-JNT', aliasCodes: ['JNT-5X5-BRICK'], category: 'STRUCTURE' },
  { classId: 25, className: '5x5_Rubber_mat', friendlyNameVi: 'Tấm đệm cao su 5x5', defaultItemCode: 'MAT-5X5', category: 'ACCESSORY' },
  { classId: 26, className: '7-hole_stick -White-', friendlyNameVi: 'Thanh nối 7 lỗ (Trắng)', defaultItemCode: 'STK-7H-WHT', category: 'STRUCTURE' },
  { classId: 27, className: '7-hole_stick-blue-', friendlyNameVi: 'Thanh nối 7 lỗ (Xanh)', defaultItemCode: 'STK-7H-BLU', category: 'STRUCTURE' },
  { classId: 28, className: '9-hole_stick-blue-', friendlyNameVi: 'Thanh nối 9 lỗ (Xanh)', defaultItemCode: 'STK-9H-BLU', category: 'STRUCTURE' },
  { classId: 29, className: 'Base_brick', friendlyNameVi: 'Khối đế lắp ráp (Base brick)', defaultItemCode: 'BRK-BASE', category: 'STRUCTURE' },
  { classId: 30, className: 'Baseboard', friendlyNameVi: 'Tấm đế lắp ráp chính (Baseboard)', defaultItemCode: 'KIT-BASE-01', category: 'STRUCTURE' },
  { classId: 31, className: 'Blue_short_plug', friendlyNameVi: 'Chốt cắm ngắn (Xanh)', defaultItemCode: 'PLUG-BLU', category: 'ACCESSORY' },
  { classId: 32, className: 'Bluetooth_speaker', friendlyNameVi: 'Loa Bluetooth Robot', defaultItemCode: 'SPK-BT-01', aliasCodes: ['ACT-SPK-BT'], category: 'ELECTRONIC' },
  { classId: 33, className: 'Bushing', friendlyNameVi: 'Bạc lót trục (Bushing)', defaultItemCode: 'BSH-01', category: 'MECHANICAL' },
  { classId: 34, className: 'Curved_slice', friendlyNameVi: 'Miếng ghép cong mỏng', defaultItemCode: 'SLC-CRV', category: 'STRUCTURE' },
  { classId: 35, className: 'Driven_connector_-wheel-', friendlyNameVi: 'Khớp nối truyền động bánh xe', defaultItemCode: 'CON-WHL', category: 'MECHANICAL' },
  { classId: 36, className: 'Dual-decked_joint_brick_blue', friendlyNameVi: 'Khối gạch khớp 2 tầng (Xanh)', defaultItemCode: 'BRK-DD-BLU', aliasCodes: ['JNT-DD-BRICK-BLU'], category: 'STRUCTURE' },
  { classId: 37, className: 'Dual-decked_joint_brick_yellow', friendlyNameVi: 'Khối gạch khớp 2 tầng (Vàng)', defaultItemCode: 'BRK-DD-YEL', aliasCodes: ['JNT-DD-BRICK-YEL'], category: 'STRUCTURE' },
  { classId: 38, className: 'Dual_joint_part -Short-', friendlyNameVi: 'Khớp đôi ngắn', defaultItemCode: 'JNT-DL-SHT', category: 'MECHANICAL' },
  { classId: 39, className: 'Dual_joint_part_-Long-', friendlyNameVi: 'Khớp đôi dài', defaultItemCode: 'JNT-DL-LNG', category: 'MECHANICAL' },
  { classId: 40, className: 'Dual_servo_clip', friendlyNameVi: 'Kẹp Servo đôi', defaultItemCode: 'CLP-SRV-DL', category: 'MECHANICAL' },
  { classId: 41, className: 'Flat_head_shaft', friendlyNameVi: 'Trục đầu phẳng (Flat head shaft)', defaultItemCode: 'SFT-FLAT', category: 'MECHANICAL' },
  { classId: 42, className: 'Green_short_plug', friendlyNameVi: 'Chốt cắm ngắn (Xanh lá)', defaultItemCode: 'PLUG-GRN', category: 'ACCESSORY' },
  { classId: 43, className: 'I-shaped_brick', friendlyNameVi: 'Khối gạch chữ I', defaultItemCode: 'BRK-ISHAPE', category: 'STRUCTURE' },
  { classId: 44, className: 'IR_sensor', friendlyNameVi: 'Cảm biến hồng ngoại (IR)', defaultItemCode: 'SEN-IR', category: 'SENSOR' },
  { classId: 45, className: 'Joint_brick', friendlyNameVi: 'Khối gạch khớp nối', defaultItemCode: 'BRK-JNT', aliasCodes: ['JNT-BRICK-STD'], category: 'STRUCTURE' },
  { classId: 46, className: 'LED_lamp', friendlyNameVi: 'Mô-đun đèn LED RGB', defaultItemCode: 'LED-5MM-RGB', aliasCodes: ['ACT-LED', 'LED-RGB'], category: 'ELECTRONIC' },
  { classId: 47, className: 'Large_blade_L', friendlyNameVi: 'Cánh lớn (Trái)', defaultItemCode: 'BLD-LRG-L', category: 'STRUCTURE' },
  { classId: 48, className: 'Large_blade_R', friendlyNameVi: 'Cánh lớn (Phải)', defaultItemCode: 'BLD-LRG-R', category: 'STRUCTURE' },
  { classId: 49, className: 'Light_sensor', friendlyNameVi: 'Cảm biến ánh sáng quang trở', defaultItemCode: 'SEN-LIGHT', category: 'SENSOR' },
  { classId: 50, className: 'Long_blade -L-', friendlyNameVi: 'Cánh dài (Trái)', defaultItemCode: 'BLD-LNG-L', category: 'STRUCTURE' },
  { classId: 51, className: 'Long_blade -R-', friendlyNameVi: 'Cánh dài (Phải)', defaultItemCode: 'BLD-LNG-R', category: 'STRUCTURE' },
  { classId: 52, className: 'Long_finger', friendlyNameVi: 'Ngón tay kẹp robot dài', defaultItemCode: 'FNG-LNG', category: 'MECHANICAL' },
  { classId: 53, className: 'Main_1', friendlyNameVi: 'Bo mạch điều khiển Main 1 (MCU)', defaultItemCode: 'MAIN-01', aliasCodes: ['MAIN-1'], category: 'ELECTRONIC' },
  { classId: 54, className: 'Main_2', friendlyNameVi: 'Bo mạch điều khiển Main 2 (MCU)', defaultItemCode: 'MAIN-02', aliasCodes: ['MAIN-2'], category: 'ELECTRONIC' },
  { classId: 55, className: 'Motor', friendlyNameVi: 'Động cơ DC Motor giảm tốc', defaultItemCode: 'MOT-01', aliasCodes: ['ACT-MOTOR'], category: 'ELECTRONIC' },
  { classId: 56, className: 'Poly-directinal_wheel', friendlyNameVi: 'Bánh xe đa hướng Omni', defaultItemCode: 'WHEEL-OMNI', category: 'MECHANICAL' },
  { classId: 57, className: 'Poly_directional_wheel', friendlyNameVi: 'Bánh xe đa hướng Omni', defaultItemCode: 'WHEEL-OMNI', category: 'MECHANICAL' },
  { classId: 58, className: 'Red_plug', friendlyNameVi: 'Chốt cắm đỏ (Red plug)', defaultItemCode: 'PLUG-RED', category: 'ACCESSORY' },
  { classId: 59, className: 'Round_joint_brick', friendlyNameVi: 'Khối gạch khớp tròn', defaultItemCode: 'BRK-RND-JNT', aliasCodes: ['JNT-RND-BRICK'], category: 'STRUCTURE' },
  { classId: 60, className: 'Servo', friendlyNameVi: 'Động cơ RC Servo SG90', defaultItemCode: 'SERVO-SG90', aliasCodes: ['ACT-SERVO', 'SRV-01'], category: 'ELECTRONIC' },
  { classId: 61, className: 'Servo_wire -Blue-', friendlyNameVi: 'Dây cáp tín hiệu Servo (Xanh)', defaultItemCode: 'CAB-SRV-BLU', aliasCodes: ['WIRE-SRV-BLU'], category: 'CABLE' },
  { classId: 62, className: 'Servo_wire_-Short-', friendlyNameVi: 'Dây cáp tín hiệu Servo (Ngắn)', defaultItemCode: 'CAB-SRV-SHT', aliasCodes: ['WIRE-SRV-SHT'], category: 'CABLE' },
  { classId: 63, className: 'Servo_wire_Gray', friendlyNameVi: 'Dây cáp tín hiệu Servo (Xám)', defaultItemCode: 'CAB-SRV-GRY', aliasCodes: ['WIRE-SRV-GRY'], category: 'CABLE' },
  { classId: 64, className: 'Short_finger', friendlyNameVi: 'Ngón tay kẹp robot ngắn', defaultItemCode: 'FNG-SHT', category: 'MECHANICAL' },
  { classId: 65, className: 'Single_joint_part_blue', friendlyNameVi: 'Khớp đơn (Xanh dương)', defaultItemCode: 'JNT-SGL-BLU', category: 'MECHANICAL' },
  { classId: 66, className: 'Small_blade_L', friendlyNameVi: 'Cánh nhỏ (Trái)', defaultItemCode: 'BLD-SML-L', category: 'STRUCTURE' },
  { classId: 67, className: 'Small_blade_R', friendlyNameVi: 'Cánh nhỏ (Phải)', defaultItemCode: 'BLD-SML-R', category: 'STRUCTURE' },
  { classId: 68, className: 'Small_curved_panel', friendlyNameVi: 'Tấm ốp cong nhỏ', defaultItemCode: 'PNL-SML-CRV', category: 'STRUCTURE' },
  { classId: 69, className: 'Sound_sensor', friendlyNameVi: 'Cảm biến âm thanh (Sound)', defaultItemCode: 'SEN-SOUND', category: 'SENSOR' },
  { classId: 70, className: 'Square_frame', friendlyNameVi: 'Khung vuông đế (Square frame)', defaultItemCode: 'FRAME-01', category: 'STRUCTURE' },
  { classId: 71, className: 'Square_panel -Gray-', friendlyNameVi: 'Tấm ốp vuông (Xám)', defaultItemCode: 'PNL-SQR-GRY', category: 'STRUCTURE' },
  { classId: 72, className: 'Square_panel -White-', friendlyNameVi: 'Tấm ốp vuông (Trắng)', defaultItemCode: 'PNL-SQR-WHT', category: 'STRUCTURE' },
  { classId: 73, className: 'Square_sevro_clip', friendlyNameVi: 'Kẹp vuông Servo', defaultItemCode: 'CLP-SRV-SQR', category: 'MECHANICAL' },
  { classId: 74, className: 'Switch_main_1', friendlyNameVi: 'Công tắc nguồn Main 1', defaultItemCode: 'SW-MAIN-01', category: 'ELECTRONIC' },
  { classId: 75, className: 'Switch_main_2', friendlyNameVi: 'Công tắc nguồn Main 2', defaultItemCode: 'SW-MAIN-02', category: 'ELECTRONIC' },
  { classId: 76, className: 'Switch_wire_main_1', friendlyNameVi: 'Dây cáp công tắc Main 1', defaultItemCode: 'CAB-SW-M1', aliasCodes: ['WIRE-SW-M1'], category: 'CABLE' },
  { classId: 77, className: 'Switch_wire_main_2', friendlyNameVi: 'Dây cáp công tắc Main 2', defaultItemCode: 'CAB-SW-M2', aliasCodes: ['WIRE-SW-M2'], category: 'CABLE' },
  { classId: 78, className: 'Temp_hum_sensor', friendlyNameVi: 'Cảm biến nhiệt độ & độ ẩm DHT22', defaultItemCode: 'DHT22-AM2302', aliasCodes: ['SEN-TEMP-HUM'], category: 'SENSOR' },
  { classId: 79, className: 'Touch_sensor', friendlyNameVi: 'Cảm biến chạm (Touch sensor)', defaultItemCode: 'SEN-TOUCH', category: 'SENSOR' },
  { classId: 80, className: 'Turning_brick', friendlyNameVi: 'Khối xoay chuyển hướng', defaultItemCode: 'BRK-TURN', aliasCodes: ['WHL-TURN-BRICK'], category: 'MECHANICAL' },
  { classId: 81, className: 'Two_hole_slice_L', friendlyNameVi: 'Miếng ghép 2 lỗ (Trái)', defaultItemCode: 'SLC-2H-L', category: 'STRUCTURE' },
  { classId: 82, className: 'Two_hole_slice_R', friendlyNameVi: 'Miếng ghép 2 lỗ (Phải)', defaultItemCode: 'SLC-2H-R', category: 'STRUCTURE' },
  { classId: 83, className: 'Ultrasonic_sensor', friendlyNameVi: 'Cảm biến siêu âm HC-SR04', defaultItemCode: 'SR04-ULTRASONIC', aliasCodes: ['SEN-ULTRASONIC'], category: 'SENSOR' },
  { classId: 84, className: 'Wheel_hub_Tire', friendlyNameVi: 'Bánh xe kèm lốp cao su', defaultItemCode: 'WHEEL-TIRE', category: 'MECHANICAL' },
  { classId: 85, className: 'Yellow_long_plug', friendlyNameVi: 'Chốt cắm dài (Vàng)', defaultItemCode: 'PLUG-YEL', category: 'ACCESSORY' },
];

/** Backwards-compatible export alias used across camera modals */
export const YOLO11_85_CLASSES: TrainedClassDefinition[] = BEST_86_CLASSES;

/**
 * Normalizes component names/codes across dataset labels and UBTECH/ACM catalog naming
 * e.g. "3 x 3 joint brick" == "3x3_Joint_brick", "Dual-decked joint brick (Blue)" == "Dual-decked_joint_brick_blue"
 */
export function normalizeComponentToken(value: string): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/sevro/g, 'servo')
    .replace(/directinal/g, 'directional')
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]/g, '');
}

export const CLASS_NAME_TO_DEFINITION_MAP = new Map<string, TrainedClassDefinition>();
const NORMALIZED_CLASS_MAP = new Map<string, TrainedClassDefinition>();

BEST_86_CLASSES.forEach((c) => {
  CLASS_NAME_TO_DEFINITION_MAP.set(c.className.toLowerCase(), c);
  NORMALIZED_CLASS_MAP.set(normalizeComponentToken(c.className), c);
});

/**
 * Finds the trained class definition matching a class name, item code, or item name.
 * Accepts an optional secondary query (e.g. `findMatchingTrainedClass(item.code, item.name)`).
 */
export function findMatchingTrainedClass(
  query?: string | null,
  secondaryQuery?: string | null
): TrainedClassDefinition | undefined {
  const candidates = [query, secondaryQuery].filter(
    (v): v is string => Boolean(v && v.trim())
  );

  for (const raw of candidates) {
    const q = raw.trim().toLowerCase();
    const normQ = normalizeComponentToken(raw);

    // 1. Direct class name match
    const exact = CLASS_NAME_TO_DEFINITION_MAP.get(q);
    if (exact) return exact;

    // 2. Direct SKU or alias SKU code match
    const byCode = BEST_86_CLASSES.find(
      (c) =>
        c.defaultItemCode.toLowerCase() === q ||
        c.aliasCodes?.some((alias) => alias.toLowerCase() === q)
    );
    if (byCode) return byCode;

    // 3. Exact normalized token match (handles "3 x 3 joint brick", "Dual-decked joint brick (Blue)", "LED lamp", etc.)
    if (normQ) {
      const byNorm = NORMALIZED_CLASS_MAP.get(normQ);
      if (byNorm) return byNorm;

      const byNormFriendly = BEST_86_CLASSES.find(
        (c) => normalizeComponentToken(c.friendlyNameVi) === normQ
      );
      if (byNormFriendly) return byNormFriendly;
    }

    // 4. Substring / normalized match
    const bySubstring = BEST_86_CLASSES.find(
      (c) =>
        c.friendlyNameVi.toLowerCase().includes(q) ||
        q.includes(c.friendlyNameVi.toLowerCase()) ||
        (normQ.length >= 5 &&
          (normalizeComponentToken(c.className).includes(normQ) ||
            normQ.includes(normalizeComponentToken(c.className))))
    );
    if (bySubstring) return bySubstring;
  }

  return undefined;
}

/**
 * Checks if an AI detection from `best.pt` corresponds to a specific catalog/kit item.
 */
export function doesDetectionMatchItem(
  det: {
    classId?: number;
    className: string;
    suggestedItemCode?: string | null;
    candidateItemCodes?: string[];
  },
  item?: { code?: string | null; name?: string | null } | null
): boolean {
  if (!item) return false;
  const itemCode = (item.code || '').trim().toUpperCase();
  const itemName = (item.name || '').trim();

  if (itemCode) {
    if (det.suggestedItemCode && det.suggestedItemCode.toUpperCase() === itemCode) {
      return true;
    }
    if (det.candidateItemCodes?.some((c) => c.toUpperCase() === itemCode)) {
      return true;
    }
  }

  const detDef = CLASS_NAME_TO_DEFINITION_MAP.get(det.className.toLowerCase());
  if (detDef && itemCode) {
    if (
      detDef.defaultItemCode.toUpperCase() === itemCode ||
      detDef.aliasCodes?.some((a) => a.toUpperCase() === itemCode)
    ) {
      return true;
    }
  }

  const itemMatchedClass = findMatchingTrainedClass(item.code, item.name);
  if (itemMatchedClass) {
    if (
      itemMatchedClass.className.toLowerCase() === det.className.toLowerCase() ||
      (detDef && itemMatchedClass.defaultItemCode === detDef.defaultItemCode)
    ) {
      return true;
    }
  }

  const normDet = normalizeComponentToken(det.className);
  const normItemName = normalizeComponentToken(itemName);
  if (normDet && normItemName && normDet === normItemName) {
    return true;
  }

  return false;
}
