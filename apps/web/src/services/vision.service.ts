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
  candidateItemCodes?: string[];
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

/**
 * Downscale and compress image (File, Blob, or base64 data URL) to max 1024px and JPEG quality 0.85.
 * This reduces upload size from 5-10MB to ~80-150KB, speeding up AI inference 5-10x.
 */
export async function compressImageForVision(
  source: File | Blob | string,
  maxDimension = 1024,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(typeof source === 'string' ? source : '');
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(typeof source === 'string' ? source : '');
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      } catch {
        resolve(typeof source === 'string' ? source : '');
      }
    };

    img.onerror = () => {
      if (typeof source === 'string') {
        resolve(source);
      } else {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(source);
      }
    };

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = (reader.result as string) || '';
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(source);
    }
  });
}

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
      const isCloud = url.includes('render.com') || (typeof window !== 'undefined' && window.location.protocol === 'https:');
      const timeoutMs = isCloud ? 30000 : 4000;
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
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
      const isCloud = url.includes('render.com') || (typeof window !== 'undefined' && window.location.protocol === 'https:');
      const timeoutMs = isCloud ? 45000 : 15000;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ image: imageBase64 }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          frameId: data.frameId || `frame-${Date.now()}`,
          timestamp: data.timestamp || Date.now(),
          modelVersion: data.modelVersion || 'yolov8s-acm-86-best',
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
      const isCloud = url.includes('render.com') || (typeof window !== 'undefined' && window.location.protocol === 'https:');
      const timeoutMs = isCloud ? 45000 : 15000;
      const formData = new FormData();
      formData.append('file', file, 'frame.jpg');

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          frameId: data.frameId || `frame-${Date.now()}`,
          timestamp: data.timestamp || Date.now(),
          modelVersion: data.modelVersion || 'yolov8s-acm-86-best',
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
    modelVersion: 'yolov8s-acm-86-best',
    modelHash: '2abe7ffa86c021095a6ba0bb8174476ad1eaa7d610cb46c931520e46a3b15288',
    imageDimensions: { width: 960, height: 720 },
    inferenceTimeMs: 15,
    detectionsCount: 0,
    detections: [],
  };
}
