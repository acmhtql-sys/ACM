import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Upload,
  X,
  Play,
  Square,
  Sparkles,
  Layers,
  ArrowRight,
  Eye,
  HelpCircle,
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  detectFrameBase64,
  detectFrameFile,
  checkVisionHealth,
  type VisionDetection,
  type VisionDetectResponse,
} from '../../services/vision.service';
import type { ReturnCondition, ReturnInputRow } from '../../pages/borrowReturnPartial';
import { apiClient } from '../../services/api';

export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  unit?: string;
  isActive?: boolean;
}

export interface BorrowDetailItem {
  id: string;
  itemId: string;
  item?: { id: string; code: string; name: string; unit: string };
  quantity: number;
  returnedQuantity: number;
}

export interface BorrowRecord {
  id: string;
  requestNumber: string;
  borrowerName?: string;
  details?: BorrowDetailItem[];
}

export interface CameraReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  borrowRecord: BorrowRecord;
  onApplyReturnRows: (newRows: Record<string, ReturnInputRow>, suggestedNotes?: string) => void;
  catalogItems?: CatalogItem[];
}

export interface StagedReturnItem {
  detailId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  remaining: number;
  quantity: number;
  condition: ReturnCondition;
  matchedFromAi?: string;
  confidence?: number;
  detectedCount?: number;
}

export type DetectionMatchStatus = 'MATCHED_BORROW' | 'MATCHED_CATALOG_ONLY' | 'UNMAPPED' | 'CATALOG_UNVERIFIED';

export interface UniqueClassSummary {
  className: string;
  friendlyName: string;
  count: number;
  matchStatus: DetectionMatchStatus;
  suggestedItemCode?: string | null;
  matchedDetail?: BorrowDetailItem;
}

export const KNOWN_FRIENDLY_NAMES: Record<string, string> = {
  Servo: 'Động cơ RC Servo (SG90)',
  Ultrasonic_sensor: 'Cảm biến siêu âm (HC-SR04)',
  Temp_hum_sensor: 'Cảm biến nhiệt ẩm (DHT22)',
  LED_lamp: 'Đèn LED RGB',
};

export const getFriendlyClassName = (
  className: string,
  matchedDetail?: BorrowDetailItem,
  suggestedItemCode?: string | null
): string => {
  if (matchedDetail?.item?.name) {
    return matchedDetail.item.name;
  }
  if (KNOWN_FRIENDLY_NAMES[className]) {
    return KNOWN_FRIENDLY_NAMES[className];
  }
  return className;
};

export interface AnalyzedDetection {
  detectionIndex: number;
  classId: number;
  className: string;
  confidence: number;
  boundingBox: { x1: number; y1: number; x2: number; y2: number };
  suggestedItemCode?: string | null;
  matchStatus: DetectionMatchStatus;
  matchedDetail?: BorrowDetailItem;
  statusLabel: string;
}

export const CameraReturnModal: React.FC<CameraReturnModalProps> = ({
  isOpen,
  onClose,
  borrowRecord,
  onApplyReturnRows,
  catalogItems,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
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
  const [verifiedCatalog, setVerifiedCatalog] = useState<CatalogItem[]>(catalogItems || []);
  const [catalogLookupStatus, setCatalogLookupStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE'>(
    catalogItems && catalogItems.length > 0 ? 'READY' : 'IDLE'
  );

  // Sync catalogItems prop or fetch from API
  useEffect(() => {
    if (!isOpen) return;
    if (catalogItems && catalogItems.length > 0) {
      setVerifiedCatalog(catalogItems);
      setCatalogLookupStatus('READY');
      return;
    }

    let isMounted = true;
    setCatalogLookupStatus('LOADING');
    apiClient
      .get('/items?limit=500')
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success && Array.isArray(res.data.data)) {
          setVerifiedCatalog(res.data.data);
          setCatalogLookupStatus('READY');
        } else {
          setCatalogLookupStatus('UNAVAILABLE');
        }
      })
      .catch(() => {
        if (isMounted) {
          setCatalogLookupStatus('UNAVAILABLE');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, catalogItems]);

  const [rawDetections, setRawDetections] = useState<VisionDetection[]>([]);
  const [analyzedDetections, setAnalyzedDetections] = useState<AnalyzedDetection[]>([]);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [stagedItems, setStagedItems] = useState<Record<string, StagedReturnItem>>({});
  const [statusNotice, setStatusNotice] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'staged' | 'detections'>('staged');
  const [detectionFilter, setDetectionFilter] = useState<'ALL' | DetectionMatchStatus>('ALL');
  const [selectedClassHighlight, setSelectedClassHighlight] = useState<string | null>(null);
  const [isExpandedClasses, setIsExpandedClasses] = useState<boolean>(false);

    // Group analyzed detections by className for simple display bar (Requirement 2 & 3)
  const uniqueDetectedClasses = useMemo<UniqueClassSummary[]>(() => {
    if (!analyzedDetections || analyzedDetections.length === 0) return [];

    const map = new Map<string, UniqueClassSummary>();
    for (const det of analyzedDetections) {
      const existing = map.get(det.className);
      if (existing) {
        existing.count += 1;
        if (det.matchStatus === 'MATCHED_BORROW') {
          existing.matchStatus = 'MATCHED_BORROW';
          existing.matchedDetail = det.matchedDetail;
          existing.friendlyName = getFriendlyClassName(det.className, det.matchedDetail, det.suggestedItemCode);
        } else if (existing.matchStatus === 'UNMAPPED' && det.matchStatus === 'MATCHED_CATALOG_ONLY') {
          existing.matchStatus = 'MATCHED_CATALOG_ONLY';
          existing.suggestedItemCode = det.suggestedItemCode;
        }
      } else {
        map.set(det.className, {
          className: det.className,
          friendlyName: getFriendlyClassName(det.className, det.matchedDetail, det.suggestedItemCode),
          count: 1,
          matchStatus: det.matchStatus,
          suggestedItemCode: det.suggestedItemCode,
          matchedDetail: det.matchedDetail,
        });
      }
    }
    return Array.from(map.values());
  }, [analyzedDetections]);

  // Remaining borrow details that still have outstanding quantities
  const outstandingDetails = useMemo(() => {
    return (borrowRecord.details || []).filter(
      (d) => d.quantity > (d.returnedQuantity || 0)
    );
  }, [borrowRecord.details]);

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
          // ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Initialize or switch camera
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraPermissionDenied(false);
    setPermissionErrorMsg('');
    setUploadedPreview(null);

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
        text: 'Camera đã sẵn sàng. Bấm "Bắt đầu nhận diện" để AI quét linh kiện.',
      });
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraActive(false);
      setCameraPermissionDenied(true);
      setPermissionErrorMsg(
        err.message || 'Không thể truy cập camera. Vui lòng cấp quyền hoặc tải ảnh lên.'
      );
      setStatusNotice({
        type: 'warning',
        text: 'Không thể mở camera. Bạn có thể sử dụng nút "Tải ảnh linh kiện" phía dưới để tiếp tục.',
      });
    }
  }, [facingMode, stopCameraStream]);

  // Check backend vision service health on mount
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    checkVisionHealth()
      .then((res) => {
        if (isMounted) {
          setIsServiceOnline(res.status === 'ok');
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsServiceOnline(false);
          setStatusNotice({
            type: 'warning',
            text: 'Dịch vụ AI Vision (cổng 5055) chưa phản hồi. Vui lòng kiểm tra lại dịch vụ suy luận.',
          });
        }
      });

    startCameraStream();

    return () => {
      isMounted = false;
      stopCameraStream();
    };
  }, [isOpen, startCameraStream, stopCameraStream]);

  // Draw overlay bounding boxes on canvas (supports both live video and uploaded image preview)
  const drawOverlay = useCallback(
    (detectedList: AnalyzedDetection[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let displayWidth = 0;
      let displayHeight = 0;
      let naturalWidth = 640;
      let naturalHeight = 480;

      if (uploadedPreview && imageRef.current) {
        const img = imageRef.current;
        displayWidth = img.clientWidth || img.width;
        displayHeight = img.clientHeight || img.height;
        naturalWidth = img.naturalWidth || 640;
        naturalHeight = img.naturalHeight || 480;
      } else if (videoRef.current) {
        const video = videoRef.current;
        displayWidth = video.clientWidth;
        displayHeight = video.clientHeight;
        naturalWidth = video.videoWidth || 640;
        naturalHeight = video.videoHeight || 480;
      }

      if (displayWidth === 0 || displayHeight === 0) return;

      canvas.width = displayWidth;
      canvas.height = displayHeight;
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const scaleX = displayWidth / naturalWidth;
      const scaleY = displayHeight / naturalHeight;

      for (const det of detectedList) {
        const { x1, y1, x2, y2 } = det.boundingBox;
        const rx = x1 * scaleX;
        const ry = y1 * scaleY;
        const rw = (x2 - x1) * scaleX;
        const rh = (y2 - y1) * scaleY;

        let strokeColor = '#F59E0B'; // Amber default for unmapped
        let labelTag = '';

        if (det.matchStatus === 'MATCHED_BORROW') {
          strokeColor = '#10B981'; // Green
          labelTag = ' [Khớp phiếu]';
        } else if (det.matchStatus === 'MATCHED_CATALOG_ONLY') {
          strokeColor = '#3B82F6'; // Blue
          labelTag = ` [Khớp DM: ${det.suggestedItemCode}]`;
        } else if (det.matchStatus === 'CATALOG_UNVERIFIED') {
          strokeColor = '#8B5CF6'; // Purple
          labelTag = ' [Chưa xác minh DM]';
        } else {
          strokeColor = '#F59E0B'; // Amber
          labelTag = ' [Chưa ánh xạ]';
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rx, ry, rw, rh);

        const label = `${det.className} (${Math.round(det.confidence * 100)}%)${labelTag}`;
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = strokeColor;
        ctx.fillRect(rx, Math.max(0, ry - 20), textWidth + 8, 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, rx + 4, Math.max(14, ry - 5));
      }
    },
    [uploadedPreview]
  );

  // Match AI detections to outstanding borrow details and catalog mappings
  const processDetections = useCallback(
    (detectedList: VisionDetection[]) => {
      setRawDetections(detectedList);

      if (detectedList.length === 0) {
        setAnalyzedDetections([]);
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        return;
      }

      // Analyze every detected object with catalog verification
      const analyzed: AnalyzedDetection[] = detectedList.map((det, index) => {
        // Step 0: Check against verified active catalog from API
        const catalogMatch = det.suggestedItemCode
          ? verifiedCatalog.find(
              (c) =>
                c.isActive !== false &&
                c.code.toUpperCase() === det.suggestedItemCode?.toUpperCase()
            )
          : null;

        // Step 1: Check match with borrow details
        // Ground truth: Must match actual Item ID or verified Item Code.
        // Fuzzy name is NOT used as the sole proof to auto-record returns.
        const match = outstandingDetails.find((d) => {
          const itemCode = d.item?.code || '';
          const itemId = d.itemId || d.item?.id || '';
          if (catalogMatch && (itemId === catalogMatch.id || itemCode.toUpperCase() === catalogMatch.code.toUpperCase())) {
            return true;
          }
          if (
            det.suggestedItemCode &&
            itemCode.toUpperCase() === det.suggestedItemCode.toUpperCase()
          ) {
            return true;
          }
          return false;
        });

        if (match) {
          return {
            detectionIndex: index + 1,
            classId: det.classId,
            className: det.className,
            confidence: det.confidence,
            boundingBox: det.boundingBox,
            suggestedItemCode: det.suggestedItemCode || match.item?.code || null,
            matchStatus: 'MATCHED_BORROW',
            matchedDetail: match,
            statusLabel: `Khớp phiếu mượn: ${match.item?.name || match.itemId} (Còn mượn: ${
              match.quantity - (match.returnedQuantity || 0)
            })`,
          };
        }

        // Step 2: Not in current borrow request
        if (det.suggestedItemCode) {
          // If catalog service is loading or unavailable, fail safe to CATALOG_UNVERIFIED
          if (catalogLookupStatus === 'UNAVAILABLE' || catalogLookupStatus === 'LOADING') {
            return {
              detectionIndex: index + 1,
              classId: det.classId,
              className: det.className,
              confidence: det.confidence,
              boundingBox: det.boundingBox,
              suggestedItemCode: det.suggestedItemCode,
              matchStatus: 'CATALOG_UNVERIFIED',
              statusLabel: catalogLookupStatus === 'LOADING'
                ? 'Đang đồng bộ danh mục linh kiện...'
                : 'Chưa thể xác minh danh mục: Dịch vụ tra cứu không khả dụng',
            };
          }

          // Only assign MATCHED_CATALOG_ONLY when Item code is verified to exist and be active in catalog
          if (catalogMatch) {
            return {
              detectionIndex: index + 1,
              classId: det.classId,
              className: det.className,
              confidence: det.confidence,
              boundingBox: det.boundingBox,
              suggestedItemCode: catalogMatch.code,
              matchStatus: 'MATCHED_CATALOG_ONLY',
              statusLabel: `Khớp danh mục ACM: ${catalogMatch.code} - ${catalogMatch.name} (Không thuộc phiếu mượn này)`,
            };
          }

          // If code does not exist in active catalog
          return {
            detectionIndex: index + 1,
            classId: det.classId,
            className: det.className,
            confidence: det.confidence,
            boundingBox: det.boundingBox,
            suggestedItemCode: null,
            matchStatus: 'UNMAPPED',
            statusLabel: `Mã '${det.suggestedItemCode}' không tồn tại trong danh mục linh kiện hoạt động`,
          };
        }

        // If no suggestedItemCode was provided by AI model
        return {
          detectionIndex: index + 1,
          classId: det.classId,
          className: det.className,
          confidence: det.confidence,
          boundingBox: det.boundingBox,
          suggestedItemCode: null,
          matchStatus: 'UNMAPPED',
          statusLabel: 'Chưa có ánh xạ trong danh mục linh kiện ACM',
        };
      });

      setAnalyzedDetections(analyzed);
      drawOverlay(analyzed);

      // Auto-stage matched borrow items
      const matchedDetections = analyzed.filter(
        (a): a is AnalyzedDetection & { matchedDetail: BorrowDetailItem } =>
          a.matchStatus === 'MATCHED_BORROW' && Boolean(a.matchedDetail)
      );

      // Group counts by detailId
      const countsByDetailId: Record<string, { count: number; bestDet: AnalyzedDetection }> = {};
      for (const m of matchedDetections) {
        const id = m.matchedDetail.id;
        if (!countsByDetailId[id]) {
          countsByDetailId[id] = { count: 1, bestDet: m };
        } else {
          countsByDetailId[id].count += 1;
          if (m.confidence > countsByDetailId[id].bestDet.confidence) {
            countsByDetailId[id].bestDet = m;
          }
        }
      }

      setStagedItems((prev) => {
        const updated = { ...prev };
        for (const [detailId, info] of Object.entries(countsByDetailId)) {
          const match = info.bestDet.matchedDetail;
          if (!match) continue;
          const remaining = match.quantity - (match.returnedQuantity || 0);
          // Clamp quantity to remaining outstanding
          const nextQty = Math.min(Math.max(info.count, 1), remaining);

          updated[detailId] = {
            detailId,
            itemCode: match.item?.code || match.itemId,
            itemName: match.item?.name || 'Linh kiện',
            unit: match.item?.unit || 'cái',
            remaining,
            quantity: nextQty,
            condition: updated[detailId]?.condition || 'GOOD',
            matchedFromAi: info.bestDet.className,
            confidence: info.bestDet.confidence,
            detectedCount: info.count,
          };
        }
        return updated;
      });
    },
    [outstandingDetails, drawOverlay, verifiedCatalog, catalogLookupStatus]
  );

  // Capture single frame and run AI inference
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
          const matchedCount = res.detections.filter((d) =>
            outstandingDetails.some(
              (o) =>
                (d.suggestedItemCode &&
                  o.item?.code?.toUpperCase() === d.suggestedItemCode.toUpperCase()) ||
                o.item?.name?.toLowerCase().includes(d.className.toLowerCase())
            )
          ).length;

          if (matchedCount > 0) {
            setStatusNotice({
              type: 'success',
              text: `Nhận diện ${total} đối tượng (${matchedCount} khớp phiếu mượn) trong ${res.inferenceTimeMs}ms.`,
            });
          } else {
            setStatusNotice({
              type: 'warning',
              text: `Phát hiện ${total} đối tượng nhưng chưa khớp linh kiện nào trong phiếu mượn này. Xem tab "Chi tiết AI" để đối chiếu.`,
            });
          }
        } else {
          setStatusNotice({
            type: 'info',
            text: `Không phát hiện đối tượng nào trong khung hình (${res.inferenceTimeMs}ms).`,
          });
        }
      }
    } catch (err: any) {
      console.warn('Inference error:', err);
    } finally {
      isInFlightRef.current = false;
    }
  }, [outstandingDetails, processDetections]);

  // Handle Recognition toggle (Start / Stop)
  const toggleRecognition = useCallback(() => {
    if (isRecognizing) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsRecognizing(false);
      // Clear overlay canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      setStatusNotice({ type: 'info', text: 'Đã tạm dừng nhận diện camera.' });
    } else {
      setIsRecognizing(true);
      captureAndDetect(); // trigger immediately
      intervalRef.current = window.setInterval(captureAndDetect, 1000); // 1-second interval
      setStatusNotice({
        type: 'info',
        text: 'Đang liên tục quét và nhận diện linh kiện qua camera...',
      });
    }
  }, [captureAndDetect, isRecognizing]);

  // Handle Manual File Upload fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCameraStream();

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploadedPreview(dataUrl);

      isInFlightRef.current = true;
      setStatusNotice({ type: 'info', text: 'Đang phân tích ảnh linh kiện đã tải lên...' });

      try {
        const res = await detectFrameFile(file);
        if (res.success && res.detections) {
          setInferenceTime(res.inferenceTimeMs || null);
          processDetections(res.detections);

          const total = res.detections.length;
          const matchedCount = res.detections.filter((d) =>
            outstandingDetails.some(
              (o) =>
                (d.suggestedItemCode &&
                  o.item?.code?.toUpperCase() === d.suggestedItemCode.toUpperCase()) ||
                o.item?.name?.toLowerCase().includes(d.className.toLowerCase())
            )
          ).length;

          if (matchedCount > 0) {
            setStatusNotice({
              type: 'success',
              text: `Nhận diện ảnh thành công: ${total} đối tượng (${matchedCount} khớp phiếu mượn) trong ${res.inferenceTimeMs}ms.`,
            });
          } else {
            setStatusNotice({
              type: 'warning',
              text: `Phát hiện ${total} đối tượng trong ảnh nhưng không thuộc phiếu mượn này. Xem tab "Chi tiết AI" để kiểm tra.`,
            });
          }
        } else {
          setStatusNotice({
            type: 'warning',
            text: 'Không nhận diện được linh kiện nào trong ảnh tải lên. Vui lòng chọn linh kiện thủ công.',
          });
        }
      } catch (err: any) {
        setStatusNotice({
          type: 'error',
          text: `Lỗi nhận diện ảnh: ${err.message || 'Không thể kết nối dịch vụ AI.'}`,
        });
      } finally {
        isInFlightRef.current = false;
      }
    };
    reader.readAsDataURL(file);
  };

  // Add an item manually to staged items
  const handleAddManualItem = (detailId: string) => {
    const match = outstandingDetails.find((d) => d.id === detailId);
    if (!match) return;

    const remaining = match.quantity - (match.returnedQuantity || 0);
    setStagedItems((prev) => ({
      ...prev,
      [match.id]: {
        detailId: match.id,
        itemCode: match.item?.code || match.itemId,
        itemName: match.item?.name || 'Linh kiện',
        unit: match.item?.unit || 'cái',
        remaining,
        quantity: Math.min(1, remaining),
        condition: 'GOOD',
      },
    }));
  };

  // Associate an AI detection manually with a borrow detail
  const handleAssignDetectionToBorrowDetail = (
    det: AnalyzedDetection,
    borrowDetailId: string
  ) => {
    const match = outstandingDetails.find((d) => d.id === borrowDetailId);
    if (!match) return;

    const remaining = match.quantity - (match.returnedQuantity || 0);
    setStagedItems((prev) => {
      const currentQty = prev[match.id]?.quantity || 0;
      const nextQty = Math.min(Math.max(currentQty + 1, 1), remaining);
      return {
        ...prev,
        [match.id]: {
          detailId: match.id,
          itemCode: match.item?.code || match.itemId,
          itemName: match.item?.name || 'Linh kiện',
          unit: match.item?.unit || 'cái',
          remaining,
          quantity: nextQty,
          condition: prev[match.id]?.condition || 'GOOD',
          matchedFromAi: `${det.className} (Gán thủ công)`,
          confidence: det.confidence,
        },
      };
    });
    setActiveTab('staged');
  };

  // Remove staged item
  const handleRemoveStaged = (detailId: string) => {
    setStagedItems((prev) => {
      const next = { ...prev };
      delete next[detailId];
      return next;
    });
  };

  // Update staged quantity (strictly clamped to remaining)
  const handleUpdateQuantity = (detailId: string, val: number) => {
    setStagedItems((prev) => {
      const item = prev[detailId];
      if (!item) return prev;
      const clamped = Math.max(1, Math.min(val, item.remaining));
      return {
        ...prev,
        [detailId]: { ...item, quantity: clamped },
      };
    });
  };

  // Update staged condition
  const handleUpdateCondition = (detailId: string, cond: ReturnCondition) => {
    setStagedItems((prev) => {
      const item = prev[detailId];
      if (!item) return prev;
      return {
        ...prev,
        [detailId]: { ...item, condition: cond },
      };
    });
  };

  // Apply staged items to the main return modal
  const handleConfirmStaged = () => {
    const itemsList = Object.values(stagedItems);
    if (itemsList.length === 0) {
      setStatusNotice({
        type: 'warning',
        text: 'Vui lòng chọn ít nhất 1 linh kiện cần hoàn trả.',
      });
      return;
    }

    const rows: Record<string, ReturnInputRow> = {};
    const notesArr: string[] = [];

    for (const item of itemsList) {
      rows[item.detailId] = {
        quantity: String(item.quantity),
        condition: item.condition,
      };
      if (item.matchedFromAi) {
        notesArr.push(
          `[AI: ${item.matchedFromAi} (${Math.round((item.confidence || 0) * 100)}%)]`
        );
      }
    }

    const suggestedNotes =
      notesArr.length > 0 ? `Nhận diện qua Camera: ${notesArr.join(', ')}` : undefined;

    stopCameraStream();
    onApplyReturnRows(rows, suggestedNotes);
    onClose();
  };

  const handleModalClose = () => {
    stopCameraStream();
    onClose();
  };

  // Filtered detections for the detections tab
  const filteredDetections = useMemo(() => {
    if (detectionFilter === 'ALL') return analyzedDetections;
    return analyzedDetections.filter((d) => d.matchStatus === detectionFilter);
  }, [analyzedDetections, detectionFilter]);

  const stats = useMemo(() => {
    const total = analyzedDetections.length;
    const matchedBorrow = analyzedDetections.filter(
      (d) => d.matchStatus === 'MATCHED_BORROW'
    ).length;
    const matchedCatalog = analyzedDetections.filter(
      (d) => d.matchStatus === 'MATCHED_CATALOG_ONLY'
    ).length;
    const unverified = analyzedDetections.filter(
      (d) => d.matchStatus === 'CATALOG_UNVERIFIED'
    ).length;
    const unmapped = analyzedDetections.filter((d) => d.matchStatus === 'UNMAPPED').length;
    return { total, matchedBorrow, matchedCatalog, unverified, unmapped };
  }, [analyzedDetections]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="flex h-[94vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <span>Nhận diện Hoàn trả Linh kiện qua Camera AI</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  MVP Feature
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Phiếu mượn: <strong className="text-slate-700">{borrowRecord.requestNumber}</strong>{' '}
                | Người mượn: {borrowRecord.borrowerName || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {isServiceOnline === false && (
              <span className="inline-flex items-center text-xs text-amber-600 font-medium">
                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                AI Service Offline
              </span>
            )}
            <button
              type="button"
              onClick={handleModalClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status banner */}
        {statusNotice && (
          <div
            className={`flex items-center justify-between px-4 py-2 text-xs border-b ${
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
              {statusNotice.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-600" />}
              {statusNotice.type === 'warning' && (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              {statusNotice.type === 'success' && (
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              )}
              {statusNotice.type === 'info' && <Sparkles className="h-4 w-4 text-blue-600" />}
              <span>{statusNotice.text}</span>
            </div>
            {inferenceTime !== null && (
              <span className="font-mono text-[11px] text-slate-500">
                Inference: {inferenceTime}ms
              </span>
            )}
          </div>
        )}

        {/* Main Content Layout: Left Camera / Right Staged & Detections Panels */}
        <div className="grid flex-1 grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Column: Camera Viewport */}
          <div className="relative flex flex-col items-stretch justify-start bg-slate-900 md:col-span-7 p-3 overflow-hidden">
            {/* Simple AI Recognition Summary Bar (Directly Above Camera Viewport) */}
            <div
              data-testid="ai-simple-recognition-bar"
              className="mb-2.5 w-full rounded-xl bg-slate-800/95 border border-slate-700/80 p-2.5 text-xs shadow-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center space-x-1.5 text-slate-200 font-semibold shrink-0">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/20 text-blue-400">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <span>AI đã nhận diện:</span>
                </div>

                {uniqueDetectedClasses.length > 0 && (
                  <div className="hidden sm:flex items-center space-x-3 text-[10px] text-slate-400">
                    <span className="flex items-center space-x-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>Đủ điều kiện trả</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      <span>Khớp mã ACM</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span>Chưa ánh xạ</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Chips container */}
              <div
                data-testid="ai-recognition-chips"
                className="mt-2 flex flex-wrap items-center gap-1.5"
              >
                {uniqueDetectedClasses.length === 0 ? (
                  <span
                    data-testid="ai-empty-recognition"
                    className="italic text-slate-400 text-[11px] py-0.5"
                  >
                    Chưa nhận diện được
                  </span>
                ) : (
                  <>
                    {(isExpandedClasses
                      ? uniqueDetectedClasses
                      : uniqueDetectedClasses.slice(0, 4)
                    ).map((c) => {
                      const isSelected = selectedClassHighlight === c.className;
                      let badgeColors = 'border-amber-500/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25';
                      let dotColor = 'bg-amber-400';
                      let statusText = 'Chưa ánh xạ';

                      if (c.matchStatus === 'MATCHED_BORROW') {
                        badgeColors = 'border-emerald-500/70 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30';
                        dotColor = 'bg-emerald-400';
                        statusText = 'Đủ điều kiện hoàn trả';
                      } else if (c.matchStatus === 'MATCHED_CATALOG_ONLY') {
                        badgeColors = 'border-blue-500/70 bg-blue-500/20 text-blue-200 hover:bg-blue-500/30';
                        dotColor = 'bg-blue-400';
                        statusText = `Khớp danh mục (${c.suggestedItemCode || ''})`;
                      }

                      return (
                        <button
                          key={c.className}
                          type="button"
                          data-testid={`ai-chip-${c.className}`}
                          onClick={() => {
                            setSelectedClassHighlight((prev) =>
                              prev === c.className ? null : c.className
                            );
                          }}
                          title={`${c.friendlyName} - ${statusText}. Bấm để ${
                            isSelected ? 'bỏ lọc' : 'nổi bật bounding box'
                          }`}
                          className={`inline-flex items-center space-x-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${badgeColors} ${
                            isSelected
                              ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 font-bold scale-105 shadow'
                              : 'opacity-90'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                          <span>{c.friendlyName}</span>
                          {c.count > 1 && (
                            <span className="ml-1 rounded-full bg-slate-900/50 px-1.5 py-0.2 text-[10px] font-bold">
                              x{c.count}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {/* Expand / Collapse Button if > 4 classes */}
                    {uniqueDetectedClasses.length > 4 && (
                      <button
                        type="button"
                        data-testid="ai-expand-classes-toggle"
                        onClick={() => setIsExpandedClasses((prev) => !prev)}
                        className="inline-flex items-center space-x-1 rounded-lg border border-slate-600 bg-slate-700/80 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600 transition"
                      >
                        {isExpandedClasses ? (
                          <>
                            <span>Thu gọn</span>
                            <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            <span>+{uniqueDetectedClasses.length - 4} loại khác</span>
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    )}

                    {/* Reset filter button if a class is active */}
                    {selectedClassHighlight && (
                      <button
                        type="button"
                        data-testid="ai-clear-highlight"
                        onClick={() => setSelectedClassHighlight(null)}
                        className="ml-auto inline-flex items-center space-x-1 text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Xem tất cả</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Viewport container */}
            <div className="relative flex flex-1 w-full min-h-[280px] items-center justify-center overflow-hidden rounded-xl bg-black border border-slate-800 shadow-inner">
              {uploadedPreview ? (
                <>
                  <img
                    ref={imageRef}
                    src={uploadedPreview}
                    alt="Linh kiện tải lên"
                    className="h-full w-full object-contain"
                    onLoad={() => drawOverlay(analyzedDetections)}
                  />
                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  />
                </>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full object-contain ${!cameraActive ? 'hidden' : ''}`}
                  />
                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  />
                </>
              )}

              {/* Camera placeholder when not active and no uploaded image */}
              {!cameraActive && !uploadedPreview && (
                <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  <CameraOff className="mb-3 h-12 w-12 text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">Camera chưa được kích hoạt</p>
                  <p className="mt-1 text-xs text-slate-500 max-w-xs">
                    {permissionErrorMsg ||
                      'Cấp quyền truy cập camera để bắt đầu nhận diện real-time.'}
                  </p>
                  <div className="mt-4 flex space-x-2">
                    <button
                      type="button"
                      onClick={startCameraStream}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Bật lại Camera
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Camera Controls Toolbar */}
            <div className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2 text-xs text-slate-300">
              <div className="flex items-center space-x-2">
                {cameraActive && (
                  <button
                    type="button"
                    onClick={toggleRecognition}
                    className={`inline-flex items-center space-x-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
                      isRecognizing
                        ? 'bg-rose-600 hover:bg-rose-500'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    {isRecognizing ? (
                      <>
                        <Square className="h-3.5 w-3.5 fill-current" />
                        <span>Dừng nhận diện</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Bắt đầu nhận diện</span>
                      </>
                    )}
                  </button>
                )}

                {cameraActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                    }}
                    className="inline-flex items-center space-x-1 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Đổi Camera</span>
                  </button>
                )}
              </div>

              {/* Upload fallback button */}
              <label className="inline-flex cursor-pointer items-center space-x-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600">
                <Upload className="h-3.5 w-3.5 text-slate-300" />
                <span>Tải ảnh linh kiện</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Right Column: Tabbed Interface (Staged Return Items & AI Detections Breakdown) */}
          <div className="flex flex-col md:col-span-5 bg-white border-l border-slate-200 p-4 overflow-hidden">
            {/* AI Summary Banner */}
            {stats.total > 0 && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span className="flex items-center space-x-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                    <span>AI phát hiện: {stats.total} đối tượng</span>
                  </span>
                  <div className="flex space-x-1 text-[10px]">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
                      {stats.matchedBorrow} khớp phiếu
                    </span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 font-bold text-blue-800">
                      {stats.matchedCatalog} khớp DM
                    </span>
                    {stats.unverified > 0 && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 font-bold text-purple-800">
                        {stats.unverified} chưa xác minh
                      </span>
                    )}
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                      {stats.unmapped} chưa ánh xạ
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('staged')}
                className={`flex-1 pb-2 text-center border-b-2 transition ${
                  activeTab === 'staged'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>Linh kiện hoàn trả ({Object.keys(stagedItems).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('detections')}
                className={`flex-1 pb-2 text-center border-b-2 transition ${
                  activeTab === 'detections'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>Chi tiết AI nhận diện ({analyzedDetections.length})</span>
              </button>
            </div>

            {/* Tab 1: Staged Items */}
            {activeTab === 'staged' && (
              <div className="flex flex-1 flex-col overflow-hidden pt-2.5">
                <div className="rounded-lg bg-blue-50/80 p-2 text-[11px] text-blue-800 border border-blue-100">
                  <p>
                    <strong>Quy tắc an toàn:</strong> AI chỉ đóng vai trò gợi ý. Bạn phải kiểm tra
                    thực tế số lượng và tình trạng trước khi áp dụng.
                  </p>
                </div>

                <div className="mt-2.5 flex-1 space-y-2.5 overflow-y-auto pr-1">
                  {Object.keys(stagedItems).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                      <Sparkles className="mb-2 h-8 w-8 text-slate-300" />
                      <p className="text-xs font-semibold text-slate-600">
                        Chưa có linh kiện nào được nhận diện hoặc chọn hoàn trả
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 max-w-xs">
                        Đưa linh kiện vào camera, kiểm tra tab "Chi tiết AI" hoặc chọn thủ công bên
                        dưới.
                      </p>
                    </div>
                  ) : (
                    Object.values(stagedItems).map((item) => (
                      <div
                        key={item.detailId}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-semibold text-slate-900">{item.itemName}</div>
                            <div className="text-[11px] text-slate-500">Mã: {item.itemCode}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveStaged(item.detailId)}
                            className="rounded p-1 text-slate-400 hover:text-rose-600"
                            title="Bỏ chọn"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {item.matchedFromAi && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center space-x-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                              <Sparkles className="h-3 w-3" />
                              <span>
                                AI: {item.matchedFromAi} (
                                {Math.round((item.confidence || 0) * 100)}%)
                              </span>
                            </span>
                            {item.detectedCount && item.detectedCount > item.remaining && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                                Phát hiện {item.detectedCount} cái (Giới hạn trả {item.remaining})
                              </span>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                          <div>
                            <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                              Số lượng trả (tối đa {item.remaining}):
                            </label>
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                min={1}
                                max={item.remaining}
                                value={item.quantity}
                                onChange={(e) =>
                                  handleUpdateQuantity(
                                    item.detailId,
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                              />
                              <span className="text-[10px] text-slate-500">{item.unit}</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                              Tình trạng kiểm tra:
                            </label>
                            <select
                              value={item.condition}
                              onChange={(e) =>
                                handleUpdateCondition(
                                  item.detailId,
                                  e.target.value as ReturnCondition
                                )
                              }
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                            >
                              <option value="GOOD">Tốt (Khả dụng)</option>
                              <option value="DAMAGED">Hỏng (Cách ly)</option>
                              <option value="LOST">Báo mất</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Raw AI Detections Breakdown */}
            {activeTab === 'detections' && (
              <div className="flex flex-1 flex-col overflow-hidden pt-2.5">
                {/* Filter Sub-bar */}
                <div className="flex items-center space-x-1 mb-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('ALL')}
                    className={`rounded px-2 py-0.5 font-medium ${
                      detectionFilter === 'ALL'
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả ({analyzedDetections.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('MATCHED_BORROW')}
                    className={`rounded px-2 py-0.5 font-medium ${
                      detectionFilter === 'MATCHED_BORROW'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    Khớp phiếu ({stats.matchedBorrow})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('MATCHED_CATALOG_ONLY')}
                    className={`rounded px-2 py-0.5 font-medium ${
                      detectionFilter === 'MATCHED_CATALOG_ONLY'
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    Khớp DM ({stats.matchedCatalog})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('UNMAPPED')}
                    className={`rounded px-2 py-0.5 font-medium ${
                      detectionFilter === 'UNMAPPED'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    Chưa ánh xạ ({stats.unmapped})
                  </button>
                </div>

                {/* Detections List */}
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {filteredDetections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                      <HelpCircle className="mb-2 h-7 w-7 text-slate-300" />
                      <p className="text-xs font-medium text-slate-500">
                        Không có đối tượng nhận diện nào trong nhóm này.
                      </p>
                    </div>
                  ) : (
                    filteredDetections.map((det) => (
                      <div
                        key={det.detectionIndex}
                        className={`rounded-lg border p-2 text-xs space-y-1.5 transition ${
                          det.matchStatus === 'MATCHED_BORROW'
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : det.matchStatus === 'MATCHED_CATALOG_ONLY'
                            ? 'border-blue-200 bg-blue-50/40'
                            : 'border-slate-200 bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-[10px] text-slate-400">
                              #{det.detectionIndex}
                            </span>
                            <span className="font-bold text-slate-900">{det.className}</span>
                            <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700">
                              {Math.round(det.confidence * 100)}%
                            </span>
                          </div>

                          {/* Status Badge */}
                          {det.matchStatus === 'MATCHED_BORROW' && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              Khớp phiếu mượn
                            </span>
                          )}
                          {det.matchStatus === 'MATCHED_CATALOG_ONLY' && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                              Khớp DM khác
                            </span>
                          )}
                          {det.matchStatus === 'CATALOG_UNVERIFIED' && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                              Chưa xác minh DM
                            </span>
                          )}
                          {det.matchStatus === 'UNMAPPED' && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              Chưa ánh xạ
                            </span>
                          )}
                        </div>

                        {/* Status Label Description */}
                        <div className="text-[11px] text-slate-600">{det.statusLabel}</div>

                        {/* Bounding box dimensions */}
                        <div className="font-mono text-[10px] text-slate-400">
                          BBox: [{det.boundingBox.x1}, {det.boundingBox.y1}] - [
                          {det.boundingBox.x2}, {det.boundingBox.y2}]
                        </div>

                        {/* Action buttons */}
                        <div className="pt-1 flex items-center justify-between border-t border-slate-200/50">
                          {det.matchStatus === 'MATCHED_BORROW' && det.matchedDetail ? (
                            stagedItems[det.matchedDetail.id] ? (
                              <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700">
                                <Check className="h-3 w-3" />
                                <span>Đã thêm vào danh sách hoàn trả</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddManualItem(det.matchedDetail!.id)
                                }
                                className="inline-flex items-center space-x-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Thêm vào danh sách hoàn trả</span>
                              </button>
                            )
                          ) : (
                            <div className="flex w-full items-center space-x-1">
                              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                Gán thủ công:
                              </span>
                              <select
                                className="flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-700"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAssignDetectionToBorrowDetail(det, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                              >
                                <option value="" disabled>
                                  -- Chọn dòng phiếu mượn tương ứng --
                                </option>
                                {outstandingDetails.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.item?.name || d.itemId} (Còn lại:{' '}
                                    {d.quantity - (d.returnedQuantity || 0)})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Manual fallback: add from un-staged borrow details */}
            <div className="mt-2 pt-2 border-t border-slate-200">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Thêm linh kiện từ phiếu mượn (Manual Fallback):
              </label>
              <div className="flex space-x-1.5">
                <select
                  id="manual-item-select"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddManualItem(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="" disabled>
                    -- Chọn linh kiện mượn cần trả --
                  </option>
                  {outstandingDetails
                    .filter((d) => !stagedItems[d.id])
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.item?.name || d.itemId} (Còn lại:{' '}
                        {d.quantity - (d.returnedQuantity || 0)})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5">
              <button
                type="button"
                onClick={handleModalClose}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmStaged}
                disabled={Object.keys(stagedItems).length === 0}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
              >
                <span>Áp dụng vào Phiếu Hoàn trả</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
