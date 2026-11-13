import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  X,
  Play,
  Square,
  Sparkles,
  Layers,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  ShieldCheck,
} from 'lucide-react';
import {
  detectFrameBase64,
  detectFrameFile,
  checkVisionHealth,
  type VisionDetection,
  type VisionDetectResponse,
} from '../../services/vision.service';
import { useModalDismiss } from '../../hooks/useModalDismiss';

export interface BorrowCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  totalAvailable: number;
  category?: { name: string };
}

export interface CameraBorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalogItems: BorrowCatalogItem[];
  onApplyBorrowItems: (
    items: Array<{ itemId: string; quantity: number }>,
    liveProof?: { dataUrl: string; timestamp: string }
  ) => void;
}

export interface StagedBorrowItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  maxAvailable: number;
  matchedFromAi?: string;
  confidence?: number;
}

export const UBTECH_FRIENDLY_NAMES: Record<string, string> = {
  Servo: 'Động cơ RC Servo (SG90)',
  Ultrasonic_sensor: 'Cảm biến siêu âm (HC-SR04)',
  Temp_hum_sensor: 'Cảm biến nhiệt ẩm (DHT22)',
  LED_lamp: 'Đèn LED RGB',
  Main_1: 'Bo mạch điều khiển Main 1',
  Main_2: 'Bo mạch điều khiển Main 2',
  Switch_main_1: 'Công tắc nguồn Main 1',
  Switch_main_2: 'Công tắc nguồn Main 2',
  Switch_wire_main_1: 'Cáp nối công tắc Main 1',
  Switch_wire_main_2: 'Cáp nối công tắc Main 2',
  IR_sensor: 'Cảm biến hồng ngoại (IR)',
  Light_sensor: 'Cảm biến ánh sáng',
  Sound_sensor: 'Cảm biến âm thanh',
  Touch_sensor: 'Cảm biến chạm',
  Motor: 'Động cơ DC Motor',
  Bluetooth_speaker: 'Loa Bluetooth',
  'Servo_wire -Blue-': 'Dây servo (Xanh dương)',
  Servo_wire_Gray: 'Dây servo (Xám)',
  'Servo_wire_-Short-': 'Dây servo (Ngắn)',
  Baseboard: 'Tấm đế lắp ráp (Baseboard)',
  Base_brick: 'Khối đế lắp ráp (Base brick)',
  Red_plug: 'Chốt cắm đỏ',
  Blue_short_plug: 'Chốt cắm ngắn xanh',
  Yellow_long_plug: 'Chốt cắm dài vàng',
  Wheel_hub_Tire: 'Bánh xe kèm lốp cao su',
  Poly_directional_wheel: 'Bánh xe đa hướng',
  'Poly-directinal_wheel': 'Bánh xe đa hướng',
};

// Known code aliases for matching classes to catalog
export const UBTECH_CODE_ALIASES: Record<string, string[]> = {
  Main_1: ['MAIN-01', 'MAIN-1', 'MAIN1'],
  Main_2: ['MAIN-02', 'MAIN-2', 'MAIN2'],
  Switch_main_1: ['SW-MAIN-01', 'SW-MAIN-1', 'SW-M1'],
  Switch_main_2: ['SW-MAIN-02', 'SW-MAIN-2', 'SW-M2'],
  Switch_wire_main_1: ['CAB-SW-M1', 'SW-WIRE-1', 'CAB-SW1'],
  Switch_wire_main_2: ['CAB-SW-M2', 'SW-WIRE-2', 'CAB-SW2'],
  IR_sensor: ['SEN-IR', 'IR-SENSOR', 'IR01'],
  Ultrasonic_sensor: ['SR04-ULTRASONIC', 'SEN-ULTRA', 'HC-SR04'],
  Temp_hum_sensor: ['DHT22-AM2302', 'SEN-DHT', 'DHT22'],
  Light_sensor: ['SEN-LIGHT', 'LIGHT-01'],
  Sound_sensor: ['SEN-SOUND', 'SOUND-01'],
  Touch_sensor: ['SEN-TOUCH', 'TOUCH-01'],
  LED_lamp: ['LED-5MM-RGB', 'LED-01', 'LED-RGB'],
  Servo: ['SERVO-SG90', 'SRV-01', 'SG90'],
  Motor: ['MOT-01', 'MOTOR-01', 'DC-MOTOR'],
  Bluetooth_speaker: ['SPK-BT-01', 'SPEAKER-BT'],
  'Servo_wire -Blue-': ['CAB-SRV-BLU', 'SRV-WIRE-BLU'],
  Servo_wire_Gray: ['CAB-SRV-GRY', 'SRV-WIRE-GRY'],
  'Servo_wire_-Short-': ['CAB-SRV-SHT', 'SRV-WIRE-SHT'],
  Baseboard: ['KIT-BASE-01', 'BASEBOARD-01'],
  Base_brick: ['BRK-BASE', 'BASE-BRICK'],
  Red_plug: ['PLUG-RED', 'PLUG-R'],
  Blue_short_plug: ['PLUG-BLU', 'PLUG-B'],
  Yellow_long_plug: ['PLUG-YEL', 'PLUG-Y'],
  Wheel_hub_Tire: ['WHEEL-TIRE', 'WHEEL-01'],
  Poly_directional_wheel: ['WHEEL-OMNI', 'OMNI-WHEEL'],
  'Poly-directinal_wheel': ['WHEEL-OMNI', 'OMNI-WHEEL'],
};

export const CameraBorrowModal: React.FC<CameraBorrowModalProps> = ({
  isOpen,
  onClose,
  catalogItems,
  onApplyBorrowItems,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isInFlightRef = useRef<boolean>(false);
  const intervalRef = useRef<number | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [permissionErrorMsg, setPermissionErrorMsg] = useState<string>('');
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [isServiceOnline, setIsServiceOnline] = useState<boolean | null>(null);

  const [rawDetections, setRawDetections] = useState<VisionDetection[]>([]);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [stagedItems, setStagedItems] = useState<Record<string, StagedBorrowItem>>({});
  const [liveCapturedPhoto, setLiveCapturedPhoto] = useState<{
    dataUrl: string;
    timestamp: string;
  } | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Helper to normalize strings for robust fuzzy matching
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Find corresponding catalog item by AI detected class or suggested code
  const findMatchingCatalogItem = useCallback(
    (className: string, suggestedCode?: string | null): BorrowCatalogItem | null => {
      // 1. Direct suggested code match
      if (suggestedCode) {
        const exact = catalogItems.find(
          (c) => c.code.toUpperCase() === suggestedCode.toUpperCase()
        );
        if (exact) return exact;
      }

      // 2. Code aliases lookup
      const aliases = UBTECH_CODE_ALIASES[className] || [];
      for (const alias of aliases) {
        const found = catalogItems.find(
          (c) => c.code.toUpperCase() === alias.toUpperCase()
        );
        if (found) return found;
      }

      // 3. Normalized code or name matching
      const normClass = normalize(className);
      for (const item of catalogItems) {
        const normCode = normalize(item.code);
        const normName = normalize(item.name);
        if (normCode === normClass || normName.includes(normClass) || normClass.includes(normCode)) {
          return item;
        }
      }

      return null;
    },
    [catalogItems]
  );

  // Clean up camera stream and tracks
  const stopCameraStream = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRecognizing(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Initialize camera stream
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraPermissionDenied(false);
    setPermissionErrorMsg('');
    setLiveCapturedPhoto(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt không hỗ trợ truy cập Camera (getUserMedia).');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setStatusNotice({
        type: 'info',
        text: 'Camera đã bật. Bấm "Bắt đầu nhận diện" để AI quét linh kiện cần mượn.',
      });
    } catch (err: any) {
      console.warn('Camera access denied:', err);
      setCameraActive(false);
      setCameraPermissionDenied(true);
      setPermissionErrorMsg(err.message || 'Không thể truy cập camera. Vui lòng cấp quyền.');
      setStatusNotice({
        type: 'warning',
        text: 'Không thể mở camera. Vui lòng kiểm tra quyền camera trong trình duyệt.',
      });
    }
  }, [facingMode, stopCameraStream]);

  // Check health on open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    checkVisionHealth()
      .then((res) => {
        if (isMounted) setIsServiceOnline(res.status === 'ok');
      })
      .catch(() => {
        if (isMounted) {
          setIsServiceOnline(false);
          setStatusNotice({
            type: 'warning',
            text: 'Dịch vụ AI Vision (cổng 5055) chưa sẵn sàng.',
          });
        }
      });

    startCameraStream();

    return () => {
      isMounted = false;
      stopCameraStream();
    };
  }, [isOpen, startCameraStream, stopCameraStream]);

  // Draw overlay bounding boxes
  const drawOverlay = useCallback(
    (detections: VisionDetection[]) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const displayWidth = video.clientWidth;
      const displayHeight = video.clientHeight;
      const naturalWidth = video.videoWidth || 640;
      const naturalHeight = video.videoHeight || 480;

      if (displayWidth === 0 || displayHeight === 0) return;

      canvas.width = displayWidth;
      canvas.height = displayHeight;
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const scaleX = displayWidth / naturalWidth;
      const scaleY = displayHeight / naturalHeight;

      for (const det of detections) {
        const { x1, y1, x2, y2 } = det.boundingBox;
        const rx = x1 * scaleX;
        const ry = y1 * scaleY;
        const rw = (x2 - x1) * scaleX;
        const rh = (y2 - y1) * scaleY;

        const matchedItem = findMatchingCatalogItem(det.className, det.suggestedItemCode);
        const strokeColor = matchedItem ? '#10B981' : '#F59E0B';

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rx, ry, rw, rh);

        const friendlyName =
          UBTECH_FRIENDLY_NAMES[det.className] ||
          matchedItem?.name ||
          det.className.replace(/_/g, ' ');

        const label = `${friendlyName} (${Math.round(det.confidence * 100)}%)`;

        ctx.font = 'bold 12px sans-serif';
        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = strokeColor;
        ctx.fillRect(rx, Math.max(0, ry - 22), textWidth + 12, 22);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, rx + 6, Math.max(15, ry - 6));
      }
    },
    [findMatchingCatalogItem]
  );

  // Process detections and stage matched items
  const processDetections = useCallback(
    (detections: VisionDetection[]) => {
      setRawDetections(detections);
      drawOverlay(detections);

      // Aggregate counts by matched catalog item
      const countsMap = new Map<
        string,
        { item: BorrowCatalogItem; count: number; className: string; confidence: number }
      >();

      for (const det of detections) {
        const item = findMatchingCatalogItem(det.className, det.suggestedItemCode);
        if (item) {
          const existing = countsMap.get(item.id);
          if (existing) {
            existing.count += 1;
            existing.confidence = Math.max(existing.confidence, det.confidence);
          } else {
            countsMap.set(item.id, {
              item,
              count: 1,
              className: det.className,
              confidence: det.confidence,
            });
          }
        }
      }

      setStagedItems((prev) => {
        const updated = { ...prev };
        for (const [itemId, info] of countsMap.entries()) {
          const maxAvail = info.item.totalAvailable;
          const currentQty = updated[itemId]?.quantity || 0;
          const newQty = Math.min(Math.max(currentQty, info.count), maxAvail);

          updated[itemId] = {
            itemId: info.item.id,
            itemCode: info.item.code,
            itemName: info.item.name,
            unit: info.item.unit,
            quantity: newQty > 0 ? newQty : 1,
            maxAvailable: maxAvail,
            matchedFromAi: info.className,
            confidence: info.confidence,
          };
        }
        return updated;
      });
    },
    [drawOverlay, findMatchingCatalogItem]
  );

  // Capture single frame for detection
  const captureAndDetect = useCallback(async () => {
    if (isInFlightRef.current) return;
    if (!videoRef.current || videoRef.current.readyState < 2) return;

    const video = videoRef.current;
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth || 640;
    offscreen.height = video.videoHeight || 480;

    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    const b64 = offscreen.toDataURL('image/jpeg', 0.8);

    isInFlightRef.current = true;
    try {
      const res: VisionDetectResponse = await detectFrameBase64(b64);
      if (res.success && res.detections) {
        setInferenceTime(res.inferenceTimeMs || null);
        processDetections(res.detections);

        const total = res.detections.length;
        if (total > 0) {
          setStatusNotice({
            type: 'success',
            text: `Nhận diện ${total} đối tượng linh kiện trong ${res.inferenceTimeMs}ms.`,
          });
        } else {
          setStatusNotice({
            type: 'info',
            text: `Đang quét: Chưa thấy linh kiện rõ ràng trong khung hình (${res.inferenceTimeMs}ms).`,
          });
        }
      }
    } catch (err: any) {
      console.warn('Inference error:', err);
    } finally {
      isInFlightRef.current = false;
    }
  }, [processDetections]);

  // Handle continuous recognition toggle
  const toggleRecognition = useCallback(() => {
    if (isRecognizing) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsRecognizing(false);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      setStatusNotice({ type: 'info', text: 'Đã tạm dừng nhận diện camera.' });
    } else {
      setIsRecognizing(true);
      captureAndDetect();
      intervalRef.current = window.setInterval(captureAndDetect, 1000);
      setStatusNotice({
        type: 'info',
        text: 'Đang liên tục quét và nhận diện linh kiện qua camera...',
      });
    }
  }, [captureAndDetect, isRecognizing]);

  // LIVE CAPTURE PHOTO WITH WATERMARK (Enforces strict real-time capture)
  const captureLivePhoto = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      setStatusNotice({
        type: 'warning',
        text: 'Camera chưa sẵn sàng để chụp ảnh. Vui lòng đợi trong giây lát.',
      });
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw live video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw Anti-Fraud Real-Time Watermark
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN');
    const timeStr = now.toLocaleTimeString('vi-VN');
    const fullStamp = `${dateStr} ${timeStr}`;

    // Bottom Watermark banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(0, canvas.height - 44, canvas.width, 44);

    ctx.fillStyle = '#10B981'; // Emerald
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('🔒 XÁC THỰC MƯỢN LINH KIỆN - LIVE CAMERA CAPTURE', 16, canvas.height - 17);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '13px monospace';
    const stampText = `🕒 ${fullStamp} | ACM-LIVE-${Date.now().toString(36).toUpperCase()}`;
    const textW = ctx.measureText(stampText).width;
    ctx.fillText(stampText, canvas.width - textW - 16, canvas.height - 17);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setLiveCapturedPhoto({ dataUrl, timestamp: fullStamp });

    // Run inference on captured frame
    isInFlightRef.current = true;
    setStatusNotice({
      type: 'info',
      text: `Đang phân tích ảnh chụp bàn giao lúc ${timeStr}...`,
    });

    detectFrameBase64(dataUrl)
      .then((res) => {
        if (res.success && res.detections) {
          setInferenceTime(res.inferenceTimeMs || null);
          processDetections(res.detections);
          setStatusNotice({
            type: 'success',
            text: `✅ Chụp ảnh thành công lúc ${timeStr}! Phát hiện ${res.detections.length} linh kiện trong ảnh bàn giao.`,
          });
        }
      })
      .catch((err) => {
        setStatusNotice({
          type: 'warning',
          text: `Đã chụp ảnh lúc ${timeStr}. Bạn có thể dùng ảnh này làm bằng chứng bàn giao.`,
        });
      })
      .finally(() => {
        isInFlightRef.current = false;
      });
  }, [processDetections]);

  // STRICT ANTI-FRAUD FILE HANDLER (Rejects old photos from yesterday)
  const handleStrictFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if file is older than today or from yesterday
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const fileTime = file.lastModified || 0;

    if (fileTime > 0 && fileTime < todayStart) {
      setStatusNotice({
        type: 'error',
        text: '❌ TỪ CHỐI ẢNH CŨ: Hệ thống không chấp nhận ảnh của ngày hôm qua hoặc cũ hơn. Vui lòng bật camera và chụp ảnh trực tiếp tại thời điểm hiện tại!',
      });
      return;
    }

    stopCameraStream();

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const fullStamp = `${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN')}`;
      setLiveCapturedPhoto({ dataUrl, timestamp: fullStamp });

      isInFlightRef.current = true;
      setStatusNotice({ type: 'info', text: 'Đang phân tích ảnh linh kiện mới chụp...' });

      try {
        const res = await detectFrameFile(file);
        if (res.success && res.detections) {
          setInferenceTime(res.inferenceTimeMs || null);
          processDetections(res.detections);
          setStatusNotice({
            type: 'success',
            text: `Nhận diện ảnh thành công: Phát hiện ${res.detections.length} linh kiện.`,
          });
        } else {
          setStatusNotice({
            type: 'warning',
            text: 'Không phát hiện linh kiện nào trong ảnh.',
          });
        }
      } catch (err: any) {
        setStatusNotice({
          type: 'error',
          text: `Lỗi nhận diện ảnh: ${err.message || 'Lỗi kết nối AI.'}`,
        });
      } finally {
        isInFlightRef.current = false;
      }
    };
    reader.readAsDataURL(file);
  };

  // Adjust staged quantity
  const handleQuantityChange = (itemId: string, qty: number) => {
    setStagedItems((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      const validQty = Math.max(1, Math.min(qty, current.maxAvailable));
      return {
        ...prev,
        [itemId]: { ...current, quantity: validQty },
      };
    });
  };

  // Remove staged item
  const handleRemoveStaged = (itemId: string) => {
    setStagedItems((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  // Confirm and apply to borrow form
  const handleConfirmApply = () => {
    const list = Object.values(stagedItems);
    if (list.length === 0) {
      setStatusNotice({
        type: 'warning',
        text: 'Chưa có linh kiện nào được chọn để thêm vào phiếu mượn.',
      });
      return;
    }

    const payload = list.map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
    }));

    stopCameraStream();
    onApplyBorrowItems(payload, liveCapturedPhoto || undefined);
    onClose();
  };

  const handleModalClose = () => {
    stopCameraStream();
    onClose();
  };

  const backdropDismiss = useModalDismiss(isOpen, handleModalClose);

  if (!isOpen) return null;

  return (
    <div
      {...backdropDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/75 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <span>Quét Camera AI nhận diện linh kiện mượn</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="h-3 w-3 mr-1 text-emerald-600" />
                  Live Anti-Fraud
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Nhận diện trực tiếp qua Camera thời gian thực. Nghiêm cấm sử dụng ảnh cũ từ ngày hôm qua.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status notice */}
        {statusNotice && (
          <div
            className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
              statusNotice.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : statusNotice.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : statusNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {statusNotice.type === 'error' ? (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              ) : statusNotice.type === 'warning' ? (
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              ) : statusNotice.type === 'success' ? (
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
              )}
              <span className="font-medium">{statusNotice.text}</span>
            </div>
            {inferenceTime !== null && (
              <span className="text-[11px] font-mono text-slate-500">AI: {inferenceTime}ms</span>
            )}
          </div>
        )}

        {/* Main Body: Grid 2 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Left Column: Camera Feed & Controls (7 cols) */}
          <div className="md:col-span-7 bg-slate-900 flex flex-col justify-between p-3 relative overflow-hidden">
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-700 shadow-inner">
              {liveCapturedPhoto ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <img
                    src={liveCapturedPhoto.dataUrl}
                    alt="Captured Proof"
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[11px] font-bold px-2 py-1 rounded shadow-md flex items-center space-x-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>ĐÃ CHỤP ẢNH HIỆN TẠI: {liveCapturedPhoto.timestamp}</span>
                  </div>
                </div>
              ) : cameraPermissionDenied ? (
                <div className="p-6 text-center text-slate-300 space-y-3">
                  <CameraOff className="h-10 w-10 text-rose-500 mx-auto" />
                  <p className="text-sm font-semibold text-rose-400">Không thể truy cập Camera</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    {permissionErrorMsg || 'Vui lòng cấp quyền truy cập Camera trong trình duyệt để quét linh kiện.'}
                  </p>
                  <button
                    type="button"
                    onClick={startCameraStream}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    <span>Thử lại</span>
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 pointer-events-none w-full h-full"
                  />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white text-xs">
                      Đang khởi động camera...
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Camera Toolbar Buttons */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex items-center space-x-2">
                {cameraActive && !liveCapturedPhoto && (
                  <button
                    type="button"
                    onClick={toggleRecognition}
                    className={`inline-flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
                      isRecognizing
                        ? 'bg-rose-600 hover:bg-rose-500'
                        : 'bg-blue-600 hover:bg-blue-500'
                    }`}
                  >
                    {isRecognizing ? (
                      <>
                        <Square className="h-3.5 w-3.5" />
                        <span>Dừng nhận diện</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        <span>Bắt đầu nhận diện</span>
                      </>
                    )}
                  </button>
                )}

                {/* Primary Button: CHỤP ẢNH HIỆN TẠI */}
                {cameraActive && !liveCapturedPhoto && (
                  <button
                    type="button"
                    onClick={captureLivePhoto}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 transition"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Chụp ảnh hiện tại (Live)</span>
                  </button>
                )}

                {liveCapturedPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setLiveCapturedPhoto(null);
                      startCameraStream();
                    }}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Chụp lại</span>
                  </button>
                )}

                {cameraActive && !liveCapturedPhoto && (
                  <button
                    type="button"
                    onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                    className="inline-flex items-center space-x-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Đổi Camera</span>
                  </button>
                )}
              </div>

              {/* Strict file capture button (fallback only for same-day photos) */}
              <label className="inline-flex cursor-pointer items-center space-x-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700">
                <Camera className="h-3.5 w-3.5 text-slate-400" />
                <span>Chụp bằng thiết bị</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleStrictFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Right Column: Detected & Staged Borrow Items (5 cols) */}
          <div className="md:col-span-5 bg-white border-l border-slate-200 p-4 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Linh kiện nhận diện ({Object.keys(stagedItems).length})
                  </h4>
                </div>
                <span className="text-[11px] text-slate-500">
                  {rawDetections.length} đối tượng AI
                </span>
              </div>

              {Object.keys(stagedItems).length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <Sparkles className="h-8 w-8 text-slate-300 mx-auto" />
                  <p>Đặt linh kiện trước Camera và bấm "Bắt đầu nhận diện" hoặc "Chụp ảnh hiện tại".</p>
                  <p className="text-[10px] text-slate-400">
                    Hỗ trợ bo mạch Main 1, Main 2, Công tắc, Cảm biến IR, Cáp servo, Động cơ...
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.values(stagedItems).map((item) => (
                    <div
                      key={item.itemId}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span className="truncate max-w-[200px]" title={item.itemName}>
                          [{item.itemCode}] {item.itemName}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStaged(item.itemId)}
                          className="text-slate-400 hover:text-rose-500 p-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Tồn khả dụng: <strong>{item.maxAvailable}</strong> {item.unit}</span>
                        {item.matchedFromAi && (
                          <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-mono">
                            AI: {item.matchedFromAi} ({Math.round((item.confidence || 0) * 100)}%)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <label className="text-[11px] text-slate-600 font-medium">Số lượng mượn:</label>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            min={1}
                            max={item.maxAvailable}
                            value={item.quantity}
                            onChange={(e) =>
                              handleQuantityChange(item.itemId, parseInt(e.target.value, 10) || 1)
                            }
                            className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-center font-bold focus:border-blue-500 focus:outline-none"
                          />
                          <span className="text-slate-500 text-[11px]">{item.unit}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Anti-fraud reminder notice & Actions */}
            <div className="pt-3 border-t border-slate-200 space-y-2 mt-3">
              <div className="flex items-start space-x-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Chỉ chấp nhận ảnh chụp thời gian thực tại chỗ. Ảnh cũ từ ngày hôm qua sẽ bị từ chối tự động.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApply}
                  disabled={Object.keys(stagedItems).length === 0}
                  className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Áp dụng vào phiếu mượn</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
