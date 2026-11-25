# ACM AI Camera-Assisted Vision Service

Lightweight, isolated inference service powering real-time component return identification.

## Architectural & Security Invariants
1. **Zero Database Credentials**: This service runs completely decoupled from PostgreSQL and Prisma.
2. **Read-Only Inference**: Operates exclusively in inference mode. Zero data mutations.
3. **Payload & Concurrency Protection**:
   - Enforces strict 5MB upload limit (HTTP 413 on violation).
   - In-flight request concurrency lock: max 1 active inference frame per session (HTTP 429 on overload).
   - Automatic timeout protection at 5.0 seconds (HTTP 504).
   - Strict image validation (HTTP 400 on malformed payloads).
4. **Zero Persistent Storage**: No captured camera frames or user credentials are stored or persisted to disk/DB.

## Model
- Checkpoint: `best.pt` (Ultralytics YOLOv8s `best`, 86 classes, trained at `imgsz=960`).
- SHA256: `2abe7ffa86c021095a6ba0bb8174476ad1eaa7d610cb46c931520e46a3b15288`.
- License: AGPL-3.0.

## Endpoints
- `GET /health`: Healthcheck, model version, SHA256 hash.
- `GET /api/v1/vision/classes`: Full 86 classes list and catalog item code mapping.
- `POST /api/v1/vision/detect`: Accept multipart/form-data or application/json (base64) image, returns bounding boxes, labels, confidence, and candidate item suggestions.
