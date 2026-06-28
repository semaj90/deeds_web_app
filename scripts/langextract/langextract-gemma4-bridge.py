#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LangExtract Bridge using TurboQuant Gemma4 via llama-server (OpenAI compatible)

Instead of Ollama, this uses:
- llama-server.exe running locally with gemma4-legal-iq4xs-direct.gguf
- OpenAI-compatible /v1/chat/completions endpoint
- Structured extraction via Gemma4 (better legal reasoning than generic models)

Usage:
    python langextract-gemma4-bridge.py --text "path/to/evidence.txt" --output results.jsonl
    python langextract-gemma4-bridge.py --pdf "path/to/evidence.pdf"
"""

import os
import sys
import json
import argparse
import requests
from typing import Optional, Dict, List, Any
from pathlib import Path
import re

# Configuration
LLAMA_SERVER_URL = os.environ.get("LLAMA_SERVER_URL", "http://127.0.0.1:8090")
LLAMA_MODEL = os.environ.get("LLAMA_MODEL", "gemma4-legal-iq4xs-direct.gguf")
TIMEOUT_SECONDS = int(os.environ.get("LANGEXTRACT_TIMEOUT", "120"))

# Legal extraction schema for Gemma4
EXTRACTION_SCHEMA = {
    "entities": [
        {
            "type": "string",
            "enum": [
                "person", "organization", "location", "date", "time",
                "statute", "case", "charge", "weapon", "vehicle",
                "property", "medical", "digital_account", "amount", "contact"
            ]
        }
    ],
    "events": [
        {
            "type": "string",
            "enum": [
                "incident", "communication", "threat", "injury",
                "property_damage", "entry", "theft", "arrest",
                "search", "seizure", "report_filed"
            ]
        }
    ],
    "claims": ["fact", "allegation", "inference", "unknown"],
    "crime_signals": ["statute_reference", "element_match", "jurisdiction"]
}

EXTRACTION_PROMPT_TEMPLATE = """You are a legal document extraction expert. Extract structured information from the following evidence text.

EVIDENCE TEXT:
{text}

Extract and return ONLY valid JSON (no markdown, no comments) with this exact structure:
{{
  "entities": [
    {{"type": "person|organization|location|date|statute|charge|weapon|vehicle|property|amount|contact", "text": "extracted text", "confidence": 0.0-1.0, "role_or_context": "optional notes"}}
  ],
  "events": [
    {{"type": "incident|communication|threat|injury|theft|arrest|report_filed", "description": "what happened", "time": "when (if mentioned)", "location": "where (if mentioned)", "confidence": 0.0-1.0}}
  ],
  "claims": [
    {{"claim": "the claim text", "kind": "fact|allegation|inference", "speaker": "who said it (optional)", "confidence": 0.0-1.0}}
  ],
  "crime_signals": [
    {{"label": "suspected crime", "statute": "relevant statute if known", "elements": ["element1", "element2"], "confidence": 0.0-1.0}}
  ],
  "summary": "brief case summary",
  "warnings": []
}}

Guidelines:
- Extract ONLY information explicitly stated or directly inferable from the text
- Confidence: 0.95+ for explicit facts, 0.70-0.90 for clear inferences, <0.70 for speculative
- Return empty arrays if no entities/events/claims found
- Do not speculate about guilt or innocence
- Flag any uncertainty in warnings array
"""


class LangExtractGemma4Bridge:
    """Bridge between Google LangExtract API and local Gemma4 via llama-server"""

    def __init__(self, base_url: str = LLAMA_SERVER_URL, model: str = LLAMA_MODEL, timeout: int = TIMEOUT_SECONDS):
        self.base_url = base_url
        self.model = model
        self.timeout = timeout
        self._verify_service()

    def _verify_service(self) -> bool:
        """Verify llama-server is running and has the model"""
        try:
            res = requests.get(f"{self.base_url}/v1/models", timeout=5)
            if res.status_code == 200:
                models = res.json().get("data", [])
                model_ids = [m.get("id") for m in models]
                print("[OK] llama-server running at " + self.base_url)
                print("  Available models: " + str(model_ids))
                return True
            else:
                print("[FAIL] llama-server returned " + str(res.status_code))
                return False
        except Exception as e:
            print("[FAIL] Cannot connect to llama-server at " + self.base_url + ": " + str(e))
            print(f"  Make sure llama-server.exe is running:")
            print(f"    llama-server.exe -m models/gemma4-legal-iq4xs-direct.gguf -c 65536 -ngl 99 -fa on")
            return False

    def extract(self, text: str) -> Dict[str, Any]:
        """Extract legal entities and events from text using Gemma4"""

        if not text or len(text.strip()) < 10:
            return {
                "entities": [],
                "events": [],
                "claims": [],
                "crime_signals": [],
                "summary": "",
                "warnings": ["Text too short for extraction"]
            }

        prompt = EXTRACTION_PROMPT_TEMPLATE.format(text=text)

        try:
            print("  -> Sending " + str(len(text)) + " characters to Gemma4...")

            res = requests.post(
                self.base_url + "/v1/chat/completions",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You are a legal document extraction expert. Return ONLY valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 2048,
                    "stream": False
                },
                timeout=self.timeout
            )

            if res.status_code != 200:
                return {
                    "entities": [],
                    "events": [],
                    "claims": [],
                    "crime_signals": [],
                    "summary": "",
                    "warnings": [f"Gemma4 error: {res.status_code} {res.text[:100]}"]
                }

            response_data = res.json()
            response_text = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")

            if not response_text:
                return {
                    "entities": [],
                    "events": [],
                    "claims": [],
                    "crime_signals": [],
                    "summary": "",
                    "warnings": ["Gemma4 returned empty response"]
                }

            # Extract JSON from response (may be wrapped in markdown)
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if not json_match:
                return {
                    "entities": [],
                    "events": [],
                    "claims": [],
                    "crime_signals": [],
                    "summary": "",
                    "warnings": [f"Could not parse JSON from Gemma4 response: {response_text[:200]}"]
                }

            result = json.loads(json_match.group())
            print("  [OK] Extraction complete")
            print("    - Entities: " + str(len(result.get('entities', []))))
            print("    - Events: " + str(len(result.get('events', []))))
            print("    - Claims: " + str(len(result.get('claims', []))))
            print("    - Crime signals: " + str(len(result.get('crime_signals', []))))

            return result

        except requests.Timeout:
            return {
                "entities": [],
                "events": [],
                "claims": [],
                "crime_signals": [],
                "summary": "",
                "warnings": ["Gemma4 timeout after " + str(self.timeout) + "s"]
            }
        except json.JSONDecodeError as e:
            return {
                "entities": [],
                "events": [],
                "claims": [],
                "crime_signals": [],
                "summary": "",
                "warnings": [f"JSON parse error: {str(e)[:100]}"]
            }
        except Exception as e:
            return {
                "entities": [],
                "events": [],
                "claims": [],
                "crime_signals": [],
                "summary": "",
                "warnings": [f"Extraction error: {str(e)[:100]}"]
            }

    def extract_file(self, file_path: str) -> Dict[str, Any]:
        """Extract from file (txt or pdf)"""
        path = Path(file_path)

        if not path.exists():
            return {"warnings": [f"File not found: {file_path}"]}

        if path.suffix.lower() == '.txt':
            with open(path, 'r', encoding='utf-8') as f:
                text = f.read()
            return self.extract(text)

        elif path.suffix.lower() == '.pdf':
            try:
                import PyPDF2
                with open(path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    text = ''.join(page.extract_text() for page in reader.pages)
                return self.extract(text)
            except ImportError:
                return {"warnings": ["PyPDF2 not installed. Install with: pip install PyPDF2"]}

        else:
            return {"warnings": [f"Unsupported file type: {path.suffix}"]}


def main():
    parser = argparse.ArgumentParser(
        description="Extract legal entities from evidence using Gemma4 + llama-server"
    )
    parser.add_argument("--text", help="Text file to extract from")
    parser.add_argument("--pdf", help="PDF file to extract from")
    parser.add_argument("--input", help="Raw text to extract (quotes)")
    parser.add_argument("--output", default="langextract_results.jsonl", help="Output JSONL file")
    parser.add_argument("--server", default=LLAMA_SERVER_URL, help="llama-server URL")
    parser.add_argument("--model", default=LLAMA_MODEL, help="Model ID")
    parser.add_argument("--timeout", type=int, default=TIMEOUT_SECONDS, help="Request timeout (seconds)")

    args = parser.parse_args()

    # Validate input
    if not any([args.text, args.pdf, args.input]):
        print("Error: Provide --text, --pdf, or --input")
        sys.exit(1)

    print("=" * 80)
    print("LANGEXTRACT + GEMMA4 (llama-server) BRIDGE")
    print("=" * 80)

    # Initialize bridge
    bridge = LangExtractGemma4Bridge(base_url=args.server, model=args.model, timeout=args.timeout)

    if not bridge._verify_service():
        print("\n❌ Cannot proceed without llama-server running")
        sys.exit(1)

    # Extract
    print("\n[EXTRACTING...]\n")

    if args.input:
        print("Input text (" + str(len(args.input)) + " chars):")
        result = bridge.extract(args.input)
    elif args.text:
        print("Reading from: " + args.text)
        result = bridge.extract_file(args.text)
    elif args.pdf:
        print("Reading from: " + args.pdf)
        result = bridge.extract_file(args.pdf)

    # Output results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    print(json.dumps(result, indent=2))

    # Save to JSONL
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'a') as f:
        f.write(json.dumps({
            "text_preview": (args.input or "")[:100],
            "extraction": result
        }) + "\n")

    print("\n[OK] Results saved to " + str(output_path))


if __name__ == "__main__":
    main()
