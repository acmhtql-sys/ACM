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
- Checkpoint: `best.pt` (Ultralytics YOLO11n, 85 classes).
- SHA256: `c9b1f5d528a2f75ce3766f06fe6b502ecd3e04f1095c8932cc0ba9b00b7448d3`.
- License: AGPL-3.0.

## Endpoints
- `GET /health`: Healthcheck, model version, SHA256 hash.
- `GET /api/v1/vision/classes`: Full 85 classes list and catalog item code mapping.
- `POST /api/v1/vision/detect`: Accept multipart/form-data or application/json (base64) image, returns bounding boxes, labels, confidence, and candidate item suggestions.
