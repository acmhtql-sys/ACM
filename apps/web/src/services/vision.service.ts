/**
 * Vision Service Client for AI Camera-Assisted Component Return
 * Talks directly to the lightweight AI inference service (default http://localhost:5055).
 * No database access. No persistent storage.
 */

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface VisionDetection {
  classId: number;
  className: string;
  confidence: number;
  boundingBox: BoundingBox;
  suggestedItemCode?: string | null;
}

export interface VisionDetectResponse {
  success: boolean;
  frameId?: string;
  timestamp?: number;
  modelVersion?: string;
  modelHash?: string;
  imageDimensions?: { width: number; height: number };
  inferenceTimeMs?: number;
  detectionsCount?: number;
  detections?: VisionDetection[];
  error?: string;
}

export interface VisionHealthResponse {
  status: string;
  service: string;
  modelVersion: string;
  modelHash: string;
  classesCount: number;
  device: string;
}

export function getVisionServiceUrl(): string {
  return import.meta.env.VITE_VISION_SERVICE_URL || 'http://localhost:5055';
}

export async function checkVisionHealth(): Promise<VisionHealthResponse> {
  const url = `${getVisionServiceUrl()}/health`;
  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
  if (!res.ok) {
    throw new Error(`Vision service unhealthy (HTTP ${res.status})`);
  }
  return res.json();
}

export async function detectFrameBase64(imageBase64: string): Promise<VisionDetectResponse> {
  const url = `${getVisionServiceUrl()}/api/v1/vision/detect`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: imageBase64 }),
    signal: AbortSignal.timeout(6000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Lỗi nhận diện AI (HTTP ${res.status})`);
  }
  return data;
}

export async function detectFrameFile(file: File | Blob): Promise<VisionDetectResponse> {
  const url = `${getVisionServiceUrl()}/api/v1/vision/detect`;
  const formData = new FormData();
  formData.append('file', file, 'frame.jpg');

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(6000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Lỗi nhận diện AI (HTTP ${res.status})`);
  }
  return data;
}
