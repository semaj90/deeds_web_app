#!/usr/bin/env python3
"""
Fictional Legal Case Generator — MVP
Generates fictional legal cases across 8 categories using Ollama LLM.

Categories (Criminal):
  1. wire_fraud                — 18 U.S.C. § 1343 wire/mail fraud schemes
  2. drug_trafficking          — 21 U.S.C. § 841 controlled substance offenses
  3. firearms                  — 18 U.S.C. § 922 unlawful possession/trafficking
  4. cybercrime                — 18 U.S.C. § 1030 CFAA computer fraud
  5. obstruction               — 18 U.S.C. § 1512/1519 witness tampering / obstruction

Categories (Civil / Federal):
  6. verbal_contracts           — Breach of oral contract (diversity jurisdiction)
  7. tort_federal               — Federal Tort Claims Act (28 U.S.C. § 2671-2680)
  8. federal_employee_liability — Federal employee contract liability (Tucker Act)

Fictionalization transforms (MANDATORY, applied to every case):
  - Names: UUID-seeded random surname + first name from fictional pools
  - Dates: Offset ±90 days from base date (base = 2023-01-01)
  - Locations: Random US cities from fictional pool (no real addresses)
  - Dollar amounts: Randomized ±30% of template amount
  - Guardrail: Block real person name list

Caching:
  - Per-case disk cache in scripts/case_data/_cache/ (survives disconnects)
  - JSONL resume mode reads existing output file
  - Exponential backoff retries (4 attempts) with keep-alive connections

Output:
  - JSONL to scripts/case_data/fictional_cases.jsonl
  - Optional: PostgreSQL cases table insert

Usage:
    python scripts/content_ops/fictional_case_generator.py
    python scripts/content_ops/fictional_case_generator.py --count 10 --category wire_fraud
    python scripts/content_ops/fictional_case_generator.py --count 80 --category all --resume
    python scripts/content_ops/fictional_case_generator.py --ingest-db
    python scripts/content_ops/fictional_case_generator.py --dry-run
"""
import sys, json, re, argparse, time, os, random, uuid, hashlib, urllib.request, urllib.error
import socket as _socket, io
from pathlib import Path
from datetime import date, timedelta

# Force UTF-8 stdout/stderr on Windows (prevents cp1252 UnicodeEncodeError)
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).parent
CASE_DATA_DIR = SCRIPT_DIR.parent / "case_data"
CASE_DATA_DIR.mkdir(exist_ok=True)

# ── Disk cache directory ──────────────────────────────────────────────────────
CACHE_DIR = CASE_DATA_DIR / "_cache"
CACHE_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(SCRIPT_DIR.parent))
from config.ollama_settings import OLLAMA_URL, LLM_MODEL, GEN_OPTIONS, LLM_TIMEOUT  # noqa: E402

# Retry config
MAX_RETRIES = 4
BASE_BACKOFF_SECS = 3.0      # 3s, 6s, 12s, 24s exponential
HTTP_TIMEOUT_SECS = 300       # 5 minutes per request

# ── Fictionalization pools ────────────────────────────────────────────────────
# Names carefully chosen to be obviously fictional (no real person matches)
FIRST_NAMES = [
    "Aldrin", "Bexley", "Corvin", "Delwyn", "Emara", "Fendrel", "Galthor",
    "Halvyn", "Ismena", "Jorvik", "Kaelthas", "Lyric", "Merthyn", "Norvik",
    "Odalys", "Peldrin", "Quorra", "Rystyn", "Serafyn", "Torvin",
    "Ulwyn", "Vesper", "Wyndel", "Xaryn", "Yolara", "Zephren",
    "Aelwyn", "Bryndas", "Cerwyn", "Daelric", "Eryndal", "Farwick",
    "Gyndel", "Havryn", "Ilwyn", "Jyrkan", "Kalidra", "Lyndrow",
    "Moryn", "Naldric", "Orvyn", "Parwick", "Quellyn", "Rywick",
    "Sylnar", "Telvyn", "Umric", "Veldric", "Wyrcan", "Xeldra",
]
LAST_NAMES = [
    "Aldwick", "Brenwick", "Coldwick", "Dravwick", "Elwick", "Faldwick",
    "Grawick", "Halvwick", "Ironwick", "Janwick", "Keldwick", "Lornwick",
    "Meldwick", "Nordwick", "Orvwick", "Pardwick", "Quelwick", "Reldwick",
    "Sandwick", "Taldwick", "Urnwick", "Valdwick", "Wardwick", "Xorwick",
    "Yeldwick", "Zandwick", "Ashwick", "Borewick", "Crestwick", "Dunwick",
    "Eastwick", "Frostwick", "Glenwick", "Hillwick", "Ironwick", "Jaywick",
    "Kirkwick", "Longwick", "Moorwick", "Northwick", "Oakewick", "Pathwick",
    "Quarrywick", "Ridgewick", "Stonewick", "Thornwick", "Underwick", "Valewick",
    "Westwick", "Yarwick",
]

# Fictional US city suffixes
CITY_BASES = [
    "Alderton", "Brexford", "Corvalis", "Delvane", "Eastmere", "Faldmore",
    "Grantham Vista", "Halverton", "Ironton", "Jarviston", "Keldmore",
    "Lorndale", "Mertwick", "Nordheim", "Orviston", "Pardmore", "Quelvale",
    "Reldton", "Sandmere", "Taldmore", "Urndale", "Valdton", "Wardmore",
    "Xormere", "Yeldville", "Zandton",
]
STATE_ABBRS = ["OH", "IL", "PA", "MI", "GA", "NC", "VA", "WA", "AZ", "CO",
               "MN", "MO", "WI", "TN", "MD", "IN", "NV", "OR", "KY", "AL"]

# Block list of real persons — compound names to avoid false positives
# (e.g. "al" alone matches "legal", "alleged", "federal")
REAL_PERSON_BLOCKLIST = {
    "donald trump", "trump", "biden", "obama", "clinton", "bush", "reagan",
    "bernie sanders", "sanders", "pelosi", "mcconnell", "schumer", "warren",
    "elon musk", "musk", "bezos", "gates", "zuckerberg", "buffett",
    "al capone", "capone", "madoff", "bundy", "dahmer", "manson",
}


def fictional_name(seed_str: str) -> tuple[str, str]:
    """Deterministic fictional name seeded by a string."""
    seed = int(hashlib.md5(seed_str.encode()).hexdigest(), 16)
    rng = random.Random(seed)
    return rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)


def fictional_city(seed_str: str) -> str:
    seed = int(hashlib.md5((seed_str + "city").encode()).hexdigest(), 16)
    rng = random.Random(seed)
    return f"{rng.choice(CITY_BASES)}, {rng.choice(STATE_ABBRS)}"


def fictional_date(seed_str: str, base: date = date(2023, 1, 1), spread_days: int = 90) -> str:
    seed = int(hashlib.md5((seed_str + "date").encode()).hexdigest(), 16)
    rng = random.Random(seed)
    offset = rng.randint(-spread_days, spread_days)
    return (base + timedelta(days=offset)).isoformat()


def fictional_amount(seed_str: str, base: float, spread_pct: float = 0.30) -> float:
    seed = int(hashlib.md5((seed_str + "amount").encode()).hexdigest(), 16)
    rng = random.Random(seed)
    factor = 1.0 + rng.uniform(-spread_pct, spread_pct)
    return round(base * factor, 2)


def guardrail_check(text: str) -> list[str]:
    """Return list of real-person name tokens found (triggers if non-empty)."""
    lower = text.lower()
    found = [tok for tok in REAL_PERSON_BLOCKLIST if re.search(r'\b' + re.escape(tok) + r'\b', lower)]
    return found


# ── Disk cache helpers ────────────────────────────────────────────────────────

def _cache_path(case_id: str) -> Path:
    """Return path to cached case JSON file."""
    return CACHE_DIR / f"{case_id}.json"


def cache_get(case_id: str) -> dict | None:
    """Load a case from disk cache, or None if not cached."""
    p = _cache_path(case_id)
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def cache_put(case: dict) -> None:
    """Save a case to disk cache (atomic via tmp + rename)."""
    p = _cache_path(case["case_id"])
    tmp = p.with_suffix(".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(case, f, ensure_ascii=False)
        tmp.replace(p)
    except Exception:
        if tmp.exists():
            tmp.unlink()


# ── Case templates (filled in by LLM) ────────────────────────────────────────
CATEGORY_TEMPLATES = {
    "wire_fraud": {
        "statute": "18 U.S.C. § 1343",
        "charge": "Wire Fraud",
        "base_amount": 250_000.0,
        "prompt_template": (
            "Generate a fictional federal criminal case summary for wire fraud under 18 U.S.C. § 1343. "
            "Use ONLY the fictional defendant name '{defendant}', date '{date}', city '{city}', "
            "and scheme amount ${amount:,.0f}. "
            "Include: (1) a one-sentence factual summary of the fraudulent scheme, "
            "(2) the wire communications used (phone/email/text), "
            "(3) the alleged victim entity (fictional company name), "
            "(4) investigation steps (2 sentences). "
            "IMPORTANT: Do NOT use any real person names. Keep to 200-300 words. "
            "Format: plain narrative paragraphs."
        ),
    },
    "drug_trafficking": {
        "statute": "21 U.S.C. § 841(a)(1)",
        "charge": "Distribution of Controlled Substances",
        "base_amount": 0.0,
        "prompt_template": (
            "Generate a fictional federal criminal case summary for drug trafficking under "
            "21 U.S.C. § 841(a)(1). "
            "Use ONLY the fictional defendant name '{defendant}', date '{date}', city '{city}'. "
            "Pick a Schedule I or II controlled substance (e.g., heroin, fentanyl, cocaine, meth). "
            "Include: (1) brief factual summary of alleged distribution operation, "
            "(2) quantity seized with specific weight, "
            "(3) two enumerated overt acts by date, "
            "(4) law enforcement agency involved. "
            "IMPORTANT: Do NOT use real person names, real gang names, or real cartel names. "
            "Keep to 200-300 words. Format: plain narrative paragraphs."
        ),
    },
    "firearms": {
        "statute": "18 U.S.C. § 922(g)(1)",
        "charge": "Felon in Possession of a Firearm",
        "base_amount": 0.0,
        "prompt_template": (
            "Generate a fictional federal criminal case summary for unlawful firearm possession "
            "under 18 U.S.C. § 922(g)(1). "
            "Use ONLY the fictional defendant name '{defendant}', date '{date}', city '{city}'. "
            "Include: (1) prior conviction establishing felon status (fictional case reference), "
            "(2) description of firearm(s) discovered (make, model, caliber — all fictional), "
            "(3) circumstances of discovery (traffic stop, search warrant, etc.), "
            "(4) any additional charges (e.g., § 924(c) if applicable). "
            "IMPORTANT: Do NOT use real person names. Keep to 150-250 words."
        ),
    },
    "cybercrime": {
        "statute": "18 U.S.C. § 1030(a)(2)",
        "charge": "Unauthorized Access to Protected Computer",
        "base_amount": 500_000.0,
        "prompt_template": (
            "Generate a fictional federal criminal case summary for computer fraud under "
            "18 U.S.C. § 1030(a)(2) (CFAA). "
            "Use ONLY the fictional defendant name '{defendant}', date '{date}', city '{city}', "
            "and alleged financial loss ${amount:,.0f}. "
            "Include: (1) what systems were accessed and how (vulnerability, phishing, etc.), "
            "(2) what data was exfiltrated or damaged (no real company names), "
            "(3) how the intrusion was discovered, "
            "(4) digital forensic evidence summary. "
            "IMPORTANT: Use only fictional organization names. Do NOT reference real companies. "
            "Keep to 200-300 words."
        ),
    },
    "obstruction": {
        "statute": "18 U.S.C. § 1512(b)",
        "charge": "Witness Tampering / Obstruction of Justice",
        "base_amount": 0.0,
        "prompt_template": (
            "Generate a fictional federal criminal case summary for obstruction of justice / "
            "witness tampering under 18 U.S.C. § 1512(b). "
            "Use ONLY the fictional defendant name '{defendant}', date '{date}', city '{city}'. "
            "Include: (1) the underlying federal investigation the defendant attempted to obstruct, "
            "(2) specific acts of tampering (e.g., contacting a witness, destroying evidence), "
            "(3) how the obstruction was discovered, "
            "(4) any superseding charges arising from the obstruction. "
            "IMPORTANT: Do NOT use real person names. Keep to 200-300 words."
        ),
    },
    # ── Civil / Federal categories ────────────────────────────────────────────
    "verbal_contracts": {
        "statute": "28 U.S.C. § 1332 (Diversity Jurisdiction)",
        "charge": "Breach of Oral Contract",
        "base_amount": 125_000.0,
        "prompt_template": (
            "Generate a fictional federal civil case summary for breach of an oral (verbal) contract. "
            "The case is in federal court under diversity jurisdiction (28 U.S.C. § 1332) because the "
            "parties are citizens of different states and the amount in controversy exceeds $75,000. "
            "Use ONLY the fictional plaintiff name '{defendant}' (as the aggrieved party), date '{date}', "
            "city '{city}', and disputed amount ${amount:,.0f}. "
            "Include: (1) the terms of the alleged oral agreement (what was promised, by whom, when), "
            "(2) what consideration was exchanged or promised, "
            "(3) how the defendant breached the agreement, "
            "(4) the Statute of Frauds analysis (why this oral contract is or is not enforceable), "
            "(5) damages claimed and basis for calculation. "
            "Reference applicable state UCC or common law principles. "
            "IMPORTANT: Do NOT use any real person or company names. Keep to 250-350 words. "
            "Format: plain narrative paragraphs."
        ),
    },
    "tort_federal": {
        "statute": "28 U.S.C. § 2671-2680 (Federal Tort Claims Act)",
        "charge": "Negligent Act by Federal Employee (FTCA)",
        "base_amount": 350_000.0,
        "prompt_template": (
            "Generate a fictional federal civil case summary under the Federal Tort Claims Act "
            "(FTCA, 28 U.S.C. §§ 2671-2680). A private citizen sues the United States for a "
            "tortious act committed by a federal employee acting within the scope of employment. "
            "Use ONLY the fictional plaintiff name '{defendant}', date '{date}', city '{city}', "
            "and claimed damages ${amount:,.0f}. "
            "Include: (1) the federal agency involved (use a fictional agency name), "
            "(2) the negligent or wrongful act committed by the federal employee, "
            "(3) how the act was within the scope of employment, "
            "(4) the administrative claim filed with the agency (SF-95 requirement), "
            "(5) whether any FTCA exceptions apply (discretionary function, intentional tort, etc.), "
            "(6) the injury or property damage sustained. "
            "IMPORTANT: Do NOT use real person names, real agency names, or real incidents. "
            "Keep to 250-350 words. Format: plain narrative paragraphs."
        ),
    },
    "federal_employee_liability": {
        "statute": "28 U.S.C. § 1491 (Tucker Act)",
        "charge": "Breach of Federal Employment Contract",
        "base_amount": 200_000.0,
        "prompt_template": (
            "Generate a fictional federal civil case summary for breach of a federal employment "
            "contract under the Tucker Act (28 U.S.C. § 1491), filed in the U.S. Court of "
            "Federal Claims. A federal employee or contractor sues the United States for breach "
            "of an express or implied contract. "
            "Use ONLY the fictional plaintiff name '{defendant}', date '{date}', city '{city}', "
            "and claimed damages ${amount:,.0f}. "
            "Include: (1) the nature of the federal employment or contract (GS grade, contract type), "
            "(2) the specific contractual obligation the government allegedly breached, "
            "(3) whether the contract was express (written terms) or implied-in-fact, "
            "(4) the plaintiff's performance under the contract, "
            "(5) the government's defense (sovereign immunity waiver, jurisdictional amount), "
            "(6) damages calculation (back pay, lost benefits, consequential damages). "
            "Reference the Tucker Act's $10,000+ threshold for Court of Federal Claims jurisdiction. "
            "IMPORTANT: Do NOT use real person names or real agency names. "
            "Keep to 250-350 words. Format: plain narrative paragraphs."
        ),
    },
}

DISCLAIMER = (
    "DISCLAIMER: This is a fictional case generated for legal simulation and educational purposes only. "
    "All names, dates, locations, and organizations are fictional and any resemblance to real persons "
    "or events is coincidental. This content does not constitute legal advice. "
    "Do not rely on this for any real legal matter. Consult qualified counsel."
)


def generate_case(case_id: str, category: str, template: dict, rng: random.Random) -> dict | None:
    """Generate a single fictional case using the LLM (with disk cache + retries)."""

    # ── Check disk cache first ────────────────────────────────────────────────
    cached = cache_get(case_id)
    if cached:
        print(f"[cache hit]", end=" ", flush=True)
        return cached

    first, last = fictional_name(case_id)
    defendant = f"{first} {last}"
    city = fictional_city(case_id)
    incident_date = fictional_date(case_id)
    amount = fictional_amount(case_id, template["base_amount"]) if template["base_amount"] else 0.0

    prompt = template["prompt_template"].format(
        defendant=defendant,
        date=incident_date,
        city=city,
        amount=amount,
    )

    # Call LLM with keep-alive and model pinning
    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a legal fiction writer creating case summaries for a simulation platform. "
                    "All output is fictional. Use only the names and details provided in the prompt. "
                    "Never use real living or deceased persons' names."
                )
            },
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "keep_alive": "24h",
        "options": GEN_OPTIONS,
    }).encode()

    narrative = ""
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(
            f"{OLLAMA_URL}/api/chat",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Connection": "keep-alive",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECS) as resp:
                data = json.loads(resp.read())
                narrative = data.get("message", {}).get("content", "")
            break
        except (TimeoutError, _socket.timeout, urllib.error.URLError, ConnectionError, OSError) as e:
            is_timeout = isinstance(e, (TimeoutError, _socket.timeout)) or "timed out" in str(e).lower()
            is_connection = "connection" in str(e).lower() or isinstance(e, (ConnectionError, ConnectionResetError))
            if (is_timeout or is_connection) and attempt < MAX_RETRIES - 1:
                backoff = BASE_BACKOFF_SECS * (2 ** attempt)
                print(f"\n    [retry {attempt+1}/{MAX_RETRIES}, backoff {backoff:.0f}s: {type(e).__name__}]",
                      end=" ", flush=True, file=sys.stderr)
                time.sleep(backoff)
            else:
                print(f"\n    [LLM error after {attempt+1} attempts] {e}", file=sys.stderr)
                return None
        except Exception as e:
            print(f"\n    [LLM error] {e}", file=sys.stderr)
            return None

    if not narrative or len(narrative) < 50:
        print(f"[empty response]", file=sys.stderr)
        return None

    # Guardrail check
    real_tokens = guardrail_check(narrative)
    if real_tokens:
        print(f"    ⚠ Guardrail triggered: real tokens found: {real_tokens}")
        # Replace detected tokens with fictional alternatives
        for tok in real_tokens:
            narrative = re.sub(r'\b' + re.escape(tok) + r'\b', "[REDACTED]", narrative, flags=re.I)

    case = {
        "case_id": case_id,
        "category": category,
        "charge": template["charge"],
        "primary_statute": template["statute"],
        "defendant_name": defendant,
        "incident_date": incident_date,
        "jurisdiction_city": city,
        "financial_loss": amount if amount > 0 else None,
        "narrative": narrative,
        "disclaimer": DISCLAIMER,
        "is_fictional": True,
        "generated_by": LLM_MODEL,
        "guardrail_triggered": bool(real_tokens),
        "guardrail_tokens_found": real_tokens,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    # ── Save to disk cache immediately ────────────────────────────────────────
    cache_put(case)

    return case


def ingest_to_db(cases: list[dict]) -> int:
    """Insert fictional cases into PostgreSQL cases table."""
    import psycopg2
    conn_str = os.getenv(
        "DATABASE_URL",
        "postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db"
    )
    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor()
        inserted = 0
        for c in cases:
            cur.execute("""
                INSERT INTO cases (
                    title, description, status, priority, jurisdiction, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (
                f"[FICTIONAL] US v. {c['defendant_name']} — {c['charge']}",
                c["narrative"][:2000],
                "open",
                "medium",
                c["jurisdiction_city"],
                json.dumps({
                    "case_id": c["case_id"],
                    "category": c["category"],
                    "statute": c["primary_statute"],
                    "is_fictional": True,
                    "disclaimer": c["disclaimer"],
                }),
            ))
            inserted += 1
        conn.commit()
        cur.close()
        conn.close()
        return inserted
    except Exception as e:
        print(f"[DB error] {e}", file=sys.stderr)
        return 0


def main():
    parser = argparse.ArgumentParser(description="Fictional legal case generator")
    parser.add_argument("--count", type=int, default=80,
                        help="Total cases to generate (default 80 = 10 per category)")
    parser.add_argument("--category", choices=list(CATEGORY_TEMPLATES.keys()) + ["all"], default="all")
    parser.add_argument("--ingest-db", action="store_true", dest="ingest_db",
                        help="Insert generated cases into PostgreSQL")
    parser.add_argument("--dry-run", action="store_true", dest="dry_run",
                        help="Print case stubs without calling LLM")
    parser.add_argument("--output", type=str, default="",
                        help="Output JSONL path (default: scripts/case_data/fictional_cases.jsonl)")
    parser.add_argument("--resume", action="store_true",
                        help="Resume from existing JSONL (append mode, skip already-done cases)")
    parser.add_argument("--clear-cache", action="store_true", dest="clear_cache",
                        help="Clear disk cache before generating")
    args = parser.parse_args()

    # ── Optional cache clear ──────────────────────────────────────────────────
    if args.clear_cache:
        cleared = 0
        for f in CACHE_DIR.glob("*.json"):
            f.unlink()
            cleared += 1
        print(f"  Cleared {cleared} cached cases from {CACHE_DIR}")

    categories = list(CATEGORY_TEMPLATES.keys()) if args.category == "all" else [args.category]
    per_category = max(1, args.count // len(categories))
    remainder = args.count - per_category * len(categories)

    out_path = args.output or str(CASE_DATA_DIR / "fictional_cases.jsonl")
    cache_count = len(list(CACHE_DIR.glob("*.json")))
    print(f"Fictional Case Generator")
    print(f"  Model:      {LLM_MODEL}")
    print(f"  Categories: {categories}")
    print(f"  Per cat:    {per_category} (+{remainder} extra in first)")
    print(f"  Output:     {out_path}")
    print(f"  Dry run:    {args.dry_run}")
    print(f"  Resume:     {args.resume}")
    print(f"  Disk cache: {cache_count} cases in {CACHE_DIR}")

    rng = random.Random(42)
    all_cases = []
    total_generated = 0
    done_per_cat: dict[str, int] = {}

    if args.resume and os.path.exists(out_path):
        with open(out_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        c = json.loads(line)
                        all_cases.append(c)
                        done_per_cat[c["category"]] = done_per_cat.get(c["category"], 0) + 1
                    except Exception:
                        pass
        total_generated = len(all_cases)
        print(f"  Resuming:   {total_generated} cases already done: {done_per_cat}")
        out_file = open(out_path, "a", encoding="utf-8")
    else:
        # Open JSONL for incremental writes — each case saved immediately (crash-safe)
        out_file = open(out_path, "w", encoding="utf-8")

    try:
        for ci, category in enumerate(categories):
            template = CATEGORY_TEMPLATES[category]
            count_this = per_category + (1 if ci < remainder else 0)
            already_done = done_per_cat.get(category, 0)
            remaining = count_this - already_done
            if remaining <= 0:
                print(f"\n── {category.upper()} ({count_this} cases) — SKIPPED (already complete) ──")
                continue
            print(f"\n── {category.upper()} ({count_this} cases, {already_done} done, {remaining} remaining) ──")

            for i in range(already_done, count_this):
                case_id = f"{category}_{uuid.uuid4().hex[:8]}"
                print(f"  [{total_generated+1}/{args.count}] {case_id}", end=" ", flush=True)

                if args.dry_run:
                    first, last = fictional_name(case_id)
                    print(f"[dry-run] {first} {last}, {fictional_city(case_id)}, {fictional_date(case_id)}")
                    stub = {
                        "case_id": case_id, "category": category,
                        "charge": template["charge"], "primary_statute": template["statute"],
                        "defendant_name": f"{first} {last}",
                        "incident_date": fictional_date(case_id),
                        "jurisdiction_city": fictional_city(case_id),
                        "narrative": "[dry-run stub]",
                        "is_fictional": True,
                        "disclaimer": DISCLAIMER,
                    }
                    out_file.write(json.dumps(stub, ensure_ascii=False) + "\n")
                    out_file.flush()
                    all_cases.append(stub)
                    total_generated += 1
                    continue

                case = generate_case(case_id, category, template, rng)
                if case:
                    print(f"✓ ({len(case['narrative'])} chars)")
                    out_file.write(json.dumps(case, ensure_ascii=False) + "\n")
                    out_file.flush()
                    all_cases.append(case)
                    total_generated += 1
                else:
                    print("✗ (generation failed)")

                time.sleep(1.0)  # Rate limit (reduced from 1.5 — keep-alive helps)
    finally:
        out_file.close()

    print(f"\n✓ Generated {total_generated} cases → {out_path}")

    # Ingest to DB
    if args.ingest_db and not args.dry_run and all_cases:
        print(f"Ingesting {len(all_cases)} cases to PostgreSQL...")
        inserted = ingest_to_db(all_cases)
        print(f"  Inserted: {inserted} rows")

    # Summary
    by_category = {}
    for c in all_cases:
        by_category.setdefault(c["category"], 0)
        by_category[c["category"]] += 1
    print("\nBreakdown:")
    for cat, n in by_category.items():
        print(f"  {cat}: {n}")
    flagged = sum(1 for c in all_cases if c.get("guardrail_triggered"))
    if flagged:
        print(f"\n⚠ Guardrail triggered in {flagged} cases (content redacted)")


if __name__ == "__main__":
    main()
