"""
ACM MVP – AI Camera-Assisted Component Return Inference Service
Port: 5055 (default)
Model: YOLOv8s `best` (86 classes, accelerated via ONNX Runtime CPU with PyTorch fallback)
Security:
- No database credentials / No database mutations
- Strict payload size limit (< 10MB)
- Concurrency limit (max 1 active inference per session)
- No image storage or sensitive logging
"""

import ast
import asyncio
import base64
import hashlib
import io
import os
import tempfile
import time
import uuid
from typing import Optional, Dict, Any, List, Tuple

# Disable automatic online pip installs and redirect Ultralytics config if fallback used
os.environ["YOLO_AUTO_INSTALL"] = "0"
os.environ["ULTRALYTICS_AUTOINSTALL"] = "0"
os.environ["YOLO_VERBOSE"] = "False"
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(tempfile.gettempdir(), "ultralytics_acm"))

import numpy as np
from PIL import Image
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

try:
    import onnxruntime as ort
except ImportError:
    ort = None  # type: ignore

# Configuration
PORT = int(os.environ.get("PORT", os.environ.get("VISION_SERVICE_PORT", "5055")))
HOST = os.environ.get("VISION_SERVICE_HOST", "0.0.0.0")
MAX_PAYLOAD_BYTES = 10 * 1024 * 1024  # 10MB
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.35"))
NMS_IOU_THRESHOLD = float(os.environ.get("NMS_IOU_THRESHOLD", "0.70"))
INFERENCE_IMGSZ = int(os.environ.get("INFERENCE_IMGSZ", "960"))
MAX_INFERENCE_IMAGE_DIM = int(os.environ.get("MAX_INFERENCE_IMAGE_DIM", "1280"))
INFERENCE_TIMEOUT_SEC = float(os.environ.get("INFERENCE_TIMEOUT_SEC", "45.0"))
ORT_INTRA_THREADS = int(os.environ.get("ORT_INTRA_THREADS", "2"))
MODEL_VERSION_TAG = "yolov8s-acm-86-best"

# Model Path Resolution
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))


def resolve_model_path() -> str:
    env_path = os.environ.get("MODEL_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    # Prefer ONNX Runtime checkpoint (`best.onnx` exported directly from 86-class `best.pt`)
    if ort is not None:
        script_onnx = os.path.join(SCRIPT_DIR, "best.onnx")
        if os.path.exists(script_onnx):
            return script_onnx
        repo_onnx = os.path.join(REPO_ROOT, "best.onnx")
        if os.path.exists(repo_onnx):
            return repo_onnx
    script_pt = os.path.join(SCRIPT_DIR, "best.pt")
    if os.path.exists(script_pt):
        return script_pt
    repo_pt = os.path.join(REPO_ROOT, "best.pt")
    if os.path.exists(repo_pt):
        return repo_pt
    return os.path.join(SCRIPT_DIR, "best.onnx")


MODEL_PATH = resolve_model_path()

# Global Inference Lock (enforce max 1 concurrent inference)
inference_lock = asyncio.Lock()

# Model and Metadata Storage
ort_session: Optional[Any] = None
ort_input_name: str = "images"
pt_model: Optional[Any] = None
engine_backend: str = "uninitialized"
model_sha256: str = "unknown"
classes_map: Dict[int, str] = {}

# Default 86 classes embedded in `best` checkpoint (fallback if ONNX metadata absent)
DEFAULT_86_CLASSES: Dict[int, str] = {
    0: "Large_curved_panel -White-",
    1: "Single_joint_part -Yellow-",
    2: "11-hole_stick",
    3: "13-hole_stick",
    4: "15-hole_stick",
    5: "1x2_Dual_joint",
    6: "1x3_Dual_joint",
    7: "2x2_Dual_joint",
    8: "2x3_Dual_right_angle_joint",
    9: "2x4_Right_angle_joint",
    10: "3-hole_stick",
    11: "3x3_Joint_brick",
    12: "3x3_Mat",
    13: "3x5_Curved_part_-yellow-",
    14: "3x5_Curved_part_blue",
    15: "3x7_Curved_stick",
    16: "3x7_Dual_curved_stick-blue-",
    17: "3x7_dual_curved stick -Gray-",
    18: "45- servo_clip -L-",
    19: "45- servo_clip -R-",
    20: "4x4_Curved_stick_-blue-",
    21: "4x6_curved_stick -Gray",
    22: "4x6_curved_stick-Blue-",
    23: "5-hole_stick",
    24: "5x5_Joint_brick",
    25: "5x5_Rubber_mat",
    26: "7-hole_stick -White-",
    27: "7-hole_stick-blue-",
    28: "9-hole_stick-blue-",
    29: "Base_brick",
    30: "Baseboard",
    31: "Blue_short_plug",
    32: "Bluetooth_speaker",
    33: "Bushing",
    34: "Curved_slice",
    35: "Driven_connector_-wheel-",
    36: "Dual-decked_joint_brick_blue",
    37: "Dual-decked_joint_brick_yellow",
    38: "Dual_joint_part -Short-",
    39: "Dual_joint_part_-Long-",
    40: "Dual_servo_clip",
    41: "Flat_head_shaft",
    42: "Green_short_plug",
    43: "I-shaped_brick",
    44: "IR_sensor",
    45: "Joint_brick",
    46: "LED_lamp",
    47: "Large_blade_L",
    48: "Large_blade_R",
    49: "Light_sensor",
    50: "Long_blade -L-",
    51: "Long_blade -R-",
    52: "Long_finger",
    53: "Main_1",
    54: "Main_2",
    55: "Motor",
    56: "Poly-directinal_wheel",
    57: "Poly_directional_wheel",
    58: "Red_plug",
    59: "Round_joint_brick",
    60: "Servo",
    61: "Servo_wire -Blue-",
    62: "Servo_wire_-Short-",
    63: "Servo_wire_Gray",
    64: "Short_finger",
    65: "Single_joint_part_blue",
    66: "Small_blade_L",
    67: "Small_blade_R",
    68: "Small_curved_panel",
    69: "Sound_sensor",
    70: "Square_frame",
    71: "Square_panel -Gray-",
    72: "Square_panel -White-",
    73: "Square_sevro_clip",
    74: "Switch_main_1",
    75: "Switch_main_2",
    76: "Switch_wire_main_1",
    77: "Switch_wire_main_2",
    78: "Temp_hum_sensor",
    79: "Touch_sensor",
    80: "Turning_brick",
    81: "Two_hole_slice_L",
    82: "Two_hole_slice_R",
    83: "Ultrasonic_sensor",
    84: "Wheel_hub_Tire",
    85: "Yellow_long_plug",
}

# Mappings from detected classes to ACM catalog item codes
# Invariant: Maps all 86 detected `best` classes to ACM catalog item codes and UBTECH kits.
CLASS_TO_ITEM_MAP: Dict[str, str] = {
    "Large_curved_panel -White-": "PNL-LRG-CRV-WHT",
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
    # Structural, Sticks & Joint Bricks (All 86 trained classes)
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

# Alternate SKU codes used across UBTECH kits and ACM inventory
CLASS_TO_ALIAS_CODES: Dict[str, List[str]] = {
    "Large_curved_panel -White-": ["PNL-LRG-CRV-WHT", "PNL-LRG-WHT", "PNL-CRV-WHT"],
    "LED_lamp": ["LED-5MM-RGB", "ACT-LED", "LED-RGB"],
    "Turning_brick": ["BRK-TURN", "WHL-TURN-BRICK"],
    "Joint_brick": ["BRK-JNT", "JNT-BRICK-STD"],
    "3x3_Joint_brick": ["BRK-3X3-JNT", "JNT-3X3-BRICK"],
    "5x5_Joint_brick": ["BRK-5X5-JNT", "JNT-5X5-BRICK"],
    "Round_joint_brick": ["BRK-RND-JNT", "JNT-RND-BRICK"],
    "Dual-decked_joint_brick_blue": ["BRK-DD-BLU", "JNT-DD-BRICK-BLU"],
    "Dual-decked_joint_brick_yellow": ["BRK-DD-YEL", "JNT-DD-BRICK-YEL"],
    "2x2_Dual_joint": ["JNT-2X2", "JNT-2X2-DUAL"],
    "1x2_Dual_joint": ["JNT-1X2", "JNT-1X2-DUAL"],
    "1x3_Dual_joint": ["JNT-1X3", "JNT-1X3-DUAL"],
    "3x7_Dual_curved_stick-blue-": ["STK-3X7-BLU", "STK-3X7-DC-BLU"],
    "3x7_dual_curved stick -Gray-": ["STK-3X7-GRY", "STK-3X7-DC-GRY"],
    "4x4_Curved_stick_-blue-": ["STK-4X4-BLU", "STK-4X4-CRV-BLU"],
    "3x5_Curved_part_blue": ["BEAM-CSX5-BLU", "PRT-3X5-CRV-BLU"],
    "3x5_Curved_part_-yellow-": ["BEAM-CSX5-YEL", "PRT-3X5-CRV-YEL"],
    "Servo_wire_Gray": ["CAB-SRV-GRY", "WIRE-SRV-GRY"],
    "Servo_wire -Blue-": ["CAB-SRV-BLU", "WIRE-SRV-BLU"],
    "Servo_wire_-Short-": ["CAB-SRV-SHT", "WIRE-SRV-SHT"],
    "Switch_wire_main_1": ["CAB-SW-M1", "WIRE-SW-M1"],
    "Switch_wire_main_2": ["CAB-SW-M2", "WIRE-SW-M2"],
    "Servo": ["SERVO-SG90", "ACT-SERVO", "SRV-01"],
    "Motor": ["MOT-01", "ACT-MOTOR"],
    "Bluetooth_speaker": ["SPK-BT-01", "ACT-SPK-BT"],
    "Ultrasonic_sensor": ["SR04-ULTRASONIC", "SEN-ULTRASONIC"],
    "Temp_hum_sensor": ["DHT22-AM2302", "SEN-TEMP-HUM"],
}


def compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def load_model_if_needed():
    global ort_session, ort_input_name, pt_model, engine_backend, model_sha256, classes_map
    if ort_session is not None or pt_model is not None:
        return
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")

    model_sha256 = compute_sha256(MODEL_PATH)
    print(f"Loading Vision AI model from: {MODEL_PATH}")
    print(f"Model SHA256: {model_sha256}")

    if MODEL_PATH.lower().endswith(".onnx"):
        if ort is None:
            raise RuntimeError("onnxruntime is required to load .onnx models")
        so = ort.SessionOptions()
        so.intra_op_num_threads = ORT_INTRA_THREADS
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        ort_session = ort.InferenceSession(
            MODEL_PATH,
            sess_options=so,
            providers=["CPUExecutionProvider"],
        )
        ort_input_name = ort_session.get_inputs()[0].name
        meta = ort_session.get_modelmeta().custom_metadata_map or {}
        if "names" in meta:
            parsed = ast.literal_eval(meta["names"])
            classes_map = {int(k): str(v) for k, v in parsed.items()}
        else:
            classes_map = dict(DEFAULT_86_CLASSES)
        engine_backend = "onnxruntime-cpu"
    else:
        from ultralytics import YOLO

        pt_model = YOLO(MODEL_PATH)
        classes_map = {int(k): str(v) for k, v in pt_model.names.items()}
        engine_backend = "ultralytics-pytorch-cpu"

    print(
        f"Model loaded via {engine_backend} with {len(classes_map)} classes "
        f"(imgsz={INFERENCE_IMGSZ}, conf={CONFIDENCE_THRESHOLD})."
    )


async def health_endpoint(request: Request) -> JSONResponse:
    load_model_if_needed()
    return JSONResponse({
        "status": "ok",
        "service": "acm-camera-return-vision-inference",
        "version": "1.2.0-best-onnx",
        "modelVersion": MODEL_VERSION_TAG,
        "modelHash": model_sha256,
        "classesCount": len(classes_map),
        "device": engine_backend,
    })


async def list_classes_endpoint(request: Request) -> JSONResponse:
    load_model_if_needed()
    return JSONResponse({
        "success": True,
        "total": len(classes_map),
        "classes": [{"classId": k, "className": v} for k, v in classes_map.items()],
        "mappedCatalogItems": CLASS_TO_ITEM_MAP,
        "aliasCatalogItems": CLASS_TO_ALIAS_CODES,
    })


def _build_detection_dict(
    cls_id: int,
    conf: float,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
) -> Dict[str, Any]:
    cls_name = classes_map.get(cls_id, f"class_{cls_id}")
    suggested_item = CLASS_TO_ITEM_MAP.get(cls_name, None)
    candidate_codes = CLASS_TO_ALIAS_CODES.get(
        cls_name,
        [suggested_item] if suggested_item else [],
    )
    return {
        "classId": cls_id,
        "className": cls_name,
        "confidence": round(conf, 4),
        "boundingBox": {
            "x1": round(x1, 2),
            "y1": round(y1, 2),
            "x2": round(x2, 2),
            "y2": round(y2, 2),
        },
        "suggestedItemCode": suggested_item,
        "candidateItemCodes": candidate_codes,
    }


def _run_ort_inference(img: Image.Image, scale_x: float, scale_y: float) -> List[Dict[str, Any]]:
    assert ort_session is not None
    w, h = img.width, img.height
    r = min(float(INFERENCE_IMGSZ) / h, float(INFERENCE_IMGSZ) / w)
    new_w = max(1, int(round(w * r)))
    new_h = max(1, int(round(h * r)))

    dw = ((INFERENCE_IMGSZ - new_w) % 32) / 2.0
    dh = ((INFERENCE_IMGSZ - new_h) % 32) / 2.0
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))

    resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
    padded = Image.new("RGB", (new_w + left + right, new_h + top + bottom), (114, 114, 114))
    padded.paste(resized, (left, top))

    arr = np.asarray(padded, dtype=np.float32) / 255.0
    tensor = np.ascontiguousarray(arr.transpose(2, 0, 1)[None, ...])

    raw_out = ort_session.run(None, {ort_input_name: tensor})[0]
    preds = raw_out[0].T  # (N, 4 + num_classes)

    scores_all = preds[:, 4:]
    cls_ids = np.argmax(scores_all, axis=1)
    confs = scores_all[np.arange(scores_all.shape[0]), cls_ids]

    mask = confs >= CONFIDENCE_THRESHOLD
    if not np.any(mask):
        return []

    boxes = preds[mask, :4]
    confs = confs[mask]
    cls_ids = cls_ids[mask]

    x1 = boxes[:, 0] - boxes[:, 2] / 2.0
    y1 = boxes[:, 1] - boxes[:, 3] / 2.0
    x2 = boxes[:, 0] + boxes[:, 2] / 2.0
    y2 = boxes[:, 1] + boxes[:, 3] / 2.0

    # Per-class batched NMS
    offset = cls_ids.astype(np.float32) * 4096.0
    nx1, ny1, nx2, ny2 = x1 + offset, y1 + offset, x2 + offset, y2 + offset
    areas = np.maximum(0.0, nx2 - nx1) * np.maximum(0.0, ny2 - ny1)
    order = confs.argsort()[::-1]

    keep: List[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        xx1 = np.maximum(nx1[i], nx1[order[1:]])
        yy1 = np.maximum(ny1[i], ny1[order[1:]])
        xx2 = np.minimum(nx2[i], nx2[order[1:]])
        yy2 = np.minimum(ny2[i], ny2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        order = order[1:][iou <= NMS_IOU_THRESHOLD]

    detections: List[Dict[str, Any]] = []
    for idx in keep:
        bx1 = float(np.clip((x1[idx] - left) / r, 0.0, float(w))) * scale_x
        by1 = float(np.clip((y1[idx] - top) / r, 0.0, float(h))) * scale_y
        bx2 = float(np.clip((x2[idx] - left) / r, 0.0, float(w))) * scale_x
        by2 = float(np.clip((y2[idx] - top) / r, 0.0, float(h))) * scale_y
        detections.append(
            _build_detection_dict(int(cls_ids[idx]), float(confs[idx]), bx1, by1, bx2, by2)
        )
    return detections


def run_yolo_inference(img: Image.Image, scale_x: float = 1.0, scale_y: float = 1.0) -> List[Dict[str, Any]]:
    if ort_session is not None:
        return _run_ort_inference(img, scale_x, scale_y)

    assert pt_model is not None
    results = pt_model.predict(img, imgsz=INFERENCE_IMGSZ, conf=CONFIDENCE_THRESHOLD, verbose=False)
    detections: List[Dict[str, Any]] = []
    if results and len(results) > 0 and results[0].boxes is not None:
        for box in results[0].boxes:
            xyxy = box.xyxy[0].tolist()
            detections.append(
                _build_detection_dict(
                    int(box.cls[0].item()),
                    float(box.conf[0].item()),
                    xyxy[0] * scale_x,
                    xyxy[1] * scale_y,
                    xyxy[2] * scale_x,
                    xyxy[3] * scale_y,
                )
            )
    return detections


async def detect_endpoint(request: Request) -> JSONResponse:
    load_model_if_needed()

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_PAYLOAD_BYTES:
        return JSONResponse(
            {"success": False, "error": f"Payload size exceeds 10MB limit ({content_length} bytes)"},
            status_code=413,
        )

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
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]
                img_bytes = base64.b64decode(b64_data)
            else:
                img_bytes = await request.body()
                if not img_bytes:
                    return JSONResponse(
                        {"success": False, "error": "Unsupported media type or empty payload. Use multipart/form-data or application/json."},
                        status_code=400,
                    )

            if len(img_bytes) > MAX_PAYLOAD_BYTES:
                return JSONResponse(
                    {"success": False, "error": f"Payload size exceeds 10MB limit ({len(img_bytes)} bytes)"},
                    status_code=413,
                )

            try:
                img = Image.open(io.BytesIO(img_bytes))
                img.load()
                img = img.convert("RGB")
                orig_w, orig_h = img.width, img.height
                scale_x, scale_y = 1.0, 1.0
                max_dim = max(orig_w, orig_h)
                if max_dim > MAX_INFERENCE_IMAGE_DIM:
                    scale = float(MAX_INFERENCE_IMAGE_DIM) / max_dim
                    new_w = max(1, int(round(orig_w * scale)))
                    new_h = max(1, int(round(orig_h * scale)))
                    img = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
                    scale_x = orig_w / float(new_w)
                    scale_y = orig_h / float(new_h)
            except Exception as e:
                return JSONResponse(
                    {"success": False, "error": f"Invalid or malformed image data: {str(e)}"},
                    status_code=400,
                )

            frame_id = f"frame_{uuid.uuid4().hex[:12]}"
            t0 = time.perf_counter()

            loop = asyncio.get_running_loop()
            detections = await asyncio.wait_for(
                loop.run_in_executor(None, run_yolo_inference, img, scale_x, scale_y),
                timeout=INFERENCE_TIMEOUT_SEC,
            )
            t1 = time.perf_counter()
            inference_ms = round((t1 - t0) * 1000, 2)

            return JSONResponse({
                "success": True,
                "frameId": frame_id,
                "timestamp": time.time(),
                "modelVersion": MODEL_VERSION_TAG,
                "modelHash": model_sha256,
                "imageDimensions": {"width": orig_w, "height": orig_h},
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

    load_model_if_needed()
    print(f"Starting ACM Vision Service on http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
