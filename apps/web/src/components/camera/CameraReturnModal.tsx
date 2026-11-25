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
  CornerDownLeft,
} from 'lucide-react';
import {
  detectFrameBase64,
  detectFrameFile,
  checkVisionHealth,
  compressImageForVision,
  type VisionDetection,
  type VisionDetectResponse,
} from '../../services/vision.service';
import {
  YOLO11_85_CLASSES,
  CLASS_NAME_TO_DEFINITION_MAP,
  normalizeComponentToken,
} from '../../services/vision-classes';
import type { ReturnCondition, ReturnInputRow } from '../../pages/borrowReturnPartial';
import { useModalDismiss } from '../../hooks/useModalDismiss';
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
  onApplyReturnRows: (
    newRows: Record<string, ReturnInputRow>,
    suggestedNotes?: string,
    evidencePhoto?: string
  ) => void;
  catalogItems?: CatalogItem[];
  actionLoading?: boolean;
  rejectedReturn?: { borrowId: string; key: string; message: string } | null;
  onClearRejected?: (borrowId: string, key: string) => void;
  autoPopulateBorrowItems?: boolean;
  initialItems?: Record<string, ReturnInputRow>;
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

export const KNOWN_FRIENDLY_NAMES: Record<string, string> = {};
YOLO11_85_CLASSES.forEach((c) => {
  KNOWN_FRIENDLY_NAMES[c.className] = c.friendlyNameVi;
});

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
  actionLoading = false,
  rejectedReturn = null,
  onClearRejected,
  autoPopulateBorrowItems = false,
  initialItems,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isInFlightRef = useRef<boolean>(false);
  const intervalRef = useRef<number | null>(null);
  const inferenceDimsRef = useRef<{ width: number; height: number } | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [permissionErrorMsg, setPermissionErrorMsg] = useState<string>('');
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [isServiceOnline, setIsServiceOnline] = useState<boolean | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [verifiedCatalog, setVerifiedCatalog] = useState<CatalogItem[]>(catalogItems || []);
  const [isCatalogComplete, setIsCatalogComplete] = useState<boolean>(Boolean(catalogItems && catalogItems.length > 0));
  const [catalogLookupStatus, setCatalogLookupStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE'>(
    catalogItems && catalogItems.length > 0 ? 'READY' : 'IDLE'
  );

  const catalogRef = useRef<{
    items: CatalogItem[];
    status: 'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE';
    complete: boolean;
  }>({
    items: catalogItems || [],
    status: catalogItems && catalogItems.length > 0 ? 'READY' : 'IDLE',
    complete: Boolean(catalogItems && catalogItems.length > 0),
  });

  const rawDetectionsRef = useRef<VisionDetection[]>([]);
  const processDetectionsRef = useRef<(list: VisionDetection[]) => void>(() => {});

  // Sync catalogItems prop or fetch from API with full pagination support
  useEffect(() => {
    if (!isOpen) return;
    if (catalogItems && catalogItems.length > 0) {
      catalogRef.current = { items: catalogItems, status: 'READY', complete: true };
      setVerifiedCatalog(catalogItems);
      setIsCatalogComplete(true);
      setCatalogLookupStatus('READY');
      return;
    }

    catalogRef.current.status = 'LOADING';

    let isMounted = true;
    setCatalogLookupStatus('LOADING');

    const fetchAllCatalogPages = async () => {
      try {
        // Query first page with max allowed limit (100) per queryItemsSchema
        const res = await apiClient.get('/items?page=1&limit=100');
        if (!isMounted) return;

        if (res.data?.success && Array.isArray(res.data.data)) {
          let accumulatedItems: CatalogItem[] = res.data.data;
          const meta = res.data.meta;
          const totalPages = typeof meta?.totalPages === 'number' ? meta.totalPages : 1;
          let complete = true;

          // If multiple pages exist, retrieve remaining pages
          if (totalPages > 1) {
            const maxPageCap = Math.min(totalPages, 10);
            for (let p = 2; p <= maxPageCap; p++) {
              try {
                const nextRes = await apiClient.get(`/items?page=${p}&limit=100`);
                if (!isMounted) return;
                if (nextRes.data?.success && Array.isArray(nextRes.data.data)) {
                  accumulatedItems = accumulatedItems.concat(nextRes.data.data);
                } else {
                  complete = false;
                  break;
                }
              } catch {
                complete = false;
                break;
              }
            }
            if (totalPages > 10) {
              complete = false;
            }
          }

          catalogRef.current = { items: accumulatedItems, status: 'READY', complete };
          setVerifiedCatalog(accumulatedItems);
          setIsCatalogComplete(complete);
          setCatalogLookupStatus('READY');
          if (rawDetectionsRef.current.length > 0) {
            processDetectionsRef.current(rawDetectionsRef.current);
          }
        } else {
          setCatalogLookupStatus('UNAVAILABLE');
          setIsCatalogComplete(false);
        }
      } catch {
        if (isMounted) {
          setCatalogLookupStatus('UNAVAILABLE');
          setIsCatalogComplete(false);
        }
      }
    };

    fetchAllCatalogPages();

    return () => {
      isMounted = false;
    };
  }, [isOpen, catalogItems]);

  const [rawDetections, setRawDetections] = useState<VisionDetection[]>([]);
  const [analyzedDetections, setAnalyzedDetections] = useState<AnalyzedDetection[]>([]);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);

  const getInitialStagedItems = useCallback((): Record<string, StagedReturnItem> => {
    if (!autoPopulateBorrowItems && !initialItems) return {};

    const initial: Record<string, StagedReturnItem> = {};
    const details = borrowRecord.details || [];
    for (const d of details) {
      const remaining = d.quantity - (d.returnedQuantity || 0);
      if (remaining > 0) {
        const itemCode = d.item?.code || d.itemId;
        const initialRow = initialItems?.[d.id];
        const initialQty = initialRow ? parseInt(initialRow.quantity, 10) || 0 : 0;
        initial[d.id] = {
          detailId: d.id,
          itemCode,
          itemName: d.item?.name || 'Linh kiện',
          unit: d.item?.unit || 'cái',
          remaining,
          quantity: Math.min(Math.max(initialQty, 0), remaining),
          condition: initialRow?.condition || 'GOOD',
        };
      }
    }
    return initial;
  }, [autoPopulateBorrowItems, initialItems, borrowRecord.details]);

  const [stagedItems, setStagedItems] = useState<Record<string, StagedReturnItem>>(
    getInitialStagedItems
  );

  useEffect(() => {
    if (isOpen) {
      setStagedItems(getInitialStagedItems());
    }
  }, [isOpen, getInitialStagedItems]);

  const [customNotes, setCustomNotes] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [capturedLivePhoto, setCapturedLivePhoto] = useState<{
    dataUrl: string;
    timestamp: string;
  } | null>(null);
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
    setCapturedLivePhoto(null);

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

  // Manual retry connection to Vision Service (`best` model)
  const handleRetryVisionHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await checkVisionHealth();
      const online = res?.status === 'ok';
      setIsServiceOnline(online);
      if (online) {
        setStatusNotice({
          type: 'success',
          text: `Đã kết nối mô hình AI best (${res?.classesCount || 86} lớp linh kiện). Sẵn sàng nhận diện hoàn trả.`,
        });
      }
    } catch {
      setIsServiceOnline(false);
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  // Check backend vision service health on mount
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    checkVisionHealth()
      .then((res) => {
        if (isMounted) {
          setIsServiceOnline(res?.status === 'ok');
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsServiceOnline(false);
          setStatusNotice({
            type: 'warning',
            text: 'Dịch vụ AI Vision (mô hình best) chưa phản hồi. Vui lòng kiểm tra lại hoặc bấm "Thử lại kết nối AI".',
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
        naturalWidth = inferenceDimsRef.current?.width || img.naturalWidth || 640;
        naturalHeight = inferenceDimsRef.current?.height || img.naturalHeight || 480;
      } else if (videoRef.current) {
        const video = videoRef.current;
        displayWidth = video.clientWidth;
        displayHeight = video.clientHeight;
        naturalWidth = inferenceDimsRef.current?.width || video.videoWidth || 640;
        naturalHeight = inferenceDimsRef.current?.height || video.videoHeight || 480;
      }

      if (displayWidth === 0 || displayHeight === 0) return;

      canvas.width = displayWidth;
      canvas.height = displayHeight;
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const scaleX = displayWidth / naturalWidth;
      const scaleY = displayHeight / naturalHeight;

      for (const det of detectedList) {
        const { x1, y1, x2, y2 } = det.boundingBox;
        const rx = Math.round(x1 * scaleX);
        const ry = Math.round(y1 * scaleY);
        const rw = Math.round((x2 - x1) * scaleX);
        const rh = Math.round((y2 - y1) * scaleY);

        if (rw <= 2 || rh <= 2) continue;

        let strokeColor = '#F59E0B'; // Amber default for unmapped
        let fillColor = 'rgba(245, 158, 11, 0.05)';

        if (det.matchStatus === 'MATCHED_BORROW') {
          strokeColor = '#10B981'; // Emerald Green
          fillColor = 'rgba(16, 185, 129, 0.08)';
        } else if (det.matchStatus === 'MATCHED_CATALOG_ONLY') {
          strokeColor = '#0284C7'; // Sky Blue
          fillColor = 'rgba(2, 132, 199, 0.05)';
        } else if (det.matchStatus === 'CATALOG_UNVERIFIED') {
          strokeColor = '#8B5CF6'; // Purple
          fillColor = 'rgba(139, 92, 246, 0.05)';
        }

        // 1. Soft tint
        ctx.fillStyle = fillColor;
        ctx.fillRect(rx, ry, rw, rh);

        // 2. Clean rounded rectangle
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(rx, ry, rw, rh, 4);
          ctx.stroke();
        } else {
          ctx.strokeRect(rx, ry, rw, rh);
        }

        // 3. High-tech corner accents
        const cl = Math.max(4, Math.min(8, Math.floor(Math.min(rw, rh) / 3)));
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(rx, ry + cl); ctx.lineTo(rx, ry); ctx.lineTo(rx + cl, ry);
        ctx.moveTo(rx + rw - cl, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cl);
        ctx.moveTo(rx, ry + rh - cl); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cl, ry + rh);
        ctx.moveTo(rx + rw - cl, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cl);
        ctx.stroke();

        // 4. Sleek glassmorphism pill badge
        const friendlyName = getFriendlyClassName(det.className, det.matchedDetail, det.suggestedItemCode);
        const cleanName = friendlyName.length > 18 ? friendlyName.slice(0, 17) + '…' : friendlyName;
        const confPct = Math.round(det.confidence * 100);
        const labelText = `${cleanName} ${confPct}%`;

        ctx.font = '600 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const pillW = Math.round(textMetrics.width + 18);
        const pillH = 17;
        const pillX = Math.max(2, Math.min(rx, displayWidth - pillW - 2));
        const pillY = ry >= 20 ? ry - 19 : Math.min(displayHeight - pillH - 2, ry + rh + 3);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 3.5);
          ctx.fill();
        } else {
          ctx.fillRect(pillX, pillY, pillW, pillH);
        }

        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(pillX + 6.5, pillY + pillH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(labelText, pillX + 13, pillY + 12);
      }
    },
    [uploadedPreview]
  );

  // Match AI detections to outstanding borrow details and catalog mappings
  const processDetections = useCallback(
    (detectedList: VisionDetection[]) => {
      rawDetectionsRef.current = detectedList;
      setRawDetections(detectedList);

      const activeCatalog = catalogRef.current.items.length > 0 ? catalogRef.current.items : verifiedCatalog;
      const currentLookupStatus = catalogRef.current.status !== 'IDLE' ? catalogRef.current.status : catalogLookupStatus;
      const currentComplete = catalogRef.current.complete;

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
        const trainedDef = CLASS_NAME_TO_DEFINITION_MAP.get(det.className.toLowerCase());

        // Build verified candidate SKU codes when suggestedItemCode is provided by Vision Service (`best` model)
        const candidateCodes = new Set<string>();
        if (det.suggestedItemCode) {
          candidateCodes.add(det.suggestedItemCode.toUpperCase());
          det.candidateItemCodes?.forEach((code) => {
            if (code) candidateCodes.add(code.toUpperCase());
          });
          if (trainedDef) {
            candidateCodes.add(trainedDef.defaultItemCode.toUpperCase());
            trainedDef.aliasCodes?.forEach((alias) => candidateCodes.add(alias.toUpperCase()));
          }
        }

        // Step 0: Check against verified active catalog from API
        let catalogMatch = det.suggestedItemCode
          ? activeCatalog.find(
              (c) =>
                c.isActive !== false &&
                candidateCodes.has(c.code.toUpperCase())
            ) || null
          : null;

        // If `det` is a verified 86-class `best` detection with suggestedItemCode, also match active catalog item by exact canonical name
        if (!catalogMatch && det.suggestedItemCode && trainedDef) {
          const normTrainedClass = normalizeComponentToken(trainedDef.className);
          const normTrainedVi = normalizeComponentToken(trainedDef.friendlyNameVi);
          catalogMatch =
            activeCatalog.find((c) => {
              if (c.isActive === false) return false;
              const normName = normalizeComponentToken(c.name);
              return (
                Boolean(normName) &&
                (normName === normTrainedClass || normName === normTrainedVi)
              );
            }) || null;
        }

        // Step 1: Check match with borrow details
        // Ground truth: Must match actual Item ID, verified Item Code/Alias, or verified 86-class canonical name (when suggestedItemCode is present).
        // Arbitrary fuzzy partial name alone is NEVER used to auto-record returns.
        const match = outstandingDetails.find((d) => {
          const itemCode = (d.item?.code || '').toUpperCase();
          const itemId = d.itemId || d.item?.id || '';
          if (catalogMatch && (itemId === catalogMatch.id || itemCode === catalogMatch.code.toUpperCase())) {
            return true;
          }
          if (det.suggestedItemCode && itemCode && candidateCodes.has(itemCode)) {
            const isExplicitlyInactive = activeCatalog.some(
              (c) => c.code.toUpperCase() === itemCode && c.isActive === false
            );
            if (!isExplicitlyInactive) return true;
          }
          if (det.suggestedItemCode && trainedDef && d.item?.name) {
            const isExplicitlyInactive = activeCatalog.some(
              (c) =>
                (c.id === itemId || (itemCode && c.code.toUpperCase() === itemCode)) &&
                c.isActive === false
            );
            if (!isExplicitlyInactive) {
              const normBorrowName = normalizeComponentToken(d.item.name);
              if (
                normBorrowName &&
                (normBorrowName === normalizeComponentToken(trainedDef.className) ||
                  normBorrowName === normalizeComponentToken(trainedDef.friendlyNameVi))
              ) {
                return true;
              }
            }
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
          if (currentLookupStatus === 'UNAVAILABLE' || currentLookupStatus === 'LOADING') {
            return {
              detectionIndex: index + 1,
              classId: det.classId,
              className: det.className,
              confidence: det.confidence,
              boundingBox: det.boundingBox,
              suggestedItemCode: det.suggestedItemCode,
              matchStatus: 'CATALOG_UNVERIFIED',
              statusLabel: currentLookupStatus === 'LOADING'
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

          // If catalog was only partially fetched, fail safe to CATALOG_UNVERIFIED
          if (!currentComplete) {
            return {
              detectionIndex: index + 1,
              classId: det.classId,
              className: det.className,
              confidence: det.confidence,
              boundingBox: det.boundingBox,
              suggestedItemCode: det.suggestedItemCode,
              matchStatus: 'CATALOG_UNVERIFIED',
              statusLabel: `Chưa thể xác nhận mã '${det.suggestedItemCode}': Danh mục linh kiện chưa tải đủ`,
            };
          }

          // If code does not exist in complete active catalog
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
    [outstandingDetails, drawOverlay, verifiedCatalog, catalogLookupStatus, isCatalogComplete]
  );

  processDetectionsRef.current = processDetections;

  // Re-process detections whenever catalog state resolves or changes
  useEffect(() => {
    if (rawDetections.length > 0) {
      processDetections(rawDetections);
    }
  }, [verifiedCatalog, catalogLookupStatus, isCatalogComplete]);

  // Capture single frame and run AI inference
  const captureAndDetect = useCallback(async () => {
    if (isInFlightRef.current) return;
    if (!videoRef.current || videoRef.current.readyState < 2) return;

    const video = videoRef.current;
    const offscreen = document.createElement('canvas');
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    offscreen.width = Math.round(vw * scale);
    offscreen.height = Math.round(vh * scale);

    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    const b64 = offscreen.toDataURL('image/jpeg', 0.85);
    inferenceDimsRef.current = { width: offscreen.width, height: offscreen.height };

    isInFlightRef.current = true;
    try {
      const contextItems = outstandingDetails.map((o) => ({
        code: o.item?.code,
        name: o.item?.name,
        quantity: o.quantity,
      }));
      const res: VisionDetectResponse = await detectFrameBase64(b64, contextItems);
      if (res.success && res.detections) {
        setIsServiceOnline(true);
        if (res.imageDimensions) {
          inferenceDimsRef.current = res.imageDimensions;
        }
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
      const isCloud = typeof window !== 'undefined' && window.location.protocol === 'https:';
      intervalRef.current = window.setInterval(captureAndDetect, isCloud ? 4500 : 1800);
      setStatusNotice({
        type: 'info',
        text: 'Đang quét và nhận diện linh kiện hoàn trả bằng mô hình AI best (86 lớp)...',
      });
    }
  }, [captureAndDetect, isRecognizing]);

  // LIVE CAPTURE PHOTO (Directly from live camera stream with unforgeable watermark)
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

    // Anti-fraud watermark
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN');
    const timeStr = now.toLocaleTimeString('vi-VN');
    const fullStamp = `${dateStr} ${timeStr}`;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(0, canvas.height - 44, canvas.width, 44);

    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('🔒 XÁC THỰC HOÀN TRẢ - LIVE CAMERA CAPTURE', 16, canvas.height - 17);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '13px monospace';
    const stampText = `🕒 ${fullStamp} | Phiếu: ${borrowRecord.requestNumber}`;
    const textW = ctx.measureText(stampText).width;
    ctx.fillText(stampText, canvas.width - textW - 16, canvas.height - 17);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedLivePhoto({ dataUrl, timestamp: fullStamp });
    setUploadedPreview(dataUrl);

    // Stop continuous loop if active
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRecognizing(false);

    isInFlightRef.current = true;
    setStatusNotice({ type: 'info', text: `Đang phân tích ảnh chụp bàn giao lúc ${timeStr}...` });

    compressImageForVision(dataUrl, 1024, 0.85)
      .then((compressed) => detectFrameBase64(compressed || dataUrl))
      .then((res) => {
        if (res.success && res.detections) {
          setIsServiceOnline(true);
          if (res.imageDimensions) {
            inferenceDimsRef.current = res.imageDimensions;
          }
          setInferenceTime(res.inferenceTimeMs || null);
          processDetections(res.detections);
          setStatusNotice({
            type: 'success',
            text: `✅ Chụp ảnh thành công lúc ${timeStr}! Phát hiện ${res.detections.length} linh kiện trong ảnh.`,
          });
        }
      })
      .catch((err) => {
        setStatusNotice({
          type: 'warning',
          text: `Đã chụp ảnh lúc ${timeStr}. Bạn có thể dùng ảnh này làm bằng chứng hoàn trả.`,
        });
      })
      .finally(() => {
        isInFlightRef.current = false;
      });
  }, [borrowRecord.requestNumber, processDetections]);

  // Handle Manual File Upload fallback (strictly enforces fresh photos, rejecting yesterday's photos)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if file is older than today (from yesterday or earlier)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const fileTime = file.lastModified || 0;

    if (fileTime > 0 && fileTime < todayStart) {
      setStatusNotice({
        type: 'error',
        text: '❌ TỪ CHỐI ẢNH CŨ: Hệ thống không chấp nhận ảnh cũ của ngày hôm qua hoặc lưu sẵn từ trước. Vui lòng bật camera và chụp ảnh trực tiếp tại thời điểm hiện tại!',
      });
      return;
    }

    stopCameraStream();

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploadedPreview(dataUrl);

      isInFlightRef.current = true;
      setStatusNotice({ type: 'info', text: 'Đang phân tích ảnh linh kiện đã tải lên...' });

      try {
        const contextItems = outstandingDetails.map((o) => ({
          code: o.item?.code,
          name: o.item?.name,
          quantity: o.quantity,
        }));
        const res = await detectFrameFile(file, contextItems);
        if (res.success && res.detections) {
          setIsServiceOnline(true);
          inferenceDimsRef.current = res.imageDimensions || null;
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
      const minVal = autoPopulateBorrowItems ? 0 : 1;
      const clamped = Math.max(minVal, Math.min(val, item.remaining));
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

  // Confirm staged return items and trigger return operation
  const handleConfirmStaged = () => {
    const itemsList = Object.values(stagedItems);
    const validItems = itemsList.filter((item) => item.quantity > 0);

    if (validItems.length === 0) {
      setStatusNotice({
        type: 'warning',
        text: 'Vui lòng chọn ít nhất 1 linh kiện có số lượng trả lớn hơn 0.',
      });
      return;
    }

    const rows: Record<string, ReturnInputRow> = {};
    const notesArr: string[] = [];

    for (const item of validItems) {
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

    if (customNotes.trim()) {
      notesArr.push(customNotes.trim());
    }

    if (capturedLivePhoto) {
      notesArr.push(`[Ảnh chụp thực tế lúc ${capturedLivePhoto.timestamp} - Live Camera Verified]`);
    }

    const combinedNotes = notesArr.length > 0 ? notesArr.join(' | ') : undefined;

    stopCameraStream();
    if (capturedLivePhoto?.dataUrl) {
      onApplyReturnRows(rows, combinedNotes, capturedLivePhoto.dataUrl);
    } else {
      onApplyReturnRows(rows, combinedNotes);
    }

    if (!autoPopulateBorrowItems) {
      onClose();
    }
  };

  const handleModalClose = () => {
    stopCameraStream();
    onClose();
  };

  const backdropDismiss = useModalDismiss(isOpen, handleModalClose);

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
    <div
      {...backdropDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-0 sm:p-3 md:p-4 backdrop-blur-sm"
    >
      <div className="flex h-[100dvh] sm:h-[94vh] w-full max-w-5xl flex-col sm:rounded-2xl bg-white shadow-2xl border-0 sm:border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-slate-50 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Camera className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center flex-wrap gap-1.5">
                <span>Nhận diện Hoàn trả Linh kiện qua Camera AI</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  MVP Feature
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 break-words">
                Phiếu mượn: <strong className="text-slate-700">{borrowRecord.requestNumber}</strong>{' '}
                | Người mượn: <span className="text-slate-700 font-medium">{borrowRecord.borrowerName || 'N/A'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0 ml-2">
            {isServiceOnline === true && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] text-emerald-800 font-semibold">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Model best (86 lớp)
              </span>
            )}
            {isServiceOnline === false && (
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={handleRetryVisionHealth}
                className="inline-flex items-center rounded-lg bg-amber-100 hover:bg-amber-200 px-2.5 py-1 text-[11px] text-amber-800 font-semibold transition cursor-pointer disabled:opacity-50"
                title="Bấm để kết nối lại dịch vụ nhận diện AI"
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                <span>{isCheckingHealth ? 'Đang kết nối...' : 'AI Offline • Thử lại'}</span>
              </button>
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
            className={`flex items-center justify-between px-3.5 py-2 text-xs border-b shrink-0 ${
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
              {statusNotice.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />}
              {statusNotice.type === 'warning' && (
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              )}
              {statusNotice.type === 'success' && (
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              )}
              {statusNotice.type === 'info' && <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />}
              <span className="font-medium">{statusNotice.text}</span>
            </div>
            {inferenceTime !== null && (
              <span className="font-mono text-[11px] text-slate-500 shrink-0 ml-2">
                Inference: {inferenceTime}ms
              </span>
            )}
          </div>
        )}

        {/* Main Content Layout: Left Camera / Right Staged & Detections Panels */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-y-auto md:overflow-hidden min-h-0">
          {/* Left Column: Camera Viewport */}
          <div className="relative flex flex-col items-stretch justify-start bg-slate-900 md:col-span-7 p-2.5 sm:p-3 overflow-visible md:overflow-hidden shrink-0 md:shrink">
            {/* Simple AI Recognition Summary Bar (Directly Above Camera Viewport) */}
            <div
              data-testid="ai-simple-recognition-bar"
              className="mb-2 w-full rounded-xl bg-slate-800/95 border border-slate-700/80 p-2 sm:p-2.5 text-xs shadow-md shrink-0"
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
                className="mt-1.5 flex flex-wrap items-center gap-1.5"
              >
                {uniqueDetectedClasses.length === 0 ? (
                  <span
                    data-testid="ai-empty-recognition"
                    className="italic text-slate-400 text-[11px] py-0.5"
                  >
                    Chưa nhận diện được — Bấm &quot;Bắt đầu nhận diện&quot; bên dưới để AI quét linh kiện
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
            <div className="relative flex w-full aspect-[4/3] sm:aspect-video md:aspect-auto md:flex-1 md:min-h-[280px] items-center justify-center overflow-hidden rounded-xl bg-black border border-slate-800 shadow-inner shrink-0 md:shrink">
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
                  {capturedLivePhoto && (
                    <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md flex items-center space-x-1.5 z-10">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>ẢNH CHỤP HIỆN TẠI (LIVE): {capturedLivePhoto.timestamp}</span>
                    </div>
                  )}
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
                  {/* Real-time scanning visual pulse line */}
                  {cameraActive && isRecognizing && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center space-x-1.5 rounded-full bg-emerald-600/90 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-white shadow-md">
                          <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                          <span>AI ĐANG QUÉT LIVE (MODEL BEST • 86 LỚP)</span>
                        </span>
                      </div>
                      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#34d399] opacity-80" />
                    </div>
                  )}
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

            {/* Camera Controls Toolbar - Fully responsive, highly visible on mobile and desktop */}
            <div className="mt-2.5 flex flex-col w-full rounded-xl bg-slate-800/95 border border-slate-700/80 p-2 sm:p-2.5 text-xs text-slate-300 shadow-md space-y-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {cameraActive && !capturedLivePhoto && (
                    <button
                      type="button"
                      onClick={toggleRecognition}
                      className={`flex-1 sm:flex-initial inline-flex items-center justify-center space-x-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md active:scale-95 transition ${
                        isRecognizing
                          ? 'bg-rose-600 hover:bg-rose-500 animate-pulse shadow-rose-900/50'
                          : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/50'
                      }`}
                    >
                      {isRecognizing ? (
                        <>
                          <Square className="h-4 w-4 fill-current shrink-0" />
                          <span>Dừng nhận diện</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 fill-current shrink-0" />
                          <span>Bắt đầu nhận diện</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Prominent Live Capture Button */}
                  {cameraActive && !capturedLivePhoto && (
                    <button
                      type="button"
                      onClick={captureLivePhoto}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-900/40 hover:bg-blue-500 active:scale-95 transition"
                    >
                      <Camera className="h-4 w-4 shrink-0" />
                      <span>Chụp ảnh hiện tại (Live)</span>
                    </button>
                  )}

                  {capturedLivePhoto && (
                    <button
                      type="button"
                      onClick={() => {
                        setCapturedLivePhoto(null);
                        setUploadedPreview(null);
                        startCameraStream();
                      }}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-amber-500 active:scale-95 transition"
                    >
                      <RefreshCw className="h-4 w-4 shrink-0" />
                      <span>Chụp lại</span>
                    </button>
                  )}

                  {cameraActive && !capturedLivePhoto && (
                    <button
                      type="button"
                      onClick={() => {
                        setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                      }}
                      title="Đổi camera trước / sau"
                      className="shrink-0 inline-flex items-center justify-center space-x-1 rounded-xl bg-slate-700/90 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 active:scale-95 border border-slate-600 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                      <span>Đổi Camera</span>
                    </button>
                  )}
                </div>

                {/* Hidden input for test fixtures / automated mocks only (No upload UI visible to user) */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>

              <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 pt-1.5 border-t border-slate-700/60">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>Chỉ chấp nhận ảnh chụp thời gian thực tại chỗ. Ảnh cũ từ ngày hôm qua sẽ bị từ chối.</span>
              </div>
            </div>
          </div>

          {/* Right Column: Tabbed Interface (Staged Return Items & AI Detections Breakdown) */}
          <div className="flex flex-col md:col-span-5 bg-white border-t md:border-t-0 md:border-l border-slate-200 p-3 sm:p-4 overflow-visible md:overflow-y-auto">
            {/* If there is an unresolved rejected return for this borrow */}
            {rejectedReturn && (
              <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
                <div className="font-semibold flex items-center space-x-1.5 text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Yêu cầu trước bị máy chủ từ chối:</span>
                </div>
                <p>{rejectedReturn.message}</p>
                {onClearRejected && (
                  <button
                    type="button"
                    onClick={() => onClearRejected(rejectedReturn.borrowId, rejectedReturn.key)}
                    className="rounded bg-amber-700 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-800 cursor-pointer"
                  >
                    Xác nhận gỡ bỏ yêu cầu bị từ chối để nhập lại
                  </button>
                )}
              </div>
            )}

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
                          <div className="flex items-center space-x-2">
                            <span className="text-[11px] text-slate-500">
                              Còn lại: <strong>{item.remaining}</strong> {item.unit}
                            </span>
                            {!autoPopulateBorrowItems && (
                              <button
                                type="button"
                                onClick={() => handleRemoveStaged(item.detailId)}
                                className="rounded p-1 text-slate-400 hover:text-rose-600"
                                title="Bỏ chọn"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
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
                            <label
                              htmlFor={`return-qty-${item.detailId}`}
                              className="block text-[10px] font-medium text-slate-600 mb-0.5"
                            >
                              Số lượng trả (tối đa {item.remaining}):
                            </label>
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateQuantity(
                                    item.detailId,
                                    Math.max(autoPopulateBorrowItems ? 0 : 1, item.quantity - 1)
                                  )
                                }
                                disabled={item.quantity <= (autoPopulateBorrowItems ? 0 : 1)}
                                className="h-8 w-8 rounded-lg border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center font-bold text-sm cursor-pointer select-none active:scale-95 transition"
                              >
                                -
                              </button>
                              <input
                                id={`return-qty-${item.detailId}`}
                                aria-label={`Số lượng trả ${item.itemCode}`}
                                type="number"
                                min={autoPopulateBorrowItems ? 0 : 1}
                                max={item.remaining}
                                value={item.quantity}
                                onChange={(e) =>
                                  handleUpdateQuantity(
                                    item.detailId,
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="w-16 text-center rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateQuantity(
                                    item.detailId,
                                    Math.min(item.remaining, item.quantity + 1)
                                  )
                                }
                                disabled={item.quantity >= item.remaining}
                                className="h-8 w-8 rounded-lg border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center font-bold text-sm cursor-pointer select-none active:scale-95 transition"
                              >
                                +
                              </button>
                              <span className="text-[10px] text-slate-500 pl-1">{item.unit}</span>
                            </div>
                          </div>

                          <div>
                            <label
                              htmlFor={`return-cond-${item.detailId}`}
                              className="block text-[10px] font-medium text-slate-600 mb-0.5"
                            >
                              Tình trạng kiểm tra:
                            </label>
                            <select
                              id={`return-cond-${item.detailId}`}
                              aria-label={`Tình trạng trả ${item.itemCode}`}
                              value={item.condition}
                              onChange={(e) =>
                                handleUpdateCondition(
                                  item.detailId,
                                  e.target.value as ReturnCondition
                                )
                              }
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                            >
                              <option value="GOOD">Tốt (Nhập kho khả dụng)</option>
                              <option value="DAMAGED">Hỏng (Cách ly kiểm tra)</option>
                              <option value="LOST">Báo mất (Giảm tài sản)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Notes Input */}
                <div className="mt-2.5">
                  <label
                    htmlFor="return-custom-notes"
                    className="block text-[11px] font-semibold text-slate-700 mb-1"
                  >
                    Ghi chú kiểm tra (Notes):
                  </label>
                  <textarea
                    id="return-custom-notes"
                    rows={2}
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Ghi chú thêm về linh kiện hoặc tình trạng bàn giao tại phòng Lab..."
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Live Captured Photo Evidence */}
                {capturedLivePhoto && (
                  <div className="mt-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                      <span className="flex items-center space-x-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Bằng chứng ảnh chụp thực tế (Live Camera)</span>
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
                        Đã xác thực thời gian thực
                      </span>
                    </div>
                    <div className="relative rounded-lg overflow-hidden border border-emerald-300 max-h-32 flex items-center justify-center bg-black/5">
                      <img
                        src={capturedLivePhoto.dataUrl}
                        alt="Bằng chứng hoàn trả"
                        className="max-h-32 object-contain rounded"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Raw AI Detections Breakdown */}
            {activeTab === 'detections' && (
              <div className="flex flex-1 flex-col overflow-hidden pt-2.5">
                {/* Filter Sub-bar */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('ALL')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      detectionFilter === 'ALL'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả ({analyzedDetections.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('MATCHED_BORROW')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      detectionFilter === 'MATCHED_BORROW'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    Khớp phiếu ({stats.matchedBorrow})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('MATCHED_CATALOG_ONLY')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      detectionFilter === 'MATCHED_CATALOG_ONLY'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    Khớp DM ({stats.matchedCatalog})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectionFilter('UNMAPPED')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      detectionFilter === 'UNMAPPED'
                        ? 'bg-amber-600 text-white shadow-xs'
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
            {!autoPopulateBorrowItems && (
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
            )}

            {/* Footer Buttons */}
            <div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t border-slate-200 pt-3 sticky bottom-0 bg-white/95 backdrop-blur-sm z-10">
              <button
                type="button"
                onClick={handleModalClose}
                className="w-full sm:w-auto rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer text-center active:scale-95 transition"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmStaged}
                disabled={
                  actionLoading ||
                  Boolean(rejectedReturn && rejectedReturn.borrowId === borrowRecord.id) ||
                  !Object.values(stagedItems).some((item) => item.quantity > 0)
                }
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-50 cursor-pointer active:scale-95 transition"
              >
                <span>{actionLoading ? 'Đang xử lý...' : 'Xác nhận hoàn trả'}</span>
                <CornerDownLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
