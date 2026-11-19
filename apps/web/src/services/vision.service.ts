/**
 * Vision Service Client for AI Camera-Assisted Component Return & Practice Kits
 * Connects directly to the Python YOLO11 AI inference service (default http://localhost:5055).
 * Guarantees zero false simulated detections: only returns real detections when components are present.
 */

import { YOLO11_85_CLASSES, findMatchingTrainedClass } from './vision-classes';

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

export const CLOUD_VISION_FALLBACK_URL = 'https://acm-vision-service.onrender.com';

export function getVisionServiceUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('acm_vision_service_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/$/, '');
    }

    // Auto-resolve LAN IP when accessed from phone on the same Wi-Fi (e.g., http://192.168.1.7:5173)
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const isLanIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      if (isLanIp) {
        return `http://${hostname}:5055`;
      }
      // If we are on an HTTPS production/preview domain (like Vercel acm-*.vercel.app),
      // default to Cloud Vision service URL so mobile browsers don't block mixed content!
      if (window.location.protocol === 'https:') {
        return import.meta.env.VITE_VISION_SERVICE_URL || CLOUD_VISION_FALLBACK_URL;
      }
    }
  }
  return import.meta.env.VITE_VISION_SERVICE_URL || 'http://localhost:5055';
}

export function setCustomVisionServiceUrl(url: string | null): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('acm_vision_service_url', url.trim().replace(/\/$/, ''));
    } else {
      localStorage.removeItem('acm_vision_service_url');
    }
  }
}

export async function checkVisionHealth(): Promise<VisionHealthResponse | null> {
  const base = getVisionServiceUrl();
  const urlsToTry = [
    `${base}/health`,
    base.includes('localhost') ? `${base.replace('localhost', '127.0.0.1')}/health` : null,
    base !== CLOUD_VISION_FALLBACK_URL && typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? `${CLOUD_VISION_FALLBACK_URL}/health`
      : null,
  ].filter(Boolean) as string[];

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Continue to next URL candidate
    }
  }
  return null;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('acm_token') || localStorage.getItem('token');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

/**
 * Real Inference helper for Base64 frames
 * Zero false positives: if no components are detected or service is offline, detections is [].
 */
export async function detectFrameBase64(
  imageBase64: string,
  _contextItems?: Array<{ code?: string; name?: string; quantity?: number }>
): Promise<VisionDetectResponse> {
  const base = getVisionServiceUrl();
  const urlsToTry = [
    `${base}/api/v1/vision/detect`,
    base.includes('localhost') ? `${base.replace('localhost', '127.0.0.1')}/api/v1/vision/detect` : null,
    base !== CLOUD_VISION_FALLBACK_URL && typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? `${CLOUD_VISION_FALLBACK_URL}/api/v1/vision/detect`
      : null,
  ].filter(Boolean) as string[];

  let lastError = 'Không thể kết nối Vision Service (Offline)';

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ image: imageBase64 }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          frameId: data.frameId || `frame-${Date.now()}`,
          timestamp: data.timestamp || Date.now(),
          modelVersion: data.modelVersion || 'yolo11n-acm-85',
          modelHash: data.modelHash,
          imageDimensions: data.imageDimensions,
          inferenceTimeMs: data.inferenceTimeMs,
          detectionsCount: Array.isArray(data.detections) ? data.detections.length : 0,
          detections: Array.isArray(data.detections) ? data.detections : [],
        };
      } else {
        const errJson = await res.json().catch(() => null);
        lastError = errJson?.error || `Lỗi AI Vision (HTTP ${res.status})`;
      }
    } catch (err: any) {
      lastError = err?.message || 'Không thể kết nối Vision Service (Offline)';
    }
  }

  return {
    success: false,
    error: lastError,
    detectionsCount: 0,
    detections: [],
  };
}

/**
 * Real Inference helper for File uploads
 */
export async function detectFrameFile(
  file: File | Blob,
  _contextItems?: Array<{ code?: string; name?: string; quantity?: number }>
): Promise<VisionDetectResponse> {
  const base = getVisionServiceUrl();
  const urlsToTry = [
    `${base}/api/v1/vision/detect`,
    base.includes('localhost') ? `${base.replace('localhost', '127.0.0.1')}/api/v1/vision/detect` : null,
    base !== CLOUD_VISION_FALLBACK_URL && typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? `${CLOUD_VISION_FALLBACK_URL}/api/v1/vision/detect`
      : null,
  ].filter(Boolean) as string[];

  let lastError = 'Không thể kết nối Vision Service (Offline)';

  for (const url of urlsToTry) {
    try {
      const formData = new FormData();
      formData.append('file', file, 'frame.jpg');

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          frameId: data.frameId || `frame-${Date.now()}`,
          timestamp: data.timestamp || Date.now(),
          modelVersion: data.modelVersion || 'yolo11n-acm-85',
          modelHash: data.modelHash,
          imageDimensions: data.imageDimensions,
          inferenceTimeMs: data.inferenceTimeMs,
          detectionsCount: Array.isArray(data.detections) ? data.detections.length : 0,
          detections: Array.isArray(data.detections) ? data.detections : [],
        };
      } else {
        const errJson = await res.json().catch(() => null);
        lastError = errJson?.error || `Lỗi AI Vision (HTTP ${res.status})`;
      }
    } catch (err: any) {
      lastError = err?.message || 'Không thể kết nối Vision Service (Offline)';
    }
  }

  return {
    success: false,
    error: lastError,
    detectionsCount: 0,
    detections: [],
  };
}

/**
 * Retained for backwards compatibility: returns empty detections by default
 */
export function runClientSideYoloInference(
  _targetItems?: Array<{ code?: string; name?: string; quantity?: number }>
): VisionDetectResponse {
  return {
    success: true,
    frameId: `frame-${Date.now()}`,
    timestamp: Date.now(),
    modelVersion: 'yolo11n-acm-85',
    modelHash: 'c9b1f5d528a2f75ce3766f06fe6b502ecd3e04f1095c8932cc0ba9b00b7448d3',
    imageDimensions: { width: 640, height: 480 },
    inferenceTimeMs: 15,
    detectionsCount: 0,
    detections: [],
  };
}
