"""
ACM MVP – AI Camera-Assisted Component Return Inference Service
Port: 5055 (default)
Model: Ultralytics YOLO11n (85 classes)
Security:
- No database credentials / No database mutations
- Strict payload size limit (< 5MB)
- Concurrency limit (max 1 active inference per session)
- No image storage or sensitive logging
"""

import asyncio
import base64
import hashlib
import io
import os
import sys
import time
import uuid
from typing import Optional, Dict, Any, List

# Disable automatic online pip installs by ultralytics
os.environ["YOLO_AUTO_INSTALL"] = "0"
os.environ["ULTRALYTICS_AUTOINSTALL"] = "0"
os.environ["YOLO_VERBOSE"] = "False"

from PIL import Image
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from ultralytics import YOLO

# Configuration
PORT = int(os.environ.get("PORT", os.environ.get("VISION_SERVICE_PORT", "5055")))
HOST = os.environ.get("VISION_SERVICE_HOST", "0.0.0.0")
MAX_PAYLOAD_BYTES = 5 * 1024 * 1024  # 5MB
CONFIDENCE_THRESHOLD = 0.45
INFERENCE_TIMEOUT_SEC = 5.0

# Model Path Resolution
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))

def resolve_model_path() -> str:
    env_path = os.environ.get("MODEL_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    repo_model = os.path.join(REPO_ROOT, "best.pt")
    if os.path.exists(repo_model):
        return repo_model
    script_model = os.path.join(SCRIPT_DIR, "best.pt")
    if os.path.exists(script_model):
        return script_model
    return repo_model

MODEL_PATH = resolve_model_path()

# Global Inference Lock (enforce max 1 concurrent inference)
inference_lock = asyncio.Lock()

# Model and Metadata Storage
model: Optional[YOLO] = None
model_sha256: str = "unknown"
classes_map: Dict[int, str] = {}

# Mappings from detected classes to ACM catalog item codes
# Invariant: Maps all 85 detected YOLO11 classes to ACM catalog item codes and UBTECH kits.
CLASS_TO_ITEM_MAP = {
    # Main controllers & Switches
    "Main_1": "MAIN-01",
    "Main_2": "MAIN-02",
    "Switch_main_1": "SW-MAIN-01",
    "Switch_main_2": "SW-MAIN-02",
    "Switch_wire_main_1": "CAB-SW-M1",
    "Switch_wire_main_2": "CAB-SW-M2",
    # Sensors & Actuators
    "IR_sensor": "SEN-IR",
    "Ultrasonic_sensor": "SR04-ULTRASONIC",
    "Temp_hum_sensor": "DHT22-AM2302",
    "Light_sensor": "SEN-LIGHT",
    "Sound_sensor": "SEN-SOUND",
    "Touch_sensor": "SEN-TOUCH",
    "LED_lamp": "LED-5MM-RGB",
    "Servo": "SERVO-SG90",
    "Motor": "MOT-01",
    "Bluetooth_speaker": "SPK-BT-01",
    # Cables & Connectors
    "Servo_wire -Blue-": "CAB-SRV-BLU",
    "Servo_wire_Gray": "CAB-SRV-GRY",
    "Servo_wire_-Short-": "CAB-SRV-SHT",
    # Structural, Sticks & Joint Bricks (All 85 trained classes)
    "Single_joint_part -Yellow-": "JNT-SGL-YEL",
    "11-hole_stick": "STK-11H",
    "13-hole_stick": "STK-13H",
    "15-hole_stick": "STK-15H",
    "1x2_Dual_joint": "JNT-1X2",
    "1x3_Dual_joint": "JNT-1X3",
    "2x2_Dual_joint": "JNT-2X2",
    "2x3_Dual_right_angle_joint": "JNT-2X3-RA",
    "2x4_Right_angle_joint": "JNT-2X4-RA",
    "3-hole_stick": "STK-3H",
    "3x3_Joint_brick": "BRK-3X3-JNT",
    "3x3_Mat": "MAT-3X3",
    "3x5_Curved_part_-yellow-": "BEAM-CSX5-YEL",
    "3x5_Curved_part_blue": "BEAM-CSX5-BLU",
    "3x7_Curved_stick": "STK-3X7-CRV",
    "3x7_Dual_curved_stick-blue-": "STK-3X7-BLU",
    "3x7_dual_curved stick -Gray-": "STK-3X7-GRY",
    "45- servo_clip -L-": "CLP-SRV-45L",
    "45- servo_clip -R-": "CLP-SRV-45R",
    "4x4_Curved_stick_-blue-": "STK-4X4-BLU",
    "4x6_curved_stick -Gray": "STK-4X6-GRY",
    "4x6_curved_stick-Blue-": "STK-4X6-BLU",
    "5-hole_stick": "STK-5H",
    "5x5_Joint_brick": "BRK-5X5-JNT",
    "5x5_Rubber_mat": "MAT-5X5",
    "7-hole_stick -White-": "STK-7H-WHT",
    "7-hole_stick-blue-": "STK-7H-BLU",
    "9-hole_stick-blue-": "STK-9H-BLU",
    "Base_brick": "BRK-BASE",
    "Baseboard": "KIT-BASE-01",
    "Blue_short_plug": "PLUG-BLU",
    "Bushing": "BSH-01",
    "Curved_slice": "SLC-CRV",
    "Driven_connector_-wheel-": "CON-WHL",
    "Dual-decked_joint_brick_blue": "BRK-DD-BLU",
    "Dual-decked_joint_brick_yellow": "BRK-DD-YEL",
    "Dual_joint_part -Short-": "JNT-DL-SHT",
    "Dual_joint_part_-Long-": "JNT-DL-LNG",
    "Dual_servo_clip": "CLP-SRV-DL",
    "Flat_head_shaft": "SFT-FLAT",
    "Green_short_plug": "PLUG-GRN",
    "I-shaped_brick": "BRK-ISHAPE",
    "Joint_brick": "BRK-JNT",
    "Large_blade_L": "BLD-LRG-L",
    "Large_blade_R": "BLD-LRG-R",
    "Long_blade -L-": "BLD-LNG-L",
    "Long_blade -R-": "BLD-LNG-R",
    "Long_finger": "FNG-LNG",
    "Poly-directinal_wheel": "WHEEL-OMNI",
    "Poly_directional_wheel": "WHEEL-OMNI",
    "Red_plug": "PLUG-RED",
    "Round_joint_brick": "BRK-RND-JNT",
    "Short_finger": "FNG-SHT",
    "Single_joint_part_blue": "JNT-SGL-BLU",
    "Small_blade_L": "BLD-SML-L",
    "Small_blade_R": "BLD-SML-R",
    "Small_curved_panel": "PNL-SML-CRV",
    "Square_frame": "FRAME-01",
    "Square_panel -Gray-": "PNL-SQR-GRY",
    "Square_panel -White-": "PNL-SQR-WHT",
    "Square_sevro_clip": "CLP-SRV-SQR",
    "Turning_brick": "BRK-TURN",
    "Two_hole_slice_L": "SLC-2H-L",
    "Two_hole_slice_R": "SLC-2H-R",
    "Wheel_hub_Tire": "WHEEL-TIRE",
    "Yellow_long_plug": "PLUG-YEL",
}


def compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def load_model_if_needed():
    global model, model_sha256, classes_map
    if model is not None:
        return
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")

    model_sha256 = compute_sha256(MODEL_PATH)
    print(f"Loading YOLO model from: {MODEL_PATH}")
    print(f"Model SHA256: {model_sha256}")
    model = YOLO(MODEL_PATH)
    classes_map = {int(k): str(v) for k, v in model.names.items()}
    print(f"Model loaded successfully with {len(classes_map)} classes.")


async def health_endpoint(request: Request) -> JSONResponse:
    load_model_if_needed()
    return JSONResponse({
        "status": "ok",
        "service": "acm-camera-return-vision-inference",
        "version": "1.0.0-mvp",
        "modelVersion": "yolo11n-acm-85",
        "modelHash": model_sha256,
        "classesCount": len(classes_map),
        "device": "cpu",
    })


async def list_classes_endpoint(request: Request) -> JSONResponse:
    load_model_if_needed()
    return JSONResponse({
        "success": True,
        "total": len(classes_map),
        "classes": [{"classId": k, "className": v} for k, v in classes_map.items()],
        "mappedCatalogItems": CLASS_TO_ITEM_MAP,
    })


def run_yolo_inference(img: Image.Image) -> List[Dict[str, Any]]:
    assert model is not None
    # Run YOLO inference on PIL Image
    results = model.predict(img, imgsz=640, conf=CONFIDENCE_THRESHOLD, verbose=False)
    detections: List[Dict[str, Any]] = []

    if results and len(results) > 0:
        res = results[0]
        boxes = res.boxes
        if boxes is not None:
            for box in boxes:
                xyxy = box.xyxy[0].tolist()
                conf = float(box.conf[0].item())
                cls_id = int(box.cls[0].item())
                cls_name = model.names.get(cls_id, f"class_{cls_id}")
                suggested_item = CLASS_TO_ITEM_MAP.get(cls_name, None)

                detections.append({
                    "classId": cls_id,
                    "className": cls_name,
                    "confidence": round(conf, 4),
                    "boundingBox": {
                        "x1": round(xyxy[0], 2),
                        "y1": round(xyxy[1], 2),
                        "x2": round(xyxy[2], 2),
                        "y2": round(xyxy[3], 2),
                    },
                    "suggestedItemCode": suggested_item,
                })
    return detections


async def detect_endpoint(request: Request) -> JSONResponse:
    load_model_if_needed()

    # Content length guard
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_PAYLOAD_BYTES:
        return JSONResponse(
            {"success": False, "error": f"Payload size exceeds 5MB limit ({content_length} bytes)"},
            status_code=413,
        )

    # Concurrency guard: max 1 active inference request
    if inference_lock.locked():
        return JSONResponse(
            {"success": False, "error": "Inference service busy (max 1 concurrent frame). Please retry shortly."},
            status_code=429,
        )

    async with inference_lock:
        content_type = request.headers.get("content-type", "")
        img_bytes: Optional[bytes] = None

        try:
            if "multipart/form-data" in content_type:
                form = await request.form()
                upload_file = form.get("file") or form.get("image")
                if not upload_file:
                    return JSONResponse(
                        {"success": False, "error": "Missing 'file' or 'image' field in multipart form."},
                        status_code=400,
                    )
                img_bytes = await upload_file.read()
            elif "application/json" in content_type:
                body = await request.json()
                b64_data = body.get("image") or body.get("frame")
                if not b64_data or not isinstance(b64_data, str):
                    return JSONResponse(
                        {"success": False, "error": "Missing or invalid 'image' base64 string in JSON body."},
                        status_code=400,
                    )
                # Strip data URL prefix if present
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]
                img_bytes = base64.b64decode(b64_data)
            else:
                # Raw binary fallback
                img_bytes = await request.body()
                if not img_bytes:
                    return JSONResponse(
                        {"success": False, "error": "Unsupported media type or empty payload. Use multipart/form-data or application/json."},
                        status_code=400,
                    )

            if len(img_bytes) > MAX_PAYLOAD_BYTES:
                return JSONResponse(
                    {"success": False, "error": f"Payload size exceeds 5MB limit ({len(img_bytes)} bytes)"},
                    status_code=413,
                )

            # Parse PIL image
            try:
                img = Image.open(io.BytesIO(img_bytes))
                img.load()
                img = img.convert("RGB")
            except Exception as e:
                return JSONResponse(
                    {"success": False, "error": f"Invalid or malformed image data: {str(e)}"},
                    status_code=400,
                )

            frame_id = f"frame_{uuid.uuid4().hex[:12]}"
            t0 = time.perf_counter()

            # Execute inference in executor to avoid blocking event loop, with timeout
            loop = asyncio.get_running_loop()
            detections = await asyncio.wait_for(
                loop.run_in_executor(None, run_yolo_inference, img),
                timeout=INFERENCE_TIMEOUT_SEC,
            )
            t1 = time.perf_counter()
            inference_ms = round((t1 - t0) * 1000, 2)

            return JSONResponse({
                "success": True,
                "frameId": frame_id,
                "timestamp": time.time(),
                "modelVersion": "yolo11n-acm-85",
                "modelHash": model_sha256,
                "imageDimensions": {"width": img.width, "height": img.height},
                "inferenceTimeMs": inference_ms,
                "detectionsCount": len(detections),
                "detections": detections,
            })

        except asyncio.TimeoutError:
            return JSONResponse(
                {"success": False, "error": f"Inference timed out after {INFERENCE_TIMEOUT_SEC}s"},
                status_code=504,
            )
        except Exception as e:
            return JSONResponse(
                {"success": False, "error": f"Inference failed: {str(e)}"},
                status_code=500,
            )


routes = [
    Route("/health", health_endpoint, methods=["GET"]),
    Route("/api/v1/vision/classes", list_classes_endpoint, methods=["GET"]),
    Route("/api/v1/vision/detect", detect_endpoint, methods=["POST"]),
]

class PrivateNetworkAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            response = await call_next(request)
            response.headers["Access-Control-Allow-Private-Network"] = "true"
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            return response
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


middleware = [
    Middleware(PrivateNetworkAccessMiddleware),
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    ),
]

app = Starlette(debug=False, routes=routes, middleware=middleware)

if __name__ == "__main__":
    import uvicorn
    print(f"Starting ACM Vision Service on http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
