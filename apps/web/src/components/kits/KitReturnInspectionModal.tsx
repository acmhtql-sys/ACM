import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Package,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Camera,
  RefreshCw,
  Eye,
  ShieldCheck,
  Upload,
  Check,
  Plus,
  Minus,
  Sparkles,
  Zap,
  Play,
  Square,
  Layers,
  ArrowRight,
  RotateCcw,
  EyeOff,
  Filter,
} from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { apiClient } from '../../services/api';
import {
  detectFrameBase64,
  detectFrameFile,
  checkVisionHealth,
  compressImageForVision,
  type VisionDetection,
  type VisionDetectResponse,
} from '../../services/vision.service';
import { doesDetectionMatchItem, findMatchingTrainedClass } from '../../services/vision-classes';
import type { KitRecordForBorrow } from './StudentBorrowKitModal';

export type ComponentCondition = 'GOOD' | 'DAMAGED' | 'LOST';

export interface ComponentInspectionRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  initialQuantity: number;
  returnedQuantity: number;
  condition: ComponentCondition;
  notes: string;
  aiDetectedCount?: number;
  aiVerified?: boolean;
}

export interface KitReturnInspectionModalProps {
  isOpen: boolean;
  kit: KitRecordForBorrow | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export interface RecognizedItemSummary {
  itemCode: string;
  itemName: string;
  unit: string;
  expectedQty: number;
  detectedQty: number;
  isMatched: boolean;
  confidence: number;
}

export const KitReturnInspectionModal: React.FC<KitReturnInspectionModalProps> = ({
  isOpen,
  kit,
  onClose,
  onSuccess,
}) => {
  const modalDismiss = useModalDismiss(isOpen, onClose);

  const [inspectionRows, setInspectionRows] = useState<ComponentInspectionRow[]>([]);
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Camera & AI State
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isAiScanning, setIsAiScanning] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [isVisionOnline, setIsVisionOnline] = useState<boolean | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [isDetectingFrame, setIsDetectingFrame] = useState<boolean>(false);
  const [qcPhotoUrl, setQcPhotoUrl] = useState<string | null>(null);
  const [rawQcPhotoUrl, setRawQcPhotoUrl] = useState<string | null>(null);
  const [isAccumulateMode, setIsAccumulateMode] = useState<boolean>(true);
  const [aiConfidenceLevel, setAiConfidenceLevel] = useState<number>(0.22);
  const [qcTimestamp, setQcTimestamp] = useState<string | null>(null);
  const [rawDetections, setRawDetections] = useState<VisionDetection[]>([]);
  const [recognizedSummary, setRecognizedSummary] = useState<RecognizedItemSummary[]>([]);
  const [aiApplied, setAiApplied] = useState<boolean>(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [overlayMode, setOverlayMode] = useState<'all' | 'boxes_only' | 'hidden'>('all');
  const [summaryFilter, setSummaryFilter] = useState<'all' | 'matched' | 'missing'>('all');

  const filteredSummary = useMemo(() => {
    if (summaryFilter === 'matched') return recognizedSummary.filter((s) => s.isMatched);
    if (summaryFilter === 'missing') return recognizedSummary.filter((s) => !s.isMatched);
    return recognizedSummary;
  }, [recognizedSummary, summaryFilter]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isInFlightRef = useRef<boolean>(false);
  const lastInferenceDimsRef = useRef<{ width: number; height: number } | null>(null);
  // Anti-flicker for continuous live scan: require ≥2 empty frames before clearing active detections
  const emptyFrameStreakRef = useRef<number>(0);

  // Initialize checklist rows from kit items
  useEffect(() => {
    if (!isOpen || !kit) return;
    setErrorMessage(null);
    setGeneralNotes('');
    setQcPhotoUrl(null);
    setRawQcPhotoUrl(null);
    setQcTimestamp(null);
    setIsCameraActive(false);
    setIsAiScanning(false);
    setVisionError(null);
    setRawDetections([]);
    setRecognizedSummary([]);
    setAiApplied(false);
    setUploadedPreview(null);

    let cancelled = false;
    let retryTimer: number | null = null;
    setIsCheckingHealth(true);
    checkVisionHealth()
      .then((health) => {
        if (cancelled) return;
        if (health) {
          setIsVisionOnline(true);
          setVisionError(null);
          setIsCheckingHealth(false);
        } else {
          setIsVisionOnline(false);
          // Auto-retry once in case Cloud Vision Service was waking from sleep
          retryTimer = window.setTimeout(() => {
            if (cancelled) return;
            checkVisionHealth()
              .then((h2) => {
                if (cancelled) return;
                setIsVisionOnline(!!h2);
                if (h2) setVisionError(null);
              })
              .catch(() => {})
              .finally(() => {
                if (!cancelled) setIsCheckingHealth(false);
              });
          }, 3500);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsVisionOnline(false);
          setIsCheckingHealth(false);
        }
      });

    const rows: ComponentInspectionRow[] = (kit.items || []).map((ki) => ({
      itemId: ki.itemId,
      itemCode: ki.item?.code || 'LINH_KIEN',
      itemName: ki.item?.name || 'Linh kiện thành phần',
      unit: ki.item?.unit || 'cái',
      initialQuantity: ki.quantity || 1,
      returnedQuantity: ki.quantity || 1,
      condition: 'GOOD',
      notes: '',
      aiDetectedCount: 0,
      aiVerified: false,
    }));
    setInspectionRows(rows);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [isOpen, kit]);

  // Clean up stream & intervals on unmount or close
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  // Sync stream to video element whenever camera turns on
  useEffect(() => {
    if (isCameraActive && videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch((err) => {
        console.warn('Video play interrupted:', err);
      });
    }
  }, [isCameraActive]);

  // Stop camera helper
  const handleStopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setIsCameraActive(false);
    setIsAiScanning(false);
  }, []);

  // Start camera helper
  const handleStartCamera = async (targetFacing?: 'environment' | 'user') => {
    const activeFacing = targetFacing === 'user' || targetFacing === 'environment' ? targetFacing : facingMode;
    setCameraError(null);
    setUploadedPreview(null);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: activeFacing } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Camera access denied or error:', err);
      setCameraError('Không thể mở Camera (chưa cấp quyền hoặc không tìm thấy thiết bị). Bạn có thể tải ảnh lên.');
      setIsCameraActive(false);
    }
  };

  const handleToggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (isCameraActive) {
      handleStartCamera(next);
    }
  };

  // Draw bounding boxes on canvas overlay (modern, minimalist, elegant styling)
  const drawBoundingBoxes = useCallback((detections: VisionDetection[], forceMode?: 'all' | 'boxes_only' | 'hidden') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const targetEl = uploadedPreview ? imageRef.current : videoRef.current;
    if (!targetEl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasRect = canvas.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    if (canvasRect.width === 0 || canvasRect.height === 0 || targetRect.width === 0 || targetRect.height === 0) return;

    canvas.width = Math.round(canvasRect.width);
    canvas.height = Math.round(canvasRect.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const activeMode = forceMode || overlayMode;
    if (activeMode === 'hidden') return;

    let naturalW = 640;
    let naturalH = 480;

    if (uploadedPreview && imageRef.current) {
      const img = imageRef.current;
      naturalW = lastInferenceDimsRef.current?.width || img.naturalWidth || 640;
      naturalH = lastInferenceDimsRef.current?.height || img.naturalHeight || 480;
    } else if (videoRef.current) {
      const v = videoRef.current;
      naturalW = lastInferenceDimsRef.current?.width || v.videoWidth || 640;
      naturalH = lastInferenceDimsRef.current?.height || v.videoHeight || 480;
    }

    // Exact subpixel alignment between canvas container and target video/image
    const originX = targetRect.left - canvasRect.left;
    const originY = targetRect.top - canvasRect.top;

    // Calculate aspect ratio & letterbox/pillarbox offsets for object-contain
    const videoAspect = naturalW / naturalH;
    const targetAspect = targetRect.width / targetRect.height;

    let renderedW = targetRect.width;
    let renderedH = targetRect.height;
    let innerOffsetX = 0;
    let innerOffsetY = 0;

    if (videoAspect > targetAspect) {
      // Letterbox: black bars top and bottom
      renderedW = targetRect.width;
      renderedH = targetRect.width / videoAspect;
      innerOffsetY = (targetRect.height - renderedH) / 2;
    } else {
      // Pillarbox: black bars left and right
      renderedH = targetRect.height;
      renderedW = targetRect.height * videoAspect;
      innerOffsetX = (targetRect.width - renderedW) / 2;
    }

    const finalOffsetX = originX + innerOffsetX;
    const finalOffsetY = originY + innerOffsetY;

    const scaleX = renderedW / naturalW;
    const scaleY = renderedH / naturalH;
    const isDense = detections.length > 7;
    const placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (const det of detections) {
      const { x1, y1, x2, y2 } = det.boundingBox;
      const rx = Math.round(finalOffsetX + x1 * scaleX);
      const ry = Math.round(finalOffsetY + y1 * scaleY);
      const rw = Math.round((x2 - x1) * scaleX);
      const rh = Math.round((y2 - y1) * scaleY);

      if (rw <= 2 || rh <= 2) continue;

      // Color scheme: Green for matched kit item, Blue/Cyan for others
      const matchedKi = kit?.items?.find((ki) => doesDetectionMatchItem(det, ki.item));
      const isMatched = Boolean(matchedKi);

      const strokeColor = isMatched ? '#10B981' : '#0284C7';
      const fillColor = isMatched ? 'rgba(16, 185, 129, 0.08)' : 'rgba(2, 132, 199, 0.05)';

      // 1. Soft subtle fill tint inside box
      ctx.fillStyle = fillColor;
      ctx.fillRect(rx, ry, rw, rh);

      // 2. Clean thin border
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 4);
        ctx.stroke();
      } else {
        ctx.strokeRect(rx, ry, rw, rh);
      }

      // 3. High-tech corner bracket accents
      const cl = Math.max(4, Math.min(8, Math.floor(Math.min(rw, rh) / 3)));
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(rx, ry + cl); ctx.lineTo(rx, ry); ctx.lineTo(rx + cl, ry);
      // Top-Right
      ctx.moveTo(rx + rw - cl, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cl);
      // Bottom-Left
      ctx.moveTo(rx, ry + rh - cl); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cl, ry + rh);
      // Bottom-Right
      ctx.moveTo(rx + rw - cl, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cl);
      ctx.stroke();

      // If mode is 'boxes_only', skip rendering labels to keep view 100% clean
      if (activeMode === 'boxes_only') continue;

      // 4. Sleek glassmorphism pill badge with collision avoidance
      const friendlyDef = findMatchingTrainedClass(det.className);
      const rawName = matchedKi?.item?.name || friendlyDef?.friendlyNameVi || det.className;
      const maxLen = isDense ? 12 : 18;
      const cleanName = rawName.length > maxLen ? rawName.slice(0, maxLen - 1) + '…' : rawName;
      const confPct = Math.round((det.confidence || 0.95) * 100);
      const labelText = isDense ? cleanName : `${cleanName} ${confPct}%`;

      ctx.font = isDense
        ? '600 9px system-ui, -apple-system, sans-serif'
        : '600 10px system-ui, -apple-system, sans-serif';
      const textMetrics = ctx.measureText(labelText);
      const pillW = Math.round(textMetrics.width + (isDense ? 14 : 18));
      const pillH = isDense ? 15 : 17;

      let pillX = Math.max(finalOffsetX + 2, Math.min(rx, finalOffsetX + renderedW - pillW - 2));
      let pillY = ry >= pillH + 2 ? ry - (pillH + 2) : Math.min(finalOffsetY + renderedH - pillH - 2, ry + rh + 2);

      // Check overlap against previously placed label badges
      const isOverlap = placedLabels.some(
        (pl) =>
          Math.abs(pl.x - pillX) < (pl.w + pillW) * 0.45 &&
          Math.abs(pl.y - pillY) < (pl.h + pillH) * 0.7
      );

      if (isOverlap) {
        // Try bottom placement
        const altY = Math.min(finalOffsetY + renderedH - pillH - 2, ry + rh + 2);
        const altOverlap = placedLabels.some(
          (pl) =>
            Math.abs(pl.x - pillX) < (pl.w + pillW) * 0.45 &&
            Math.abs(pl.y - altY) < (pl.h + pillH) * 0.7
        );
        if (!altOverlap) {
          pillY = altY;
        } else if (isDense) {
          // In dense clusters, suppress overlapping duplicate text badges to avoid messy clutter
          continue;
        }
      }

      placedLabels.push({ x: pillX, y: pillY, w: pillW, h: pillH });

      // Dark glass pill background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 3.5);
        ctx.fill();
      } else {
        ctx.fillRect(pillX, pillY, pillW, pillH);
      }

      // Small color dot indicator
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(pillX + 5.5, pillY + pillH / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // White crisp text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(labelText, pillX + (isDense ? 11 : 13), pillY + (isDense ? 11 : 12));
    }
  }, [uploadedPreview, kit, overlayMode]);

  // Re-render bounding boxes whenever overlayMode changes
  useEffect(() => {
    if (rawDetections.length > 0) {
      drawBoundingBoxes(rawDetections);
    } else if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [overlayMode, rawDetections, drawBoundingBoxes]);

  // Manual retry connection to Vision Service
  const handleCheckHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const health = await checkVisionHealth();
      setIsVisionOnline(!!health);
      if (health) {
        setVisionError(null);
      }
    } catch {
      setIsVisionOnline(false);
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  // Execute AI detection frame processing
  const runAiDetection = useCallback(async (overrideB64?: string) => {
    if (isInFlightRef.current) return;
    isInFlightRef.current = true;
    setIsDetectingFrame(true);

    try {
      let b64 = overrideB64 || '';
      if (b64) {
        b64 = (await compressImageForVision(b64, 1024, 0.85)) || b64;
      } else {
        if (uploadedPreview) {
          b64 = uploadedPreview;
        } else if (videoRef.current && videoRef.current.readyState >= 2) {
          const offscreen = document.createElement('canvas');
          const vw = videoRef.current.videoWidth || 640;
          const vh = videoRef.current.videoHeight || 480;
          const maxDim = 1024;
          const scale = Math.min(1, maxDim / Math.max(vw, vh));
          offscreen.width = Math.round(vw * scale);
          offscreen.height = Math.round(vh * scale);
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height);
            b64 = offscreen.toDataURL('image/jpeg', 0.85);
          }
        } else if (rawQcPhotoUrl || qcPhotoUrl) {
          const targetUrl = rawQcPhotoUrl || qcPhotoUrl || '';
          b64 = (await compressImageForVision(targetUrl, 1024, 0.85)) || targetUrl;
        }
      }

      let detections: VisionDetection[] = [];
      if (b64) {
        try {
          const res = await detectFrameBase64(b64, undefined, { confidence: aiConfidenceLevel });
          if (res.success) {
            setVisionError(null);
            setIsVisionOnline(true);
            lastInferenceDimsRef.current = res.imageDimensions || null;
            detections = res.detections || [];
          } else {
            setVisionError(res.error || 'Dịch vụ Vision AI chưa phản hồi');
            setIsVisionOnline(false);
            detections = [];
          }
        } catch (err: any) {
          setVisionError(err?.message || 'Chưa kết nối được dịch vụ Vision AI');
          setIsVisionOnline(false);
          detections = [];
        }
      }

      // Prevent momentary single-frame hand blur from flashing existing live detections to 0
      if (detections.length === 0 && isAiScanning && !overrideB64) {
        emptyFrameStreakRef.current += 1;
        if (emptyFrameStreakRef.current < 2) {
          return;
        }
      } else {
        emptyFrameStreakRef.current = 0;
      }

      // Clean up heavily overlapping duplicate detections on the same physical spot (keep kit-matched or highest confidence)
      const cleanedDetections = (() => {
        if (detections.length <= 1) return detections;
        const sorted = [...detections].sort((a, b) => {
          const aMatch = kit?.items?.some((ki) => doesDetectionMatchItem(a, ki.item)) ? 1 : 0;
          const bMatch = kit?.items?.some((ki) => doesDetectionMatchItem(b, ki.item)) ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          return (b.confidence || 0) - (a.confidence || 0);
        });
        const kept: VisionDetection[] = [];
        for (const det of sorted) {
          const b1 = det.boundingBox;
          const isOverlap = kept.some((k) => {
            const b2 = k.boundingBox;
            const xx1 = Math.max(b1.x1, b2.x1);
            const yy1 = Math.max(b1.y1, b2.y1);
            const xx2 = Math.min(b1.x2, b2.x2);
            const yy2 = Math.min(b1.y2, b2.y2);
            const interW = Math.max(0, xx2 - xx1);
            const interH = Math.max(0, yy2 - yy1);
            const interArea = interW * interH;
            const b1Area = Math.max(0, b1.x2 - b1.x1) * Math.max(0, b1.y2 - b1.y1);
            const b2Area = Math.max(0, b2.x2 - b2.x1) * Math.max(0, b2.y2 - b2.y1);
            const unionArea = b1Area + b2Area - interArea;
            const iou = unionArea > 0 ? interArea / unionArea : 0;
            return iou > 0.50;
          });
          if (!isOverlap) kept.push(det);
        }
        return kept;
      })();

      setRawDetections(cleanedDetections);
      drawBoundingBoxes(cleanedDetections);

      // Build recognized items summary strictly based on real 86-class `best` detections
      if (kit?.items) {
        setRecognizedSummary((prevSummary) => {
          return kit.items.map((ki) => {
            const matchedDets = cleanedDetections.filter((d) => doesDetectionMatchItem(d, ki.item));
            const prevItem = prevSummary.find((s) => s.itemCode === (ki.item?.code || 'N/A'));
            const prevQty = prevItem?.detectedQty || 0;
            const bestConf = matchedDets.reduce(
              (max, d) => Math.max(max, d.confidence || 0.9),
              prevItem?.confidence ? prevItem.confidence / 100 : 0
            );

            let detectedQty = matchedDets.length;
            if (isAccumulateMode) {
              if (isAiScanning && !overrideB64) {
                // Continuous live stream: keep max seen so far while panning across compartments
                detectedQty = Math.max(prevQty, matchedDets.length);
              } else {
                // Snapshot / manual upload / "Quét AI ảnh này": accumulate new detections
                detectedQty = Math.min(ki.quantity, prevQty + matchedDets.length);
              }
            }

            return {
              itemCode: ki.item?.code || 'N/A',
              itemName: ki.item?.name || 'Linh kiện',
              unit: ki.item?.unit || 'cái',
              expectedQty: ki.quantity,
              detectedQty,
              isMatched: detectedQty > 0,
              confidence: detectedQty > 0 ? Math.round(bestConf * 100) : 0,
            };
          });
        });
      }
    } finally {
      isInFlightRef.current = false;
      setIsDetectingFrame(false);
    }
  }, [
    uploadedPreview,
    qcPhotoUrl,
    rawQcPhotoUrl,
    isAccumulateMode,
    aiConfidenceLevel,
    drawBoundingBoxes,
    kit,
    isAiScanning,
  ]);

  // Reset accumulated AI detections
  const handleResetAiDetections = useCallback(() => {
    setRawDetections([]);
    setAiApplied(false);
    if (kit?.items) {
      setRecognizedSummary(
        kit.items.map((ki) => ({
          itemCode: ki.item?.code || 'N/A',
          itemName: ki.item?.name || 'Linh kiện',
          unit: ki.item?.unit || 'cái',
          expectedQty: ki.quantity,
          detectedQty: 0,
          isMatched: false,
          confidence: 0,
        }))
      );
    } else {
      setRecognizedSummary([]);
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [kit]);

  // Toggle Continuous AI Scan
  const handleToggleAiScan = useCallback(() => {
    if (isAiScanning) {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      setIsAiScanning(false);
    } else {
      setIsAiScanning(true);
      emptyFrameStreakRef.current = 0;
      runAiDetection();
      const isCloud = typeof window !== 'undefined' && window.location.protocol === 'https:';
      scanIntervalRef.current = window.setInterval(runAiDetection, isCloud ? 5000 : 2500);
    }
  }, [isAiScanning, runAiDetection]);

  // Apply AI Recognition to Checklist Table
  const handleApplyAiToChecklist = () => {
    if (!recognizedSummary || recognizedSummary.length === 0) return;

    setInspectionRows((prev) =>
      prev.map((r) => {
        const found = recognizedSummary.find((s) => s.itemCode === r.itemCode);
        if (found && found.isMatched) {
          const appliedQty = Math.min(Math.max(found.detectedQty, 1), found.expectedQty);
          return {
            ...r,
            returnedQuantity: appliedQty,
            condition: appliedQty < found.expectedQty ? 'LOST' : 'GOOD',
            aiDetectedCount: found.detectedQty,
            aiVerified: true,
          };
        }
        return r;
      })
    );

    setAiApplied(true);
  };

  // Capture QC Snapshot with Watermark
  const handleCapturePhoto = () => {
    let sourceEl: HTMLVideoElement | HTMLImageElement | null = null;
    let w = 640;
    let h = 480;

    if (uploadedPreview && imageRef.current) {
      sourceEl = imageRef.current;
      w = imageRef.current.naturalWidth || 640;
      h = imageRef.current.naturalHeight || 480;
    } else if (videoRef.current) {
      sourceEl = videoRef.current;
      w = videoRef.current.videoWidth || 640;
      h = videoRef.current.videoHeight || 480;
    }

    if (!sourceEl) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw base image
    ctx.drawImage(sourceEl, 0, 0, w, h);

    // Draw detected bounding boxes on top of snapshot (sleek and compact)
    if (rawDetections.length > 0) {
      for (const det of rawDetections) {
        const { x1, y1, x2, y2 } = det.boundingBox;
        const rx = Math.round(x1);
        const ry = Math.round(y1);
        const rw = Math.round(x2 - x1);
        const rh = Math.round(y2 - y1);
        if (rw <= 2 || rh <= 2) continue;

        const matchedKi = kit?.items?.find((ki) => doesDetectionMatchItem(det, ki.item));
        const isMatched = Boolean(matchedKi);
        const strokeColor = isMatched ? '#10B981' : '#0284C7';

        // Semi-transparent box fill
        ctx.fillStyle = isMatched ? 'rgba(16, 185, 129, 0.08)' : 'rgba(2, 132, 199, 0.05)';
        ctx.fillRect(rx, ry, rw, rh);

        // Thin rounded border
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(rx, ry, rw, rh, 4);
          ctx.stroke();
        } else {
          ctx.strokeRect(rx, ry, rw, rh);
        }

        // Corner accents
        const cl = Math.max(4, Math.min(8, Math.floor(Math.min(rw, rh) / 3)));
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(rx, ry + cl); ctx.lineTo(rx, ry); ctx.lineTo(rx + cl, ry);
        ctx.moveTo(rx + rw - cl, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cl);
        ctx.moveTo(rx, ry + rh - cl); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cl, ry + rh);
        ctx.moveTo(rx + rw - cl, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cl);
        ctx.stroke();

        // Sleek compact pill label
        const friendlyDef = findMatchingTrainedClass(det.className);
        const rawName = matchedKi?.item?.name || friendlyDef?.friendlyNameVi || det.className;
        const cleanName = rawName.length > 18 ? rawName.slice(0, 17) + '…' : rawName;
        const confPct = Math.round((det.confidence || 0.95) * 100);
        const labelText = `${cleanName} ${confPct}%`;

        ctx.font = '600 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const pillW = Math.round(textMetrics.width + 18);
        const pillH = 17;
        const pillX = Math.max(2, Math.min(rx, w - pillW - 2));
        const pillY = ry >= 20 ? ry - 19 : Math.min(h - pillH - 2, ry + rh + 3);

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
    }

    // Add unforgeable audit banner
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} - ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, h - 36, w, 36);

    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`[QC PASS] KIT: ${kit?.code} - ${kit?.name}`, 12, h - 14);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '12px sans-serif';
    ctx.fillText(timeStr, w - 180, h - 14);

    // Save unannotated raw image so future AI rescanning is never obscured by watermarks
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = w;
    rawCanvas.height = h;
    const rawCtx = rawCanvas.getContext('2d');
    if (rawCtx) {
      rawCtx.drawImage(sourceEl, 0, 0, w, h);
      setRawQcPhotoUrl(rawCanvas.toDataURL('image/jpeg', 0.9));
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setQcPhotoUrl(dataUrl);
    setQcTimestamp(timeStr);

    handleStopCamera();
  };

  // File Upload handler with automatic compression for fast AI inference
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleStopCamera();
    try {
      const compressedB64 = await compressImageForVision(file, 1024, 0.85);
      setUploadedPreview(compressedB64);
      setTimeout(() => {
        runAiDetection(compressedB64);
      }, 150);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result as string;
        setUploadedPreview(b64);
        setTimeout(() => {
          runAiDetection(b64);
        }, 150);
      };
      reader.readAsDataURL(file);
    }
  };

  // Update line row in checklist
  const handleUpdateRow = (index: number, updates: Partial<ComponentInspectionRow>) => {
    setInspectionRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };

      if (updates.returnedQuantity !== undefined) {
        if (updates.returnedQuantity < next[index].initialQuantity) {
          next[index].condition = 'LOST';
        } else if (next[index].condition === 'LOST' && updates.returnedQuantity >= next[index].initialQuantity) {
          next[index].condition = 'GOOD';
        }
      }

      return next;
    });
  };

  // Assessment calculation
  const assessment = useMemo(() => {
    let totalInitial = 0;
    let totalReturned = 0;
    let totalGood = 0;
    let totalDamaged = 0;
    let totalLost = 0;
    const damagedOrLostItems: string[] = [];

    for (const r of inspectionRows) {
      totalInitial += r.initialQuantity;
      totalReturned += r.returnedQuantity;

      if (r.condition === 'GOOD' && r.returnedQuantity === r.initialQuantity) {
        totalGood += r.returnedQuantity;
      } else if (r.condition === 'DAMAGED') {
        totalDamaged += r.returnedQuantity;
        damagedOrLostItems.push(`Hỏng ${r.returnedQuantity}x ${r.itemName} (${r.itemCode})`);
      } else if (r.condition === 'LOST' || r.returnedQuantity < r.initialQuantity) {
        const missing = Math.max(0, r.initialQuantity - r.returnedQuantity);
        totalLost += missing;
        damagedOrLostItems.push(`Thiếu ${missing}x ${r.itemName} (${r.itemCode})`);
      }
    }

    const isPerfect = totalDamaged === 0 && totalLost === 0 && totalReturned === totalInitial;
    const targetStatus = isPerfect ? 'AVAILABLE' : 'MAINTENANCE';

    return {
      totalInitial,
      totalReturned,
      totalGood,
      totalDamaged,
      totalLost,
      isPerfect,
      targetStatus,
      damagedOrLostItems,
    };
  }, [inspectionRows]);

  if (!isOpen || !kit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      let reportSummary = '';
      if (assessment.isPerfect) {
        reportSummary = `[NGHIỆM THU: ĐẦY ĐỦ 100%] Đã kiểm đếm ${assessment.totalReturned}/${assessment.totalInitial} món (Tình trạng: TỐT). ${qcTimestamp ? `Ảnh QC: ${qcTimestamp}. ` : ''}${aiApplied ? 'Đã quét AI nhận diện. ' : ''}${generalNotes.trim() || 'Đưa về sẵn sàng.'}`;
      } else {
        const issues = assessment.damagedOrLostItems.join('; ');
        reportSummary = `[NGHIỆM THU: BẢO TRÌ] ${issues}. Thiếu: ${assessment.totalLost}, Hỏng: ${assessment.totalDamaged}. ${qcTimestamp ? `Ảnh QC: ${qcTimestamp}. ` : ''}${generalNotes.trim()}`;
      }

      const res = await apiClient.patch(`/kits/${kit.id}/status`, {
        status: assessment.targetStatus,
        notes: reportSummary.slice(0, 250),
      });

      if (res.data?.success) {
        if (assessment.isPerfect) {
          onSuccess(
            `Nghiệm thu thành công hộp kit "${kit.name}" (${kit.code}). Toàn bộ ${assessment.totalReturned} món linh kiện đầy đủ và tốt. Hộp kit đã được đưa lại trạng thái "Sẵn sàng".`
          );
        } else {
          onSuccess(
            `Nghiệm thu hộp kit "${kit.name}" (${kit.code}) hoàn tất: Phát hiện ${assessment.totalLost} món thiếu và ${assessment.totalDamaged} món hỏng hóc. Hộp kit đã được chuyển sang trạng thái "Bảo trì" để chờ bổ sung.`
          );
        }
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || 'Không thể cập nhật trạng thái nghiệm thu kit. Vui lòng thử lại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      {...modalDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-0 sm:p-3 md:p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="flex h-[100dvh] sm:h-auto sm:max-h-[94vh] w-full max-w-4xl flex-col sm:rounded-2xl bg-white shadow-2xl border-0 sm:border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-3.5 py-2.5 sm:px-6 sm:py-3.5 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 shadow-2xs">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 flex items-center flex-wrap gap-1.5">
                <span>Kiểm đếm & Nghiệm thu Hoàn trả Hộp Kit</span>
                <span className="inline-flex items-center space-x-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">
                  <Sparkles className="h-3 w-3 text-blue-500" />
                  <span>AI Camera Nhận diện linh kiện</span>
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 break-words">
                Đối soát số lượng và tình trạng linh kiện bên trong hộp kit qua Camera AI trước khi thu hồi về kho
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors shrink-0 ml-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center space-x-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Kit Identification & Status Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                  {kit.code}
                </span>
                <span className="font-bold text-slate-900 text-sm">{kit.name}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Đang thu hồi từ sinh viên
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 break-words">
                Kho lưu trữ: <span className="font-medium text-slate-700">{kit.location?.name || 'Kho phòng Lab'}</span>
                {kit.description ? ` • ${kit.description}` : ''}
              </p>
            </div>

            <div className="flex items-center space-x-3 text-xs">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Tiêu chuẩn đóng gói
                </span>
                <span className="font-bold text-slate-800">
                  {inspectionRows.length} loại ({assessment.totalInitial} món)
                </span>
              </div>
            </div>
          </div>

          {/* LIVE CAMERA & AI COMPONENT RECOGNITION SECTION */}
          <div className="rounded-xl border border-blue-200/80 bg-blue-50/30 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                  <Camera className="h-4 w-4 text-blue-600" />
                  <span>Quét Camera AI Nhận diện linh kiện (Component Vision Scanner)</span>
                </h4>
                <div className="flex items-center space-x-2 mt-0.5">
                  <p className="text-[11px] text-slate-500">
                    Đưa hộp kit hoặc các linh kiện vào khung hình để AI tự động nhận dạng và đếm số lượng
                  </p>
                  {isCheckingHealth && (
                    <span className="inline-flex items-center space-x-1 rounded-full bg-blue-100/80 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                      <RefreshCw className="h-2.5 w-2.5 animate-spin text-blue-600" />
                      <span>Đang kết nối AI...</span>
                    </span>
                  )}
                  {!isCheckingHealth && isVisionOnline === true && (
                    <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Model best (86 lớp): Sẵn sàng</span>
                    </span>
                  )}
                  {!isCheckingHealth && isVisionOnline === false && (
                    <span className="inline-flex items-center space-x-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                      <span>Vision: Chưa kết nối</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsAccumulateMode(!isAccumulateMode)}
                  className={`inline-flex items-center space-x-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition cursor-pointer shadow-2xs ${
                    isAccumulateMode
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Khi bật: quét từng ngăn/khay linh kiện sẽ được cộng dồn số lượng thay vì ghi đè"
                >
                  <Layers className={`h-3.5 w-3.5 ${isAccumulateMode ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Cộng dồn khay: {isAccumulateMode ? 'BẬT' : 'TẮT'}</span>
                </button>

                {!isCameraActive && !uploadedPreview && (
                  <>
                    <label className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs">
                      <Upload className="h-3.5 w-3.5 text-slate-500" />
                      <span>Tải ảnh hộp kit</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleStartCamera()}
                      className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 cursor-pointer transition"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Bật Camera AI</span>
                    </button>
                  </>
                )}

                {isCameraActive && (
                  <button
                    type="button"
                    onClick={handleStopCamera}
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 cursor-pointer"
                  >
                    Đóng Camera
                  </button>
                )}

                {uploadedPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedPreview(null);
                      setRawDetections([]);
                      setRecognizedSummary([]);
                    }}
                    className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-500 cursor-pointer"
                  >
                    Xóa ảnh đã tải
                  </button>
                )}
              </div>
            </div>

            {cameraError && (
              <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center space-x-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Video Viewport with Canvas Overlay (Always rendered in DOM to guarantee ref attachment) */}
            <div
              className={`relative rounded-xl border border-slate-300 bg-slate-950 overflow-hidden flex flex-col items-center justify-center ${
                isCameraActive || uploadedPreview ? 'block' : 'hidden'
              }`}
              style={{ minHeight: '260px' }}
            >
              {/* Live Video Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full max-h-72 object-contain ${uploadedPreview ? 'hidden' : 'block'}`}
              />

              {/* Uploaded Image Preview */}
              {uploadedPreview && (
                <img
                  ref={imageRef}
                  src={uploadedPreview}
                  alt="Uploaded kit frame"
                  className="w-full max-h-72 object-contain"
                />
              )}

              {/* Bounding Box Canvas Overlay */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none w-full h-full"
              />

              {/* Minimal Top HUD: Status (Left) & Camera/Overlay Toggles (Right) */}
              <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-950/75 backdrop-blur-md border border-slate-700/60 text-[10px] font-semibold text-white shadow-md pointer-events-none z-10">
                <span className={`h-2 w-2 rounded-full ${isAiScanning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                <span>{isAiScanning ? `AI Đang quét (${rawDetections.length} vật thể)` : 'Camera sẵn sàng'}</span>
              </div>

              <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 z-10">
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="h-7 w-7 flex items-center justify-center rounded-full bg-slate-950/75 backdrop-blur-md border border-slate-700/60 text-slate-200 hover:text-white shadow-md cursor-pointer transition active:scale-95"
                  title="Đổi camera trước / sau"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = overlayMode === 'all' ? 'boxes_only' : overlayMode === 'boxes_only' ? 'hidden' : 'all';
                    setOverlayMode(next);
                  }}
                  className="h-7 px-2 flex items-center space-x-1 rounded-full bg-slate-950/75 backdrop-blur-md border border-slate-700/60 text-[10px] font-semibold text-slate-200 hover:text-white shadow-md cursor-pointer transition active:scale-95"
                  title="Chế độ hiển thị khung nhận diện"
                >
                  {overlayMode === 'all' && <Eye className="h-3 w-3 text-emerald-400" />}
                  {overlayMode === 'boxes_only' && <Layers className="h-3 w-3 text-cyan-400" />}
                  {overlayMode === 'hidden' && <EyeOff className="h-3 w-3 text-slate-400" />}
                  <span>{overlayMode === 'all' ? 'Nhãn' : overlayMode === 'boxes_only' ? 'Chỉ viền' : 'Ẩn'}</span>
                </button>
              </div>
            </div>

            {/* Clean Camera Control Dock (Placed BELOW video to keep camera frame 100% visible & uncluttered) */}
            {(isCameraActive || uploadedPreview) && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-100/90 border border-slate-200">
                <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
                  <button
                    type="button"
                    onClick={handleToggleAiScan}
                    className={`flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 ${
                      isAiScanning
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isAiScanning ? (
                      <>
                        <Square className="h-3 w-3 fill-current" />
                        <span>Dừng quét AI</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-current" />
                        <span>Bật nhận diện AI</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isDetectingFrame}
                    onClick={() => runAiDetection()}
                    className="inline-flex items-center justify-center space-x-1 rounded-lg bg-white text-slate-700 border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-60 active:scale-95 transition"
                  >
                    <RefreshCw className={`h-3 w-3 ${isDetectingFrame ? 'animate-spin' : ''}`} />
                    <span>{isDetectingFrame ? 'Đang quét...' : 'Quét 1 ảnh'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs cursor-pointer active:scale-95 transition"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Chụp ảnh nghiệm thu QC</span>
                </button>
              </div>
            )}

            {/* VISION SERVICE OFFLINE NOTICE */}
            {visionError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs flex items-start space-x-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-bold">Dịch vụ nhận diện AI chưa phản hồi</p>
                    <button
                      type="button"
                      disabled={isCheckingHealth}
                      onClick={handleCheckHealth}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition cursor-pointer text-[11px] disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                      <span>{isCheckingHealth ? 'Đang kiểm tra...' : 'Thử lại kết nối AI'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-800 break-words leading-relaxed">
                    {typeof window !== 'undefined' && window.location.protocol === 'https:'
                      ? 'Máy chủ AI trên Cloud (Render) có thể đang khởi động lại sau thời gian rỗi hoặc đang bận xử lý. Vui lòng bấm "Thử lại kết nối AI" hoặc chờ khoảng 15-30 giây.'
                      : 'Vui lòng chạy lệnh: npm run vision trên terminal máy tính để kích hoạt mô hình best.pt (86 lớp trên port 5055).'}
                  </p>
                </div>
              </div>
            )}

            {/* EMPTY DETECTIONS STATUS (REAL SCAN WITH 0 OBJECTS) */}
            {(isCameraActive || uploadedPreview) && rawDetections.length === 0 && !visionError && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between text-xs text-slate-600 shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      Chưa phát hiện linh kiện nào trong khung hình (0 linh kiện)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Đặt linh kiện hoặc toàn bộ hộp kit vào trước camera để hệ thống nhận diện thật bằng AI.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center space-x-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span>Đang quét thực tế</span>
                </span>
              </div>
            )}

            {/* AI DETECTION RESULTS & AUTO-APPLY BAR */}
            {rawDetections.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-3 shadow-2xs transition-all duration-300">
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center flex-wrap gap-1.5">
                        <span>Đã phát hiện {rawDetections.length} đối tượng</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                          Khớp {recognizedSummary.filter((s) => s.isMatched).length}/{kit.items?.length || 0} loại linh kiện
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Kiểm tra các linh kiện đã quét bên dưới và áp dụng vào bảng nghiệm thu
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    {recognizedSummary.some((s) => s.detectedQty > 0) && (
                      <button
                        type="button"
                        onClick={handleResetAiDetections}
                        className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-2xs cursor-pointer transition active:scale-[0.99]"
                        title="Xóa toàn bộ số lượng AI đã đếm để quét lại từ đầu"
                      >
                        <RotateCcw className="h-3 w-3 text-slate-500" />
                        <span>Quét lại từ đầu</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleApplyAiToChecklist}
                      className={`w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer ${
                        aiApplied
                          ? 'bg-slate-100 text-slate-600 border border-slate-200'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99]'
                      }`}
                    >
                      {aiApplied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Đã áp dụng kết quả AI</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5 text-amber-300" />
                          <span>Áp dụng số lượng AI vào bảng kiểm đếm</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Filter Bar */}
                {kit.items && kit.items.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span className="font-medium">Tiến độ nhận diện hộp kit:</span>
                      <span className="font-bold text-emerald-700">
                        {Math.round((recognizedSummary.filter((s) => s.isMatched).length / kit.items.length) * 100)}%
                        <span className="font-normal text-slate-400 ml-1">
                          ({recognizedSummary.filter((s) => s.isMatched).length}/{kit.items.length} loại)
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.round((recognizedSummary.filter((s) => s.isMatched).length / kit.items.length) * 100))}%`,
                        }}
                      />
                    </div>

                    {/* Filter Segmented Control */}
                    <div className="flex items-center space-x-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setSummaryFilter('all')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                          summaryFilter === 'all'
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Tất cả ({recognizedSummary.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSummaryFilter('matched')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                          summaryFilter === 'matched'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        Đã thấy ({recognizedSummary.filter((s) => s.isMatched).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSummaryFilter('missing')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                          summaryFilter === 'missing'
                            ? 'bg-amber-700 text-white'
                            : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        Chưa thấy ({recognizedSummary.filter((s) => !s.isMatched).length})
                      </button>
                    </div>
                  </div>
                )}

                {/* Detected Items Clean Structured Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1 max-h-56 overflow-y-auto pr-1">
                  {filteredSummary.map((item) => {
                    const isFull = item.detectedQty >= item.expectedQty;
                    const isPartial = item.detectedQty > 0 && item.detectedQty < item.expectedQty;
                    return (
                      <div
                        key={item.itemCode}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between transition shadow-2xs ${
                          isFull
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                            : isPartial
                            ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                            : 'bg-slate-50/70 border-slate-200 text-slate-500'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold truncate leading-tight">{item.itemName}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.itemCode}</p>
                        </div>
                        <div className="shrink-0 flex items-center space-x-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              isFull
                                ? 'bg-emerald-100 text-emerald-800'
                                : isPartial
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.detectedQty}/{item.expectedQty} {item.unit}
                          </span>
                          {isFull ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          ) : isPartial ? (
                            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Còn thiếu linh kiện" />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Saved QC Photo Banner */}
            {qcPhotoUrl && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <img
                    src={qcPhotoUrl}
                    alt="QC Photo"
                    className="h-16 w-24 object-cover rounded-lg border border-emerald-300 shadow-2xs shrink-0"
                  />
                  <div className="min-w-0 text-xs">
                    <div className="font-semibold text-emerald-800 flex items-center space-x-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Đã lưu ảnh chụp nghiệm thu hiện trạng hộp kit (Có dấu xác thực QC)</span>
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      Thời gian xác thực: <span className="font-mono font-medium">{qcTimestamp}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={isDetectingFrame}
                    onClick={() => runAiDetection(rawQcPhotoUrl || qcPhotoUrl)}
                    className="inline-flex items-center space-x-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-2xs cursor-pointer transition active:scale-[0.99] disabled:opacity-60"
                    title="Nhận diện lại các linh kiện trong ảnh đã chụp bằng AI"
                  >
                    {isDetectingFrame ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    <span>{isDetectingFrame ? 'Đang phân tích AI...' : 'Quét AI ảnh này'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQcPhotoUrl(null);
                      setRawQcPhotoUrl(null);
                      setQcTimestamp(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer font-medium px-2 py-1"
                  >
                    Chụp lại
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Inspection Checklist Table & Mobile Cards */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 uppercase tracking-wider">
                <Package className="h-3.5 w-3.5 text-blue-600" />
                <span>Danh mục kiểm đếm từng linh kiện thành phần</span>
              </h4>
              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                Kiểm tra đầy đủ số lượng & ngoại quan
              </span>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block max-h-72 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-3">Linh kiện</th>
                    <th className="py-2 px-3 text-center">Chuẩn</th>
                    <th className="py-2 px-3 text-center">Thực nhận</th>
                    <th className="py-2 px-3 text-center">Tình trạng</th>
                    <th className="py-2 px-3">Ghi chú đối soát</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inspectionRows.map((row, idx) => {
                    const isMissing = row.returnedQuantity < row.initialQuantity;
                    const isDamaged = row.condition === 'DAMAGED';
                    const hasIssue = isMissing || isDamaged;

                    return (
                      <tr
                        key={row.itemId}
                        className={`transition-colors ${
                          hasIssue ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        {/* Item Code & Name */}
                        <td className="py-2.5 px-3 min-w-[200px]">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-[11px] font-bold text-slate-800">
                              {row.itemCode}
                            </span>
                            {row.aiVerified && (
                              <span className="inline-flex items-center space-x-0.5 rounded px-1.5 py-0.2 text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <Sparkles className="h-2.5 w-2.5 text-blue-500" />
                                <span>AI Verified</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 font-medium">
                            {row.itemName}
                          </div>
                        </td>

                        {/* Standard Initial Quantity */}
                        <td className="py-2.5 px-3 text-center font-bold text-slate-700 whitespace-nowrap">
                          {row.initialQuantity} <span className="text-[10px] text-slate-400 font-normal">{row.unit}</span>
                        </td>

                        {/* Returned Quantity Stepper */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center space-x-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRow(idx, {
                                  returnedQuantity: Math.max(0, row.returnedQuantity - 1),
                                })
                              }
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                              title="Giảm số lượng nhận"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={row.initialQuantity}
                              value={row.returnedQuantity}
                              onChange={(e) =>
                                handleUpdateRow(idx, {
                                  returnedQuantity: Math.max(
                                    0,
                                    Math.min(row.initialQuantity, parseInt(e.target.value, 10) || 0)
                                  ),
                                })
                              }
                              className={`w-9 text-center text-xs font-bold focus:outline-none ${
                                isMissing ? 'text-rose-600 bg-rose-50 rounded' : 'text-slate-800'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRow(idx, {
                                  returnedQuantity: Math.min(row.initialQuantity, row.returnedQuantity + 1),
                                })
                              }
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                              title="Tăng số lượng nhận"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        {/* Condition Selector */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <select
                            value={row.condition}
                            onChange={(e) =>
                              handleUpdateRow(idx, { condition: e.target.value as ComponentCondition })
                            }
                            className={`rounded-lg border px-2 py-1 text-xs font-semibold cursor-pointer focus:outline-none ${
                              row.condition === 'GOOD'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : row.condition === 'DAMAGED'
                                ? 'bg-amber-50 border-amber-300 text-amber-800'
                                : 'bg-rose-50 border-rose-300 text-rose-700'
                            }`}
                          >
                            <option value="GOOD">🟢 Tốt (Đầy đủ)</option>
                            <option value="DAMAGED">🟡 Hỏng hóc</option>
                            <option value="LOST">🔴 Thất lạc / Thiếu</option>
                          </select>
                        </td>

                        {/* Line Notes */}
                        <td className="py-2.5 px-3 min-w-[160px]">
                          <input
                            type="text"
                            value={row.notes}
                            onChange={(e) => handleUpdateRow(idx, { notes: e.target.value })}
                            placeholder={hasIssue ? 'Ghi rõ tình trạng lỗi...' : 'Bình thường'}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch-Friendly Card View */}
            <div className="block md:hidden max-h-96 overflow-y-auto divide-y divide-slate-100 p-2 space-y-2.5">
              {inspectionRows.map((row, idx) => {
                const isMissing = row.returnedQuantity < row.initialQuantity;
                const isDamaged = row.condition === 'DAMAGED';
                const hasIssue = isMissing || isDamaged;

                return (
                  <div
                    key={row.itemId}
                    className={`rounded-xl border p-3 transition-colors ${
                      hasIssue
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-200/90 bg-white shadow-2xs'
                    }`}
                  >
                    {/* Top: SKU, AI Badge & Standard Qty */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {row.itemCode}
                          </span>
                          {row.aiVerified && (
                            <span className="inline-flex items-center space-x-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Sparkles className="h-2.5 w-2.5 text-blue-500" />
                              <span>AI Đã đếm</span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-900 mt-1">
                          {row.itemName}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          Chuẩn: {row.initialQuantity} {row.unit}
                        </span>
                      </div>
                    </div>

                    {/* Controls Row: Touch Stepper & Condition Selector */}
                    <div className="mt-2.5 grid grid-cols-2 gap-2 items-center">
                      {/* Quantity Stepper with large touch buttons */}
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 p-1">
                        <span className="text-[11px] text-slate-500 font-medium pl-1">Thực nhận:</span>
                        <div className="flex items-center space-x-1 bg-white rounded-md border border-slate-200 p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateRow(idx, {
                                returnedQuantity: Math.max(0, row.returnedQuantity - 1),
                              })
                            }
                            className="h-7 w-7 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100 active:bg-slate-200 text-sm font-bold"
                            aria-label="Giảm"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={row.initialQuantity}
                            value={row.returnedQuantity}
                            onChange={(e) =>
                              handleUpdateRow(idx, {
                                returnedQuantity: Math.max(
                                  0,
                                  Math.min(row.initialQuantity, parseInt(e.target.value, 10) || 0)
                                ),
                              })
                            }
                            className={`w-8 text-center text-xs font-bold focus:outline-none ${
                              isMissing ? 'text-rose-600 font-black' : 'text-slate-800'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateRow(idx, {
                                returnedQuantity: Math.min(row.initialQuantity, row.returnedQuantity + 1),
                              })
                            }
                            className="h-7 w-7 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100 active:bg-slate-200 text-sm font-bold"
                            aria-label="Tăng"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Condition Dropdown */}
                      <select
                        value={row.condition}
                        onChange={(e) =>
                          handleUpdateRow(idx, { condition: e.target.value as ComponentCondition })
                        }
                        className={`w-full rounded-lg border py-1.5 px-2 text-xs font-semibold focus:outline-none ${
                          row.condition === 'GOOD'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : row.condition === 'DAMAGED'
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-rose-50 border-rose-300 text-rose-800'
                        }`}
                      >
                        <option value="GOOD">🟢 Tốt (Đầy đủ)</option>
                        <option value="DAMAGED">🟡 Hỏng hóc</option>
                        <option value="LOST">🔴 Thiếu / Mất</option>
                      </select>
                    </div>

                    {/* Note input if issue or user custom note */}
                    <div className="mt-2">
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => handleUpdateRow(idx, { notes: e.target.value })}
                        placeholder={hasIssue ? 'Ghi rõ tình trạng thiếu/lỗi...' : 'Ghi chú đối soát (tùy chọn)'}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Automated Assessment Verdict Banner */}
          <div
            className={`rounded-xl border p-4 text-xs ${
              assessment.isPerfect
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/90 border-amber-300 text-amber-900'
            }`}
          >
            <div className="flex items-start space-x-2.5">
              {assessment.isPerfect ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold text-sm">
                  {assessment.isPerfect
                    ? 'Đánh giá nghiệm thu: ĐẦY ĐỦ VÀ TỐT 100%'
                    : 'Đánh giá nghiệm thu: PHÁT HIỆN HAO HỤT / HỎNG HÓC'}
                </div>
                <p className="leading-relaxed">
                  {assessment.isPerfect ? (
                    <span>
                      Toàn bộ <b>{assessment.totalReturned}/{assessment.totalInitial} món</b> linh kiện trong hộp kit đều nguyên vẹn và đầy đủ. Hộp kit sẽ được tự động đưa về trạng thái <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">SẴN SÀNG (AVAILABLE)</span> để tiếp tục phục vụ sinh viên khác.
                    </span>
                  ) : (
                    <span>
                      Phát hiện <b>{assessment.totalLost} món thất lạc</b> và <b>{assessment.totalDamaged} món hỏng hóc</b>! Hộp kit sẽ được tự động chuyển sang trạng thái <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">BẢO TRÌ (MAINTENANCE)</span> để thủ kho tiến hành bổ sung/thay thế linh kiện trước khi cho mượn lại.
                    </span>
                  )}
                </p>
                {!assessment.isPerfect && assessment.damagedOrLostItems.length > 0 && (
                  <div className="mt-1 text-[11px] font-medium text-amber-800 bg-amber-100/60 p-2 rounded-lg">
                    Chi tiết: {assessment.damagedOrLostItems.join(' • ')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* General Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú nghiệm thu bổ sung
            </label>
            <textarea
              rows={2}
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="VD: Sinh viên đã bàn giao trực tiếp tại quầy / Bổ sung cáp mới thay thế"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none resize-none"
            />
          </div>

          {/* Actions - Single Compact Row on Mobile to avoid jumping and screen occlusion */}
          <div className="pt-2.5 border-t border-slate-200 flex flex-row items-center justify-between sm:justify-end gap-2 sticky bottom-0 bg-white/95 backdrop-blur-md z-20 pb-3 sm:pb-0 -mx-3.5 sm:mx-0 px-3.5 sm:px-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-24 sm:w-auto rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition text-center active:scale-95 shrink-0"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center space-x-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md cursor-pointer transition disabled:opacity-60 active:scale-95 ${
                assessment.isPerfect
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {submitting
                  ? 'Đang ghi nhận...'
                  : assessment.isPerfect
                  ? 'Xác nhận Nghiệm thu ➔ Sẵn sàng'
                  : 'Xác nhận Nghiệm thu ➔ Bảo trì'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
