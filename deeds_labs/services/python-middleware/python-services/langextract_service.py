from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

import langextract as lx
from langextract.inference import OllamaLanguageModel

app = FastAPI(title="LangExtract Service")

# --- Config ---
OLLAMA_URL = "http://localhost:11434"  # or "http://ollama:11434" in Docker
LANGEXTRACT_MODEL_ID = "gemma3:4b"     # adjust to your pulled model


# --- Request/Response models ---
class LangExtractRequest(BaseModel):
  text: str
  url: Optional[str] = None
  title: Optional[str] = None
  meta: Optional[Dict[str, Any]] = None
  # optionally allow custom prompt/examples per call:
  prompt_description: Optional[str] = None
  examples: Optional[List[Dict[str, Any]]] = None


class LangExtractResponse(BaseModel):
  doc_id: str
  structured: Any
  html_report: Optional[str] = None  # you can choose to omit if large


# --- Default prompt & examples (keep it short-ish) ---

DEFAULT_PROMPT = """
You are extracting structured legal information from a court opinion or statute.

For each document, identify:
- case_metadata: court, jurisdiction, date, docket, parties
- issues: list of legal questions
- holdings: list of holdings (short text)
- rules: list of rules or tests applied
- citations: list of cited cases/statutes with type
- key_facts: bullet list of important facts
Return valid JSON only.
""".strip()

DEFAULT_EXAMPLES = [
  {
    "input": "Example short legal text here...",
    "output": {
      "case_metadata": {
        "court": "Supreme Court of the United States",
        "jurisdiction": "US",
        "date": "1963-03-18",
        "docket": "No. 155",
        "parties": ["Gideon", "Wainwright"]
      },
      "issues": [
        "Whether the Sixth Amendment requires states to provide counsel..."
      ],
      "holdings": [
        "The Sixth Amendment requires states to provide counsel..."
      ],
      "rules": [
        "The right to counsel is fundamental and essential to a fair trial."
      ],
      "citations": [
        {
          "type": "case",
          "name": "Betts v. Brady",
          "reporter": "316 U.S. 455",
          "year": 1942
        }
      ],
      "key_facts": [
        "Defendant was charged with felony...",
        "He requested counsel but was denied..."
      ]
    }
  }
]

# --- LangExtract runner ---

def run_langextract(req: LangExtractRequest) -> Dict[str, Any]:
  prompt = req.prompt_description or DEFAULT_PROMPT
  examples = req.examples or DEFAULT_EXAMPLES

  result = lx.extract(
    text_or_documents=req.text,
    prompt_description=prompt,
    examples=examples,
    language_model_type=OllamaLanguageModel,
    model_id=LANGEXTRACT_MODEL_ID,
    model_url=OLLAMA_URL,
    fence_output=False,
    use_schema_constraints=False,
  )

  # result typically has .structured and .html_report (depending on version)
  # Adapt this to the actual API of the lib you're using.
  # I'll assume result has attributes .structured and .html.

  structured = getattr(result, "structured", result)
  html = getattr(result, "html", None)

  return {
    "structured": structured,
    "html_report": html,
  }


@app.post("/extract", response_model=LangExtractResponse)
async def extract(req: LangExtractRequest):
  out = run_langextract(req)

  # You can compute a deterministic doc_id hash here (e.g. of text+url).
  import hashlib
  doc_id_src = (req.url or "") + "|" + (req.title or "") + "|" + req.text[:1024]
  doc_id = hashlib.sha256(doc_id_src.encode("utf-8")).hexdigest()

  return LangExtractResponse(
    doc_id=doc_id,
    structured=out["structured"],
    html_report=out["html_report"],
  )


@app.get("/health")
async def health():
  return {"status": "ok"}