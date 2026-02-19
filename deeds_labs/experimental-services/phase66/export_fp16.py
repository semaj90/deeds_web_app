import onnx
import onnxruntime as ort
from onnxconverter_common import float16

SRC = "/workspace/models/gemma/model.onnx"
DST = "/workspace/models/gemma/model_fp16.onnx"

print("🔄 Loading:", SRC)
model = onnx.load(SRC)

print("⚙️ Converting FP32 → FP16...")
fp16 = float16.convert_float_to_float16(model, keep_io_types=True)
onnx.save(fp16, DST)

print("🔍 Verifying...")
sess = ort.InferenceSession(DST, providers=["CPUExecutionProvider"])
print("✅ FP16 model verified:", DST)