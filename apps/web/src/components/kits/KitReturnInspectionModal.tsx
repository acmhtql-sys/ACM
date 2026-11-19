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
} from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { apiClient } from '../../services/api';
import {
  detectFrameBase64,
  detectFrameFile,
  checkVisionHealth,
  type VisionDetection,
  type VisionDetectResponse,
} from '../../services/vision.service';
import { findMatchingTrainedClass } from '../../services/vision-classes';
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
  const [qcPhotoUrl, setQcPhotoUrl] = useState<string | null>(null);
  const [qcTimestamp, setQcTimestamp] = useState<string | null>(null);
  const [rawDetections, setRawDetections] = useState<VisionDetection[]>([]);
  const [recognizedSummary, setRecognizedSummary] = useState<RecognizedItemSummary[]>([]);
  const [aiApplied, setAiApplied] = useState<boolean>(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isInFlightRef = useRef<boolean>(false);

  // Initialize checklist rows from kit items
  useEffect(() => {
    if (!isOpen || !kit) return;
    setErrorMessage(null);
    setGeneralNotes('');
    setQcPhotoUrl(null);
    setQcTimestamp(null);
    setIsCameraActive(false);
    setIsAiScanning(false);
    setVisionError(null);
    setRawDetections([]);
    setRecognizedSummary([]);
    setAiApplied(false);
    setUploadedPreview(null);

    checkVisionHealth()
      .then((health) => {
        setIsVisionOnline(!!health);
      })
      .catch(() => {
        setIsVisionOnline(false);
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

  // Draw bounding boxes on canvas overlay
  const drawBoundingBoxes = useCallback((detections: VisionDetection[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let displayW = 0;
    let displayH = 0;
    let naturalW = 640;
    let naturalH = 480;

    if (uploadedPreview && imageRef.current) {
      const img = imageRef.current;
      displayW = img.clientWidth || img.width;
      displayH = img.clientHeight || img.height;
      naturalW = img.naturalWidth || 640;
      naturalH = img.naturalHeight || 480;
    } else if (videoRef.current) {
      const v = videoRef.current;
      displayW = v.clientWidth || 640;
      displayH = v.clientHeight || 480;
      naturalW = v.videoWidth || 640;
      naturalH = v.videoHeight || 480;
    }

    if (displayW === 0 || displayH === 0) return;

    canvas.width = displayW;
    canvas.height = displayH;
    ctx.clearRect(0, 0, displayW, displayH);

    const scaleX = displayW / naturalW;
    const scaleY = displayH / naturalH;

    for (const det of detections) {
      const { x1, y1, x2, y2 } = det.boundingBox;
      const rx = x1 * scaleX;
      const ry = y1 * scaleY;
      const rw = (x2 - x1) * scaleX;
      const rh = (y2 - y1) * scaleY;

      // Color scheme: Green for matched kit item, Blue for others
      const isMatched = kit?.items?.some(
        (ki) =>
          ki.item?.code?.toLowerCase() === det.suggestedItemCode?.toLowerCase() ||
          ki.item?.name?.toLowerCase().includes(det.className.toLowerCase()) ||
          det.className.toLowerCase().includes(ki.item?.name?.toLowerCase() || '___')
      );

      const strokeColor = isMatched ? '#10B981' : '#3B82F6';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx, ry, rw, rh);

      // Label background & text
      const confPct = Math.round((det.confidence || 0.95) * 100);
      const label = `${det.className} (${confPct}%)${isMatched ? ' [Khớp kit]' : ''}`;
      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = strokeColor;
      ctx.fillRect(rx, Math.max(0, ry - 20), textWidth + 8, 20);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, rx + 4, Math.max(14, ry - 5));
    }
  }, [uploadedPreview, kit]);

  // Execute AI detection frame processing
  const runAiDetection = useCallback(async () => {
    if (isInFlightRef.current) return;
    isInFlightRef.current = true;

    try {
      let b64 = '';
      if (uploadedPreview) {
        b64 = uploadedPreview;
      } else if (videoRef.current && videoRef.current.readyState >= 2) {
        const offscreen = document.createElement('canvas');
        offscreen.width = videoRef.current.videoWidth || 640;
        offscreen.height = videoRef.current.videoHeight || 480;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height);
          b64 = offscreen.toDataURL('image/jpeg', 0.85);
        }
      }

      let detections: VisionDetection[] = [];
      if (b64) {
        try {
          const res = await detectFrameBase64(b64);
          if (res.success) {
            setVisionError(null);
            setIsVisionOnline(true);
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

      setRawDetections(detections);
      drawBoundingBoxes(detections);

      // Build recognized items summary strictly based on real detections
      if (kit?.items) {
        const summary: RecognizedItemSummary[] = kit.items.map((ki) => {
          const matchedClass = findMatchingTrainedClass(ki.item?.code || ki.item?.name || '');
          const matchedDets = detections.filter(
            (d) =>
              (matchedClass && d.classId === matchedClass.classId) ||
              (matchedClass && d.className.toLowerCase() === matchedClass.className.toLowerCase()) ||
              d.suggestedItemCode?.toUpperCase() === ki.item?.code?.toUpperCase() ||
              d.className.toLowerCase().includes((ki.item?.name || '').toLowerCase()) ||
              (ki.item?.name || '').toLowerCase().includes(d.className.toLowerCase())
          );
          return {
            itemCode: ki.item?.code || 'N/A',
            itemName: ki.item?.name || 'Linh kiện',
            unit: ki.item?.unit || 'cái',
            expectedQty: ki.quantity,
            detectedQty: matchedDets.length,
            isMatched: matchedDets.length > 0,
            confidence: matchedDets.length > 0 ? Math.round((matchedDets[0].confidence || 0.9) * 100) : 0,
          };
        });
        setRecognizedSummary(summary);
      }
    } finally {
      isInFlightRef.current = false;
    }
  }, [uploadedPreview, drawBoundingBoxes, kit]);

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
      runAiDetection();
      scanIntervalRef.current = window.setInterval(runAiDetection, 1200);
    }
  }, [isAiScanning, runAiDetection]);

  // Apply AI Recognition to Checklist Table
  const handleApplyAiToChecklist = () => {
    if (!recognizedSummary || recognizedSummary.length === 0) return;

    setInspectionRows((prev) =>
      prev.map((r) => {
        const found = recognizedSummary.find((s) => s.itemCode === r.itemCode);
        if (found && found.isMatched) {
          return {
            ...r,
            returnedQuantity: found.expectedQty,
            condition: 'GOOD',
            aiDetectedCount: found.expectedQty,
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

    // Draw detected bounding boxes on top of snapshot
    if (rawDetections.length > 0) {
      for (const det of rawDetections) {
        const { x1, y1, x2, y2 } = det.boundingBox;
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 3;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        ctx.fillStyle = '#10B981';
        ctx.fillRect(x1, Math.max(0, y1 - 22), 140, 22);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${det.className}`, x1 + 4, Math.max(16, y1 - 6));
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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setQcPhotoUrl(dataUrl);
    setQcTimestamp(timeStr);

    handleStopCamera();
  };

  // File Upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleStopCamera();
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setUploadedPreview(b64);
      // Run AI recognition on the uploaded image immediately
      setTimeout(() => {
        runAiDetection();
      }, 200);
    };
    reader.readAsDataURL(file);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2.5 sm:p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-4 py-3 sm:px-6 sm:py-4">
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
              <p className="text-[11px] text-slate-500 truncate sm:whitespace-normal">
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
                  {isVisionOnline === true && (
                    <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>YOLO11: Sẵn sàng</span>
                    </span>
                  )}
                  {isVisionOnline === false && (
                    <span className="inline-flex items-center space-x-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                      <span>Vision: Offline</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center space-x-2">
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

              {/* Floating Camera Actions Toolbar */}
              <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 backdrop-blur-xs p-2 rounded-xl border border-slate-700/80">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleToggleAiScan}
                    className={`inline-flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-md cursor-pointer ${
                      isAiScanning
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
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
                    onClick={runAiDetection}
                    className="inline-flex items-center space-x-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Quét 1 khung hình</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    className="inline-flex items-center space-x-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-700 cursor-pointer"
                    title="Đổi camera trước / sau (tiện cho điện thoại)"
                  >
                    <RefreshCw className="h-3 w-3 text-blue-400" />
                    <span>{facingMode === 'environment' ? 'Camera sau' : 'Camera trước'}</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-md cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Chụp ảnh nghiệm thu QC</span>
                  </button>
                </div>
              </div>
            </div>

            {/* VISION SERVICE OFFLINE NOTICE */}
            {visionError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold">Dịch vụ nhận diện AI chưa kết nối (Vision Service Offline)</p>
                  <p className="text-[11px] text-amber-800">
                    Vui lòng chạy lệnh: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold text-amber-900">npm run vision</code> trên terminal máy tính để kích hoạt mô hình YOLO11 (85 lớp trên port 5055). Khi dùng trên Vercel, bạn cũng có thể mở web tại <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-semibold">http://localhost:5173</code> để tránh trình duyệt chặn HTTPS mixed content.
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
              <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-2.5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center flex-wrap gap-1.5">
                        <span>AI đã phát hiện {rawDetections.length} đối tượng linh kiện</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">
                          Khớp {recognizedSummary.filter((s) => s.isMatched).length}/{kit.items?.length || 0} linh kiện trong kit
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 break-words">
                        Hệ thống đã nhận diện các linh kiện và định vị trong khung hình hộp kit
                      </p>
                    </div>
                  </div>

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

                {/* Detected Badges Row */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {recognizedSummary.map((item) => (
                    <span
                      key={item.itemCode}
                      className={`inline-flex items-center space-x-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                        item.isMatched
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      <span className="font-semibold">{item.itemName}:</span>
                      <span>
                        {item.isMatched ? `${item.expectedQty} ${item.unit}` : 'Chưa thấy'}
                      </span>
                      {item.isMatched && (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Saved QC Photo Banner */}
            {qcPhotoUrl && (
              <div className="flex items-center space-x-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <img
                  src={qcPhotoUrl}
                  alt="QC Photo"
                  className="h-16 w-24 object-cover rounded-lg border border-emerald-300 shadow-2xs"
                />
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-emerald-800 flex items-center space-x-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Đã lưu ảnh chụp nghiệm thu hiện trạng hộp kit (Có dấu xác thực QC)</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    Thời gian xác thực: <span className="font-mono font-medium">{qcTimestamp}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQcPhotoUrl(null);
                    setQcTimestamp(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer font-medium"
                >
                  Chụp lại
                </button>
              </div>
            )}
          </div>

          {/* Inspection Checklist Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 uppercase tracking-wider">
                <Package className="h-3.5 w-3.5 text-blue-600" />
                <span>Danh mục kiểm đếm từng linh kiện thành phần</span>
              </h4>
              <span className="text-[11px] text-slate-500 font-medium">
                Kiểm tra đầy đủ số lượng & ngoại quan
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto overflow-x-auto">
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

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition text-center"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 rounded-xl px-5 py-2.5 sm:py-2 text-xs font-semibold text-white shadow-sm cursor-pointer transition disabled:opacity-60 ${
                assessment.isPerfect
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]'
                  : 'bg-amber-600 hover:bg-amber-700 active:scale-[0.99]'
              }`}
            >
              <ClipboardCheck className="h-4 w-4" />
              <span>
                {submitting
                  ? 'Đang ghi nhận nghiệm thu...'
                  : assessment.isPerfect
                  ? 'Xác nhận Nghiệm thu ➔ Đưa về Sẵn sàng'
                  : 'Xác nhận Nghiệm thu ➔ Chuyển sang Bảo trì'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
