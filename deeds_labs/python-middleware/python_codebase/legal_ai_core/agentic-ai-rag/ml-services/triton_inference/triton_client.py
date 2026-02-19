# Minimal Triton HTTP client wrapper (placeholder)
import numpy as np
import tritonclient.http as httpclient

client = httpclient.InferenceServerClient(url="localhost:8000")

def query_triton(prompt: str):
    inputs = httpclient.InferInput("input_ids", [1, len(prompt.split())], "INT32")
    inputs.set_data_from_numpy(np.array([prompt], dtype=np.int32))
    result = client.infer(model_name="gemma3_trt", inputs=[inputs])
    return result.as_numpy("output_ids")
