"""
Minimal Triton client example showing how to call a model and parse results.
Requires: tritonclient[http], numpy
"""
import numpy as np
import tritonclient.http as httpclient


def run_example(prompt: str):
    client = httpclient.InferenceServerClient(url="localhost:8000")
    # This is illustrative: you must adapt inputs/shape/names to your Triton model
    inputs = httpclient.InferInput('INPUT_IDS', [1, len(prompt.split())], 'INT32')
    # naive tokenization (placeholder)
    tokens = np.array([1] * len(prompt.split()), dtype=np.int32)
    inputs.set_data_from_numpy(tokens.reshape(1, -1))
    result = client.infer(model_name='gemma3_trt', inputs=[inputs])
    # parse an output named OUTPUT_IDS (example)
    try:
        out = result.as_numpy('OUTPUT_IDS')
        return out
    except Exception:
        return result.get_response()

if __name__ == '__main__':
    print(run_example('Hello Triton'))
