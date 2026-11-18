import React, { useState, useMemo, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { apiClient } from '../../services/api';
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
}

export interface KitReturnInspectionModalProps {
  isOpen: boolean;
  kit: KitRecordForBorrow | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
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

  // Camera QC state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [qcPhotoUrl, setQcPhotoUrl] = useState<string | null>(null);
  const [qcTimestamp, setQcTimestamp] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Initialize checklist rows from kit items
  useEffect(() => {
    if (!isOpen || !kit) return;
    setErrorMessage(null);
    setGeneralNotes('');
    setQcPhotoUrl(null);
    setQcTimestamp(null);
    setIsCameraActive(false);

    const rows: ComponentInspectionRow[] = (kit.items || []).map((ki) => ({
      itemId: ki.itemId,
      itemCode: ki.item?.code || 'LINH_KIEN',
      itemName: ki.item?.name || 'Linh kiện thành phần',
      unit: ki.item?.unit || 'cái',
      initialQuantity: ki.quantity || 1,
      returnedQuantity: ki.quantity || 1,
      condition: 'GOOD',
      notes: '',
    }));
    setInspectionRows(rows);
  }, [isOpen, kit]);

  // Clean up camera stream on close
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  const handleStartCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      setCameraError('Không thể mở camera. Bạn có thể tải ảnh chụp hộp kit từ máy tính.');
      setIsCameraActive(false);
    }
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setQcPhotoUrl(dataUrl);
      const now = new Date();
      setQcTimestamp(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
      );
    }
    // Stop camera stream after capture
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setQcPhotoUrl(reader.result as string);
      const now = new Date();
      setQcTimestamp(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
      );
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateRow = (index: number, updates: Partial<ComponentInspectionRow>) => {
    setInspectionRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };

      // Auto update condition if quantity returned < initial
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

  // Automated Assessment Calculation
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
        reportSummary = `[NGHIỆM THU: ĐẦY ĐỦ 100%] Đã kiểm đếm ${assessment.totalReturned}/${assessment.totalInitial} món (Tình trạng: TỐT). ${qcTimestamp ? `Ảnh QC: ${qcTimestamp}. ` : ''}${generalNotes.trim() || 'Đưa về sẵn sàng.'}`;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-6 py-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 shadow-2xs">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Kiểm đếm & Nghiệm thu Hoàn trả Hộp Kit
              </h3>
              <p className="text-[11px] text-slate-500">
                Đối soát số lượng và tình trạng linh kiện bên trong hộp kit trước khi thu hồi về kho
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center space-x-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Kit Identification & Status Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                  {kit.code}
                </span>
                <span className="font-bold text-slate-900 text-sm">{kit.name}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Đang thu hồi từ sinh viên
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
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

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
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
                          <div className="font-mono text-[11px] font-bold text-slate-800">
                            {row.itemCode}
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

          {/* Live Camera QC Proof Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                  <Camera className="h-4 w-4 text-blue-600" />
                  <span>Ảnh chụp hiện trạng nghiệm thu hộp kit (Live QC Proof)</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Lưu bằng chứng hình ảnh khi tiếp nhận hộp kit từ sinh viên
                </p>
              </div>

              {!qcPhotoUrl && !isCameraActive && (
                <div className="flex items-center space-x-2">
                  <label className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs">
                    <Upload className="h-3.5 w-3.5 text-slate-500" />
                    <span>Tải ảnh lên</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleStartCamera}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 cursor-pointer transition"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Mở Camera</span>
                  </button>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                {cameraError}
              </div>
            )}

            {/* Video preview for live capture */}
            {isCameraActive && (
              <div className="relative rounded-xl border border-slate-300 bg-black overflow-hidden flex flex-col items-center p-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="max-h-56 w-auto rounded-lg"
                />
                <div className="mt-2.5 flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (mediaStreamRef.current) {
                        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
                        mediaStreamRef.current = null;
                      }
                      setIsCameraActive(false);
                    }}
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
                  >
                    Đóng Camera
                  </button>
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-md"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Chụp ảnh nghiệm thu</span>
                  </button>
                </div>
              </div>
            )}

            {/* Captured Image Preview */}
            {qcPhotoUrl && (
              <div className="flex items-center space-x-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <img
                  src={qcPhotoUrl}
                  alt="QC Photo"
                  className="h-16 w-24 object-cover rounded-lg border border-emerald-300 shadow-2xs"
                />
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-emerald-800 flex items-center space-x-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Đã lưu ảnh chụp nghiệm thu hiện trạng hộp kit</span>
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
                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Chụp lại
                </button>
              </div>
            )}
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
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center space-x-2 rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer transition disabled:opacity-60 ${
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
