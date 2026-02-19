#!/usr/bin/env python3
from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel
import requests, bs4, redis
from sentence_transformers import SentenceTransformer
import numpy as np, json, os, time
from urllib import robotparser
from langdetect import detect_langs
import nltk

# Ensure NLTK punkt tokenizer is available
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')
from nltk import sent_tokenize

app = FastAPI(title="Phase45 Adapter")

# Configuration from environment variables
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

# Initialize Redis client
try:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)
    r.ping() # Test connection
    print(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except redis.exceptions.ConnectionError as e:
    print(f"Could not connect to Redis: {e}")
    r = None # Set to None if connection fails

# Initialize SentenceTransformer model
try:
    model = SentenceTransformer("all-MiniLM-L6-v2")
    print("SentenceTransformer model loaded.")
except Exception as e:
    print(f"Could not load SentenceTransformer model: {e}")
    model = None # Set to None if loading fails

class CrawlRequest(BaseModel):
    url: str
    max_length: int = 512


class FetchAndIndexRequest(BaseModel):
    url: str
    max_length: int = 4096
    user_consent: bool = False
    enable_ocr: bool = False
    retries: int = 2

@app.get("/health")
def health():
    if r is None or model is None:
        status = "degraded"
    else:
        status = "ok"
    return {"status": status}

@app.post("/crawl")
def crawl(req: CrawlRequest):
    if r is None or model is None:
        raise HTTPException(status_code=503, detail="Service not fully initialized (Redis/Model)")

    try:
        res = requests.get(req.url, timeout=10)
        soup = bs4.BeautifulSoup(res.text, "html.parser")
        text = " ".join([t.get_text() for t in soup.find_all(["p","code","pre"])])
        snippet = text[:req.max_length]
        emb = model.encode(snippet).tolist()
        key = f"doc:{req.url}"
        r.set(key, json.dumps(emb))
        return {"url": req.url, "len": len(snippet), "redis_key": key}
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to crawl URL: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error during crawl: {e}")


def is_allowed_by_robots(url: str, user_agent: str = "*") -> bool:
    try:
        parsed = requests.utils.urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = robotparser.RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(user_agent, url)
    except Exception:
        # If robots.txt cannot be fetched, err on the side of caution and allow
        return True


@app.post("/fetch_and_index")
def fetch_and_index(req: FetchAndIndexRequest):
    """
    Safe fetch + index endpoint (policy-vetted slice).
    - Checks robots.txt and respects `user_consent`.
    - Performs language detection and sentence splitting.
    - Stores metadata + embedding + sentences in Redis under `doc:{url}`.
    - Optional OCR flag is supported but not implemented (feature-flagged/stub).
    """
    if r is None or model is None:
        raise HTTPException(status_code=503, detail="Service not fully initialized (Redis/Model)")

    if not req.user_consent:
        raise HTTPException(status_code=400, detail="User consent required to fetch external content")

    # Respect robots.txt
    try:
        allowed = is_allowed_by_robots(req.url)
        if not allowed:
            raise HTTPException(status_code=403, detail="Fetching disallowed by robots.txt")
    except HTTPException:
        raise
    except Exception as e:
        # If robots check fails, log and continue (policy decision may vary)
        print(f"robots.txt check failed for {req.url}: {e}")

    # OCR is intentionally stubbed behind a feature flag
    if req.enable_ocr:
        # Placeholder: integrate OCR (Tesseract/PyTesseract) in a later scoped step
        raise HTTPException(status_code=501, detail="OCR support is not enabled in this deployment")

    attempt = 0
    backoff = 1.0
    last_exc = None
    while attempt <= max(0, req.retries):
        try:
            resp = requests.get(req.url, timeout=10)
            resp.raise_for_status()
            html = resp.text
            soup = bs4.BeautifulSoup(html, "html.parser")
            text = " ".join([t.get_text() for t in soup.find_all(["p", "code", "pre"])])
            snippet = text[:req.max_length]

            # Language detection
            lang = None
            try:
                langs = detect_langs(snippet)
                if langs:
                    lang = str(langs[0])
            except Exception as e:
                print(f"langdetect failed for {req.url}: {e}")

            # Sentence splitting
            sentences = []
            try:
                sentences = sent_tokenize(snippet)
            except Exception as e:
                # Fallback: naive splitting
                sentences = [s.strip() for s in snippet.split('.') if s.strip()][:10]

            emb = model.encode(snippet).tolist()

            doc_obj = {
                "url": req.url,
                "fetched_at": int(time.time()),
                "length": len(snippet),
                "lang": lang,
                "sentences": sentences,
                "embedding": emb,
            }

            key = f"doc:{req.url}"
            r.set(key, json.dumps(doc_obj))

            return {"url": req.url, "redis_key": key, "top_sentences": sentences[:5], "lang": lang}
        except requests.exceptions.RequestException as e:
            last_exc = e
            attempt += 1
            time.sleep(backoff)
            backoff *= 2
            continue
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Internal error while fetching: {e}")

    # If we exhausted retries
    raise HTTPException(status_code=502, detail=f"Failed to fetch URL after {req.retries + 1} attempts: {last_exc}")

@app.get("/query")
def query(q: str):
    if r is None or model is None:
        raise HTTPException(status_code=503, detail="Service not fully initialized (Redis/Model)")

    try:
        keys = [k for k in r.keys("doc:*")] # r.keys returns bytes, no decode needed with decode_responses=True
        if not keys:
            return {"results": []}

        vectors = []
        valid_keys = []
        for k in keys:
            try:
                v_str = r.get(k)
                if v_str:
                    vectors.append(np.array(json.loads(v_str)))
                    valid_keys.append(k)
            except Exception as e:
                print(f"Error loading vector for key {k}: {e}")
                continue

        if not vectors:
            return {"results": []}

        qv = np.array(model.encode(q))
        sims = []
        for v in vectors:
            norm_qv = qv / (np.linalg.norm(qv) + 1e-12)
            norm_v = v / (np.linalg.norm(v) + 1e-12)
            sims.append(float(np.dot(norm_qv, norm_v)))

        best = sorted(zip(valid_keys, sims), key=lambda x: x[1], reverse=True)[:5]
        return {"results": best}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error during query: {e}")
