import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import {
  detectFrameBase64,
  detectFrameFile,
  checkVisionHealth,
  type VisionDetection,
  type VisionDetectResponse,
} from '../../services/vision.service';
import type { ReturnCondition, ReturnInputRow } from '../../pages/borrowReturnPartial';

interface BorrowDetailItem {
  id: string;
  itemId: string;
  item?: { id: string; code: string; name: string; unit: string };
  quantity: number;
  returnedQuantity: number;
}

interface BorrowRecord {
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
}

interface StagedReturnItem {
  detailId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  remaining: number;
  quantity: number;
  condition: ReturnCondition;
  matchedFromAi?: string;
  confidence?: number;
}

export const CameraReturnModal: React.FC<CameraReturnModalProps> = ({
  isOpen,
  onClose,
  borrowRecord,
  onApplyReturnRows,
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

  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [stagedItems, setStagedItems] = useState<Record<string, StagedReturnItem>>({});
  const [statusNotice, setStatusNotice] = useState<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  // Remaining borrow details that still have outstanding quantities
  const outstandingDetails = (borrowRecord.details || []).filter(
    (d) => d.quantity > (d.returnedQuantity || 0)
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
      setPermissionErrorMsg(err.message || 'Không thể truy cập camera. Vui lòng cấp quyền hoặc tải ảnh lên.');
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

  // Match AI detections to outstanding borrow details
  const processDetections = useCallback((detectedList: VisionDetection[]) => {
    setDetections(detectedList);

    if (detectedList.length === 0) {
      return;
    }

    setStagedItems((prev) => {
      const updated = { ...prev };

      for (const det of detectedList) {
        // Find matching borrow detail item by suggested item code or class name
        const match = outstandingDetails.find((d) => {
          const itemCode = d.item?.code || '';
          const itemName = d.item?.name || '';
          if (det.suggestedItemCode && itemCode.toUpperCase() === det.suggestedItemCode.toUpperCase()) {
            return true;
          }
          if (itemName.toLowerCase().includes(det.className.toLowerCase())) {
            return true;
          }
          return false;
        });

        if (match) {
          const remaining = match.quantity - (match.returnedQuantity || 0);
          const currentQty = updated[match.id]?.quantity || 0;
          // Increment or clamp to remaining quantity
          const nextQty = Math.min(Math.max(currentQty, 1), remaining);

          updated[match.id] = {
            detailId: match.id,
            itemCode: match.item?.code || match.itemId,
            itemName: match.item?.name || 'Linh kiện',
            unit: match.item?.unit || 'cái',
            remaining,
            quantity: nextQty,
            condition: updated[match.id]?.condition || 'GOOD',
            matchedFromAi: det.className,
            confidence: det.confidence,
          };
        }
      }
      return updated;
    });
  }, [outstandingDetails]);

  // Draw overlay bounding boxes on canvas
  const drawOverlay = useCallback((detectedList: VisionDetection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    const scaleX = displayWidth / videoWidth;
    const scaleY = displayHeight / videoHeight;

    for (const det of detectedList) {
      const { x1, y1, x2, y2 } = det.boundingBox;
      const rx = x1 * scaleX;
      const ry = y1 * scaleY;
      const rw = (x2 - x1) * scaleX;
      const rh = (y2 - y1) * scaleY;

      // Draw bounding box
      ctx.strokeStyle = det.suggestedItemCode ? '#10B981' : '#F59E0B';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx, ry, rw, rh);

      // Label background
      const label = `${det.className} (${Math.round(det.confidence * 100)}%)`;
      ctx.font = 'bold 12px sans-serif';
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = det.suggestedItemCode ? '#10B981' : '#F59E0B';
      ctx.fillRect(rx, Math.max(0, ry - 22), textWidth + 10, 22);

      // Label text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, rx + 5, Math.max(16, ry - 6));
    }
  }, []);

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
        drawOverlay(res.detections);
        if (res.detections.length > 0) {
          setStatusNotice({
            type: 'success',
            text: `Nhận diện ${res.detections.length} linh kiện trong ${res.inferenceTimeMs}ms.`,
          });
        }
      }
    } catch (err: any) {
      console.warn('Inference error:', err);
    } finally {
      isInFlightRef.current = false;
    }
  }, [drawOverlay, processDetections]);

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
      setStatusNotice({ type: 'info', text: 'Đang liên tục quét và nhận diện linh kiện qua camera...' });
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
          setStatusNotice({
            type: 'success',
            text: `Nhận diện ảnh thành công: tìm thấy ${res.detections.length} linh kiện (${res.inferenceTimeMs}ms).`,
          });
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
        notesArr.push(`[AI: ${item.matchedFromAi} (${Math.round((item.confidence || 0) * 100)}%)]`);
      }
    }

    const suggestedNotes = notesArr.length > 0 ? `Nhận diện qua Camera: ${notesArr.join(', ')}` : undefined;

    stopCameraStream();
    onApplyReturnRows(rows, suggestedNotes);
    onClose();
  };

  const handleModalClose = () => {
    stopCameraStream();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
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
                Phiếu mượn: <strong className="text-slate-700">{borrowRecord.requestNumber}</strong> | Người mượn: {borrowRecord.borrowerName}
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
              {statusNotice.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600" />}
              {statusNotice.type === 'success' && <CheckCircle className="h-4 w-4 text-emerald-600" />}
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

        {/* Main Content Layout: Left Camera / Right Staged Components */}
        <div className="grid flex-1 grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Column: Camera Viewport */}
          <div className="relative flex flex-col items-center justify-center bg-slate-900 md:col-span-7 p-3">
            {/* Viewport container */}
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-black border border-slate-800 shadow-inner">
              {uploadedPreview ? (
                <img
                  src={uploadedPreview}
                  alt="Linh kiện tải lên"
                  className="max-h-full max-w-full object-contain"
                />
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
                    {permissionErrorMsg || 'Cấp quyền truy cập camera để bắt đầu nhận diện real-time.'}
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

          {/* Right Column: Matched & Staged Items for Return */}
          <div className="flex flex-col md:col-span-5 bg-white border-l border-slate-200 p-4 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-1.5">
                <Layers className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Linh kiện hoàn trả</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {Object.keys(stagedItems).length} đã chọn
              </span>
            </div>

            {/* Notice about manual verification requirement */}
            <div className="mt-2.5 rounded-lg bg-blue-50/80 p-2 text-[11px] text-blue-800 border border-blue-100">
              <p>
                <strong>Quy tắc an toàn:</strong> AI chỉ đóng vai trò gợi ý. Bạn phải kiểm tra thực tế số lượng và tình trạng trước khi áp dụng.
              </p>
            </div>

            {/* List of staged return items */}
            <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {Object.keys(stagedItems).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                  <Sparkles className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">Chưa có linh kiện nào được nhận diện</p>
                  <p className="mt-0.5 text-[11px] text-slate-400 max-w-xs">
                    Đưa linh kiện vào khung hình camera hoặc chọn thủ công từ danh sách bên dưới.
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
                      <div className="inline-flex items-center space-x-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                        <Sparkles className="h-3 w-3" />
                        <span>AI: {item.matchedFromAi} ({Math.round((item.confidence || 0) * 100)}%)</span>
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
                              handleUpdateQuantity(item.detailId, parseInt(e.target.value) || 1)
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
                            handleUpdateCondition(item.detailId, e.target.value as ReturnCondition)
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

            {/* Manual fallback: add from un-staged borrow details */}
            <div className="mt-3 pt-3 border-t border-slate-200">
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
                        {d.item?.name || d.itemId} (Còn lại: {d.quantity - (d.returnedQuantity || 0)})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
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
