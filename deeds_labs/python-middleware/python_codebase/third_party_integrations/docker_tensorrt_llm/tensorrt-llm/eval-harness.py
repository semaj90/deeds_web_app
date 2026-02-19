#!/usr/bin/env python3
"""
Minimal evaluation harness for Triton-backed model.
It measures latency and computes a toy top-1 matching accuracy using a small fixture dataset.

This is intentionally minimal — adapt dataset loading and metrics to your use-case.
"""
import argparse
import requests
import time
import json
import random


def infer(server, model, input_ids):
    url = f"{server}/v2/models/{model}/infer"
    payload = {
        "inputs": [
            {"name": "input_ids", "datatype": "INT32", "shape": [len(input_ids), len(input_ids[0])], "data": input_ids}
        ]
    }
    r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()


def top1_from_logits(resp_json):
    outputs = resp_json.get('outputs', [])
    if not outputs:
        return None
    data = outputs[0].get('data')
    shape = outputs[0].get('shape')
    # very naive: assume flattened [batch, seq, vocab]; we pick argmax of final token logits
    batch = shape[0]
    seq = shape[1]
    # data is flattened; compute index of last token logits for first batch
    # Each token has `vocab` logits = len(data) / (batch*seq)
    vocab = int(len(data) / (batch*seq))
    start = (0*seq + (seq-1)) * vocab
    last_token_logits = data[start:start+vocab]
    if not last_token_logits:
        return None
    # argmax
    return max(range(len(last_token_logits)), key=lambda i: last_token_logits[i])


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--server', default='http://localhost:8000')
    p.add_argument('--model', default='legal_gemma')
    p.add_argument('--runs', type=int, default=10)
    p.add_argument('--batch', type=int, default=1)
    p.add_argument('--seq', type=int, default=32)
    args = p.parse_args()

    latencies = []
    correct = 0
    for i in range(args.runs):
        # toy dataset: generate random input and a "ground truth" token id (we can't create real groundtruth here)
        input_ids = [[random.randint(0, 9999) for _ in range(args.seq)] for _ in range(args.batch)]
        start = time.time()
        try:
            resp = infer(args.server, args.model, input_ids)
        except Exception as e:
            print('Inference failed:', e)
            return
        latencies.append((time.time() - start)*1000.0)
        pred = top1_from_logits(resp)
        # Toy "accuracy": check if predicted token is even/odd vs a pseudo-ground truth
        if pred is not None:
            if pred % 2 == 0:
                correct += 1

    print(f"Ran {args.runs} runs. avg latency {sum(latencies)/len(latencies):.2f} ms. toy acc={correct}/{args.runs}")


if __name__ == '__main__':
    main()
