"""YOLOX-Nano (COCO, 416 input) detector on ONNX Runtime CPU. Emits observation records.

Input: an RGB uint8 array (H, W, 3) or an image path. Output boxes are in ORIGINAL pixel
coordinates (the letterbox is inverted). Records follow the TypeScript ObjectObservation contract
(src/lib/splat/object-observation-v1.ts): image-frame coordinates, status 'observed', no world position.

Weights are evaluation-only until the weight grant is explicit (see the model card).
"""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).resolve().parent.parent / "sveltekit-frontend" / "models" / "yolox_nano.onnx"
MODEL_SHA256 = "c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d"
INPUT_SIZE = 416
STRIDES = (8, 16, 32)
COCO_NAMES = (
    "person bicycle car motorcycle airplane bus train truck boat traffic_light fire_hydrant stop_sign "
    "parking_meter bench bird cat dog horse sheep cow elephant bear zebra giraffe backpack umbrella "
    "handbag tie suitcase frisbee skis snowboard sports_ball kite baseball_bat baseball_glove skateboard "
    "surfboard tennis_racket bottle wine_glass cup fork knife spoon bowl banana apple sandwich orange "
    "broccoli carrot hot_dog pizza donut cake chair couch potted_plant bed dining_table toilet tv laptop "
    "mouse remote keyboard cell_phone microwave oven toaster sink refrigerator book clock vase scissors "
    "teddy_bear hair_drier toothbrush"
).split()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def letterbox(rgb: np.ndarray, size: int = INPUT_SIZE) -> tuple[np.ndarray, float]:
    """Resize keeping aspect ratio, pad bottom-right with 114. Returns the CHW float32 tensor and scale."""
    h, w = rgb.shape[:2]
    scale = min(size / w, size / h)
    nh, nw = int(round(h * scale)), int(round(w * scale))
    # Nearest-neighbour resize without a dependency on PIL/OpenCV.
    ys = np.clip((np.arange(nh) / scale).astype(int), 0, h - 1)
    xs = np.clip((np.arange(nw) / scale).astype(int), 0, w - 1)
    resized = rgb[ys][:, xs]
    canvas = np.full((size, size, 3), 114, np.uint8)
    canvas[:nh, :nw] = resized
    return canvas.transpose(2, 0, 1)[None].astype(np.float32), scale


def decode(raw: np.ndarray, scale: float) -> np.ndarray:
    """Grid decode of YOLOX output (N, 85) -> rows [x0, y0, x1, y1, score, class] in original pixels."""
    grids, strides = [], []
    for s in STRIDES:
        g = INPUT_SIZE // s
        yv, xv = np.meshgrid(np.arange(g), np.arange(g), indexing="ij")
        grids.append(np.stack([xv, yv], -1).reshape(-1, 2))
        strides.append(np.full(g * g, s))
    grid = np.concatenate(grids).astype(np.float32)
    stride = np.concatenate(strides).astype(np.float32)
    if grid.shape[0] != raw.shape[0]:
        raise ValueError("YOLOX_OUTPUT_ANCHOR_MISMATCH")
    cx = (raw[:, 0] + grid[:, 0]) * stride
    cy = (raw[:, 1] + grid[:, 1]) * stride
    w = np.exp(raw[:, 2]) * stride
    h = np.exp(raw[:, 3]) * stride
    scores = raw[:, 4:5] * raw[:, 5:]
    cls = scores.argmax(1)
    conf = scores.max(1)
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 1) / scale
    return np.concatenate([boxes, conf[:, None], cls[:, None].astype(np.float32)], 1)


def nms(dets: np.ndarray, iou_thr: float = 0.45) -> np.ndarray:
    if dets.size == 0:
        return dets
    order = dets[:, 4].argsort()[::-1]
    keep = []
    while order.size:
        i = order[0]
        keep.append(i)
        rest = order[1:]
        xx0 = np.maximum(dets[i, 0], dets[rest, 0])
        yy0 = np.maximum(dets[i, 1], dets[rest, 1])
        xx1 = np.minimum(dets[i, 2], dets[rest, 2])
        yy1 = np.minimum(dets[i, 3], dets[rest, 3])
        inter = np.clip(xx1 - xx0, 0, None) * np.clip(yy1 - yy0, 0, None)
        area_i = (dets[i, 2] - dets[i, 0]) * (dets[i, 3] - dets[i, 1])
        area_r = (dets[rest, 2] - dets[rest, 0]) * (dets[rest, 3] - dets[rest, 1])
        iou = inter / np.maximum(area_i + area_r - inter, 1e-9)
        order = rest[iou <= iou_thr]
    return dets[keep]


class YoloxNano:
    def __init__(self, model_path: Path = MODEL_PATH, verify_hash: bool = True):
        import onnxruntime as ort

        if verify_hash and sha256_file(model_path) != "sha256:" + MODEL_SHA256:
            raise RuntimeError("YOLOX_MODEL_HASH_MISMATCH")
        self.model_path = model_path
        self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name

    def detect(self, rgb: np.ndarray, conf_thr: float = 0.25, iou_thr: float = 0.45, max_det: int = 100) -> list[dict]:
        if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.dtype != np.uint8:
            raise ValueError("RGB_U8_HWC_REQUIRED")
        tensor, scale = letterbox(rgb)
        raw = self.session.run(None, {self.input_name: tensor})[0][0]
        dets = decode(raw, scale)
        dets = dets[dets[:, 4] >= conf_thr]
        dets = nms(dets, iou_thr)[:max_det]
        h, w = rgb.shape[:2]
        out = []
        for x0, y0, x1, y1, conf, cls in dets:
            x0, y0 = max(0.0, float(x0)), max(0.0, float(y0))
            x1, y1 = min(float(w), float(x1)), min(float(h), float(y1))
            if x1 <= x0 or y1 <= y0:
                continue
            out.append({
                "classLabel": COCO_NAMES[int(cls)],
                "detectionConfidence": round(float(conf), 4),
                "bboxXYXY": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
            })
        return out


def observation_records(
    detections: list[dict],
    *,
    evidence_id: str,
    source_sha256: str,
    frame_pts_ms: int,
    image_size: tuple[int, int],
) -> list[dict]:
    """Shape each detection as an ObjectObservation (image frame, observed, no world position)."""
    w, h = image_size
    return [
        {
            "observationId": str(uuid.uuid4()),
            "evidenceId": evidence_id,
            "sourceSha256": source_sha256,
            "framePtsMs": int(frame_pts_ms),
            "imageWidth": int(w),
            "imageHeight": int(h),
            "classLabel": d["classLabel"],
            "detectionConfidence": d["detectionConfidence"],
            "bboxXYXY": d["bboxXYXY"],
            "depthType": None,
            "coordinateFrame": "image",
            "status": "observed",
        }
        for d in detections
    ]
