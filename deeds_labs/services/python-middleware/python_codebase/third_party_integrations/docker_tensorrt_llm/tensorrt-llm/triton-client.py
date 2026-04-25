#!/usr/bin/env python3
"""
Minimal Triton HTTP client for testing a TensorRT engine served by Triton.
Usage:
  python triton-client.py --model legal_gemma --seq-len 16 --batch 1

This sends a random INT32 input_ids tensor and prints returned logits shape and latency.
"""
import argparse
import time
import requests
import json
import random


def infer_http(model_name: str, server_url: str, input_ids):
    url = f"{server_url}/v2/models/{model_name}/infer"
    payload = {
        "inputs": [
            {
                "name": "input_ids",
                "datatype": "INT32",
                "shape": [len(input_ids), len(input_ids[0])],
                "data": input_ids,
            }
        ]
    }
    start = time.time()
    r = requests.post(url, json=payload, timeout=30)
    latency = (time.time() - start) * 1000.0
    r.raise_for_status()
    return r.json(), latency


def random_input(batch: int, seq_len: int, vocab_size: int = 20000):
    return [[random.randint(0, vocab_size - 1) for _ in range(seq_len)] for _ in range(batch)]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model', required=True)
    p.add_argument('--server', default='http://localhost:8000')
    p.add_argument('--batch', type=int, default=1)
    p.add_argument('--seq-len', type=int, default=32)
    p.add_argument('--vocab', type=int, default=20000)
    p.add_argument('--runs', type=int, default=5)
    args = p.parse_args()

    samples = [random_input(args.batch, args.seq_len, args.vocab) for _ in range(args.runs)]
    latencies = []
    for i, inp in enumerate(samples):
        print(f"Run {i+1}/{args.runs}: sending batch={args.batch} seq_len={args.seq_len}")
        try:
            resp, lat = infer_http(args.model, args.server, inp)
        except Exception as e:
            print("Inference request failed:", e)
            return
        latencies.append(lat)
        # Try to print a small summary of returned logits
        outputs = resp.get('outputs', [])
        if outputs:
            out0 = outputs[0]
            print("Output name:", out0.get('name'))
            shape = out0.get('shape')
            print("Output shape:", shape)
            # Print first token logits for first batch item if available
            data = out0.get('data')
            if data and isinstance(data, list):
                print("Sample logits (first 10 values):", data[0][:10])
        print(f"Latency: {lat:.2f} ms\n")

    if latencies:
        latencies_sorted = sorted(latencies)
        print("Latency summary ms: p50=%.2f p90=%.2f p95=%.2f avg=%.2f" % (
            latencies_sorted[len(latencies)//2],
            latencies_sorted[int(len(latencies)*0.9)-1 if len(latencies)>1 else -1],
            latencies_sorted[int(len(latencies)*0.95)-1 if len(latencies)>1 else -1],
            sum(latencies)/len(latencies)
        ))


if __name__ == '__main__':
    main()
