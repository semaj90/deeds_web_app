"""Convert replay/RouteTrace JSONL into constrained SFT examples for later QLoRA.

Expected minimal input fields:
state, allowed_actions, selected_action, model, budget, issue, evidence_summary
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()
    out = []
    for line in args.input.read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        row = json.loads(line)
        prompt = (
            f"STATE={row['state']}\n"
            f"ALLOWED_ACTIONS={json.dumps(row['allowed_actions'])}\n"
            f"BUDGET={row.get('budget', 'SMALL')}\n"
            f"ISSUE={row.get('issue', '')}\n"
            f"EVIDENCE={row.get('evidence_summary', '')}\n"
            "Choose exactly one allowed Parent Atlas action and, only if needed, a model target."
        )
        answer = json.dumps({
            'action': row['selected_action'],
            'model': row.get('model', 'NO_LLM'),
            'budget': row.get('budget', 'SMALL'),
        })
        out.append({'messages': [
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': answer},
        ]})
    args.output.write_text('\n'.join(json.dumps(row) for row in out) + '\n', encoding='utf-8')

if __name__ == '__main__': main()
