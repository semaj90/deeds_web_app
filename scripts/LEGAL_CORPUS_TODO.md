# Legal Corpus Expansion — TODO / Research Backlog

> **As of March 24, 2026** — Current corpus: 867 glossary terms (100% embedded, Qdrant indexed) + 7,825 SCOTUS court opinions (100% embedded, Qdrant indexed).
> All inserts target: PostgreSQL `legal_ai_db` on `127.0.0.1:5434`, user `legal_admin`
> Ingest script: `scripts/ingest_court_opinions.py`
> Fetch script: `scripts/fetch_court_datasets.py`
> Target table for constitutions/statutes: `court_opinions` (or new `legal_statutes` table — see §5)

---

## SECTION 1 — STATE CONSTITUTIONS
> Path: `scripts/court_data/constitutions/`
> Insert table: `court_opinions` with `jurisdiction_level='state'`, `source='constitution'`, `practice_area='Constitutional'`

| # | State | Action | URL |
|---|-------|--------|-----|
| 1 | Alabama | `[ ]` Fetch & ingest | https://ballotpedia.org/Alabama_Constitution |
| 2 | Alaska | `[ ]` | https://ltgov.alaska.gov/information/alaskas-constitution/ |
| 3 | Arizona | `[ ]` | https://azleg.gov/constitution/ |
| 4 | Arkansas | `[ ]` | https://portal.arkansas.gov/ark-constitution/ |
| 5 | California | `[ ]` | https://leginfo.legislature.ca.gov/faces/codes.xhtml |
| 6 | Colorado | `[ ]` | https://leg.colorado.gov/colorado-constitution |
| 7 | Connecticut | `[ ]` | https://www.cga.ct.gov/asp/Content/constitutions/CTConstitution.htm |
| 8 | Delaware | `[ ]` | https://delcode.delaware.gov/constitution/ |
| 9 | Florida | `[ ]` | https://www.flsenate.gov/Laws/Constitution |
| 10 | Georgia | `[ ]` | https://law.georgia.gov/constitution-georgia |
| 11 | Hawaii | `[ ]` | https://www.capitol.hawaii.gov/constitution/ |
| 12 | Idaho | `[ ]` | https://legislature.idaho.gov/statutesrules/idconst/ |
| 13 | Illinois | `[ ]` | https://www.ilga.gov/commission/lrb/conmain.htm |
| 14 | Indiana | `[ ]` | https://iga.in.gov/legislative/laws/2023/ic/titles/0001/ |
| 15 | Iowa | `[ ]` | https://www.legis.iowa.gov/law/iowaCode/constitution |
| 16 | Kansas | `[ ]` | http://kslegislature.org/li/b2023_24/statute/000_constitution/ |
| 17 | Kentucky | `[ ]` | https://legislature.ky.gov/Law/Constitution/ |
| 18 | Louisiana | `[ ]` | https://www.legis.la.gov/legis/Law.aspx?d=202477 |
| 19 | Maine | `[ ]` | https://legislature.maine.gov/legis/statutes/const/ |
| 20 | Maryland | `[ ]` | https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=ccl |
| 21 | Massachusetts | `[ ]` | https://malegislature.gov/Laws/Constitution |
| 22 | Michigan | `[ ]` | https://legislature.mi.gov/doc.aspx?mcl-constitution |
| 23 | Minnesota | `[ ]` | https://www.revisor.mn.gov/constitution/ |
| 24 | Mississippi | `[ ]` | https://www.sos.ms.gov/content/documents/elections/Mississippi%20Constitution.pdf |
| 25 | Missouri | `[ ]` | https://revisor.mo.gov/main/PageSelect.aspx?section=const |
| 26 | Montana | `[ ]` | https://leg.mt.gov/bills/mca_toc/Constitution.htm |
| 27 | Nebraska | `[ ]` | https://nebraskalegislature.gov/laws/articles.php |
| 28 | Nevada | `[ ]` | https://www.leg.state.nv.us/Const/NvConst.html |
| 29 | New Hampshire | `[ ]` | https://www.nh.gov/glance/constitution.htm |
| 30 | New Jersey | `[ ]` | https://www.njleg.state.nj.us/laws/constitution |
| 31 | New Mexico | `[ ]` | https://www.nmlegis.gov/Constitution/ |
| 32 | New York | `[ ]` | https://www.nysenate.gov/legislation/laws/CNS |
| 33 | North Carolina | `[ ]` | https://www.ncleg.gov/Laws/Constitution/Constitution |
| 34 | North Dakota | `[ ]` | https://www.legis.nd.gov/information/statutes/cent-code/constitution |
| 35 | Ohio | `[ ]` | https://codes.ohio.gov/ohio-constitution |
| 36 | Oklahoma | `[ ]` | https://www.oscn.net/applications/oscn/Index.asp?level=1&type=CONSTITUTION |
| 37 | Oregon | `[ ]` | https://www.oregonlegislature.gov/bills_laws/Pages/oregonlaws.aspx |
| 38 | Pennsylvania | `[ ]` | https://www.legis.state.pa.us/cfdocs/legis/LI/Public/cons_index.cfm |
| 39 | Rhode Island | `[ ]` | http://webserver.rilin.state.ri.us/RiConstitution/ |
| 40 | South Carolina | `[ ]` | https://www.scstatehouse.gov/scconstitution/scconst.php |
| 41 | South Dakota | `[ ]` | https://sdlegislature.gov/Statutes/Constitution |
| 42 | Tennessee | `[ ]` | https://www.tn.gov/content/dam/tn/attorneygeneral/documents/Tennessee_State_Constitution.pdf |
| 43 | Texas | `[ ]` | https://statutes.capitol.texas.gov/Docs/CN/htm/CN.1.htm |
| 44 | Utah | `[ ]` | https://le.utah.gov/xcode/Constitution/art01/art01.htm |
| 45 | Vermont | `[ ]` | https://legislature.vermont.gov/statutes/constitution-of-the-state-of-vermont/ |
| 46 | Virginia | `[ ]` | https://law.lis.virginia.gov/constitution/ |
| 47 | Washington | `[ ]` | https://leg.wa.gov/LawsAndAgencyRules/Pages/constitution.aspx |
| 48 | West Virginia | `[ ]` | https://code.wvlegislature.gov/wv-constitution/ |
| 49 | Wisconsin | `[ ]` | https://docs.legis.wisconsin.gov/document/statutes/Constitution |
| 50 | Wyoming | `[ ]` | https://wyoleg.gov/statutes/compress/article1.pdf |
| 51 | **District of Columbia** | `[ ]` | https://code.dccouncil.gov/us/dc/council/code/titles/1/chapters/1/ |
| 52 | **Puerto Rico** | `[ ]` | https://www.lexjuris.com/lexcons.htm |
| 53 | **US Virgin Islands** | `[ ]` | https://www.vi.gov/government/constitution.html |
| 54 | **Guam** | `[ ]` | https://www.guamlegislature.com/organic-act-of-guam/ |

**How to ingest:**
```bash
# 1. Fetch text (use legal-document-scraper.py or wget)
python scripts/legal-document-scraper.py --url <URL> --output scripts/court_data/constitutions/alabama.txt

# 2. Write a JSONL wrapper line:
# {"title":"Alabama Constitution","jurisdiction_level":"state","jurisdiction_state":"Alabama","practice_area":"Constitutional","source":"constitution","opinion_text":"<full text>"}

# 3. Ingest:
python scripts/ingest_court_opinions.py scripts/court_data/constitutions/alabama.jsonl --source constitution
```

---

## SECTION 2 — FEDERAL STATUTES & RULES
> Path: `scripts/court_data/federal_statutes/`

| Priority | Document | Source | Notes |
|----------|----------|--------|-------|
| 🔴 HIGH | **US Constitution** (full text + amendments) | https://constitution.congress.gov/constitution/ | Already partially available via SCOTUS corpus |
| 🔴 HIGH | **Model Penal Code (MPC)** | ALI — paid, but summaries at https://www.ali.org/publications/show/model-penal-code/ | Foundation of ALL state criminal codes |
| 🔴 HIGH | **Federal Sentencing Guidelines Manual (USSG)** | https://www.ussc.gov/guidelines/2023-guidelines-manual | Full PDF via USSC — covers aggravating factors §3A-§3D |
| 🔴 HIGH | **18 U.S.C. — Federal Crimes** | https://uscode.house.gov/view.xhtml?path=/prelim@title18&edition=prelim | Armed robbery, conspiracy, fraud, RICO |
| 🟡 MED | **Federal Rules of Evidence (FRE)** | https://www.rulesofevidence.org/ | Hearsay exceptions, Daubert, authentication |
| 🟡 MED | **Federal Rules of Criminal Procedure (FRCP)** | https://www.law.cornell.edu/rules/frcrmp | Arrest, indictment, plea, trial procedures |
| 🟡 MED | **42 U.S.C. § 1983** (Civil Rights Act) | https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-section1983 | Every § 1983 civil rights claim |
| 🟡 MED | **Americans with Disabilities Act (ADA)** | https://www.ada.gov/law-and-regs/ada/ | Disability discrimination cases |
| 🟡 MED | **Title VII Civil Rights Act 1964** | https://www.eeoc.gov/statutes/title-vii-civil-rights-act-1964 | Employment discrimination |
| 🟢 LOW | **Uniform Commercial Code (UCC)** | https://www.law.cornell.edu/ucc | Verbal contracts, commercial paper |
| 🟢 LOW | **Restatement (Second) Contracts** | ALI — public summaries at https://www.ali.org | Offer, acceptance, consideration doctrine |
| 🟢 LOW | **Restatement (Second) Torts** | ALI | Products liability, negligence, causation |

---

## SECTION 3 — STATE CRIMINAL CODES (Top Priority States)
> Covers: mens rea definitions, crime classifications, aggravating factor statutes

| State | Code | Key URL | Focus |
|-------|------|---------|-------|
| California | Penal Code | https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN | PC 187 (murder), PC 245 (assault), PC 1000 (diversion) |
| Texas | Penal Code Title 5 | https://statutes.capitol.texas.gov/Docs/PE/htm/PE.1.htm | §6.01-§6.04 culpable mental states |
| New York | Penal Law | https://www.nysenate.gov/legislation/laws/PEN | Art 125 homicide, Art 130 sex offenses |
| Florida | Title XLVI Ch 775-896 | http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Index&Title_Request=XLVI | §775 criminal penalties |
| Illinois | 720 ILCS 5 (Crim Code) | https://www.ilga.gov/legislation/ilcs/ilcs4.asp?ActID=1987 | Art 4 mental state, Art 7 defenses |
| **Model Penal Code** | §2.02 | ALI | Canonical mens rea: purposely/knowingly/recklessly/negligently |

---

## SECTION 4 — COURT OPINIONS (CourtListener — Needs Free API Token)
> Register at: https://www.courtlistener.com/sign-in/
> Set: `$env:CL_API_TOKEN = "your_token_here"`
> Then run: `python scripts/fetch_court_datasets.py download cl --jurisdiction <slug> --limit 2000`

| Priority | Court Slug | Court Name | Focus |
|----------|-----------|------------|-------|
| 🔴 HIGH | `ca9` | 9th Circuit | CA, WA, OR, AZ, HI, AK — criminal + civil rights |
| 🔴 HIGH | `ca5` | 5th Circuit | TX, LA, MS — death penalty, immigration |
| 🔴 HIGH | `cal` | California Supreme | State criminal law, 4th/5th amendment |
| 🔴 HIGH | `calctapp` | CA Court of Appeal | Vast volume, mens rea, sentencing |
| 🟡 MED | `ca2` | 2nd Circuit | NY, CT, VT — securities, white collar |
| 🟡 MED | `ca11` | 11th Circuit | FL, GA, AL — civil rights, criminal |
| 🟡 MED | `ny` | NY Court of Appeals | Highest NY court — contract, tort |
| 🟡 MED | `tex` | Texas Supreme Court | Contract, property |
| 🟡 MED | `cadc` | DC Circuit | Administrative law, federal agencies |
| 🟡 MED | `dcd` | D.D.C. | Federal criminal, civil rights |
| 🟢 LOW | `ca1`-`ca11` | All Federal Circuits | Broad federal criminal coverage |
| 🟢 LOW | `fla` | Florida Supreme | Drug crimes, DUI, stand-your-ground |
| 🟢 LOW | `ill` | Illinois Supreme | Chicago-area criminal patterns |

---

## SECTION 5 — NEW DB TABLES NEEDED

```sql
-- Run: python scripts/ingest_court_opinions.py (existing table works for now)
-- For constitutions + statutes a dedicated table improves filtering:

CREATE TABLE legal_statutes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  document_type      VARCHAR(50) CHECK (document_type IN
                       ('constitution','statute','rule','regulation','code',
                        'treaty','ordinance','model_code')),
  jurisdiction_level VARCHAR(20),
  jurisdiction_state VARCHAR(80),
  chapter_section    VARCHAR(200),    -- "Art. I § 8", "18 U.S.C. § 924(c)"
  full_text          TEXT,
  source_url         TEXT,
  effective_date     DATE,
  embedding          VECTOR(768),
  metadata           JSONB DEFAULT '{}'::jsonb,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ON legal_statutes USING ivfflat (embedding vector_cosine_ops) WITH (lists=50);
CREATE INDEX ON legal_statutes (document_type);
CREATE INDEX ON legal_statutes (jurisdiction_state);
CREATE INDEX ON legal_statutes USING gin(to_tsvector('english', full_text));
```

**Migration file to create:** `drizzle/manual/0008_legal_statutes.sql`

---

## SECTION 6 — LEGAL REFERENCE DATASETS (HuggingFace)

| Dataset | HF ID | Notes | Command |
|---------|-------|-------|---------|
| Legal Summarization | `HFforLegal/legal-summarization` | 430k opinion+summary pairs | `fetch_court_datasets.py download hf --dataset HFforLegal/legal-summarization --limit 10000` |
| CaseHOLD | `casehold/casehold` | ⚠ Legacy script — needs parquet mirror | Use LexGLUE instead |
| Pile of Law (federal) | `pile-of-law/pile-of-law` | 256GB total — use opinions_federal subset | `--subset opinions_federal --limit 50000` (large!) |
| CourtListener HF export | `jncraton/court-listener-opinions` | 8M metadata rows, links to full text | Good for citation data |
| EURLEX Multi-label | `coastalcph/lex_glue` | `eurlex` subset — EU law | `--subset eurlex --limit 5000` |

---

## SECTION 7 — SPECIALIZED LEGAL CORPORA

| Topic | Source | Priority | Notes |
|-------|--------|----------|-------|
| **Death Penalty cases** | CourtListener `ca9`, `ca5` + SCOTUS | 🔴 HIGH | 8th Amendment, proportionality |
| **Miranda / Interrogation** | SCOTUS corpus already has some | 🟡 MED | Search existing: `analyze_legal_concepts.py --concept miranda` |
| **Sentencing Guidelines** | USSC Guidelines PDF | 🔴 HIGH | §3A (victim), §3B (role), §3C (obstruction), §5K departures |
| **DUI/Traffic Law** | CourtListener `fla`, `cal`, `calctapp` | 🟡 MED | Implied consent, per se BAC |
| **Immigration courts** | CourtListener `ca9`, BIA | 🟡 MED | Asylum, deportation, credible fear |
| **DOJ Press Releases** | https://www.justice.gov/news | 🟡 MED | Only 25 rows now — RSS limited; use DOJ bulk data |
| **Tribal Law** | https://triballaw.tribal.edu/ | 🟢 LOW | Tribal sovereignty, ICWA |
| **International Law** | UN Treaty Collection | 🟢 LOW | jus cogens, UNCLOS, FSIA |
| **DOJ PACER data** | https://www.pacer.gov | 🟢 LOW | Requires $0.10/page fee |

---

## SECTION 8 — GLOSSARY ENHANCEMENTS

Current: **867 terms**, 100% embedded (PostgreSQL pgvector + Qdrant `legal_glossary` ✅)

| Task | Terms to Add | Priority |
|------|-------------|----------|
| `[x]` ~~Add Model Penal Code §2.02 culpability levels verbatim~~ | batch_10.cjs — 23 terms | ✅ DONE |
| `[x]` ~~Add USSG aggravating/mitigating factor terms~~ | batch_11.cjs — 24 terms | ✅ DONE |
| `[x]` ~~Add causation doctrine terms batch~~ | batch_12.cjs — 14 terms | ✅ DONE |
| `[x]` ~~Add contract formation terms batch~~ | batch_13.cjs — 16 terms | ✅ DONE |
| `[x]` ~~Add international law terms~~ | batch_14.cjs — 16 terms | ✅ DONE |
| `[x]` ~~Add Native American law terms~~ | Already in batches 1-9 | ✅ DONE |
| `[x]` ~~Index glossary into Qdrant collection `legal_glossary`~~ | 867 pts indexed | ✅ DONE |

---

## SECTION 9 — SCRIPTS TO CREATE

| Script | Purpose | Priority |
|--------|---------|----------|
| `[ ]` `scripts/fetch_state_constitutions.py` | Scrape 50 state constitution pages → JSONL | 🔴 HIGH |
| `[ ]` `scripts/ingest_legal_statutes.py` | Ingest constitutions/statutes into `legal_statutes` table | 🔴 HIGH |
| `[x]` ~~`scripts/index_glossary_qdrant.py`~~ | Push glossary terms + embeddings into Qdrant `legal_glossary` | ✅ DONE |
| `[ ]` `scripts/similarity_cluster.py` | Cluster 7825 opinions by embedding (k-means or HDBSCAN) | 🟡 MED |
| `[ ]` `scripts/extract_citations.py` | Parse US Reporter citations (e.g. "347 U.S. 67") from opinion text | 🟢 LOW |
| `[ ]` `scripts/build_citation_graph.py` | Build case citation network (A cited B) → Neo4j or pgvector | 🟢 LOW |

---

## SECTION 10 — QUICK-START COMMANDS

```powershell
# ── Run now (all prerequisites met) ──

# 1. Index 7825 opinions into Qdrant with concept tags
.\.venv\Scripts\python.exe scripts/index_court_opinions_qdrant.py

# 2. Analyze causation concepts
.\.venv\Scripts\python.exe scripts/analyze_legal_concepts.py --group causation --top 5

# 3. Analyze mens rea
.\.venv\Scripts\python.exe scripts/analyze_legal_concepts.py --group mens_rea --top 5

# 4. Analyze aggravating enhancers + export CSV
.\.venv\Scripts\python.exe scripts/analyze_legal_concepts.py --group aggravating_enhancers --export

# 5. Run all 28 concepts with cross-area similarities
.\.venv\Scripts\python.exe scripts/analyze_legal_concepts.py --similarities --export

# ── Needs CL_API_TOKEN ──
$env:CL_API_TOKEN = "your_token"
.\.venv\Scripts\python.exe scripts/fetch_court_datasets.py download cl --jurisdiction ca9 --limit 2000
.\.venv\Scripts\python.exe scripts/ingest_court_opinions.py scripts/court_data/courtlistener__ca9.jsonl

# ── Needs new script (fetch_state_constitutions.py) ──
# Once written: python scripts/fetch_state_constitutions.py --all
# Then: python scripts/ingest_court_opinions.py scripts/court_data/constitutions/*.jsonl --source constitution
```

---

## SECTION 11 — PRIORITY ORDER (RECOMMENDED SEQUENCE)

1. `[x]` ~~7,825 SCOTUS opinions ingested with embeddings~~ ✅ **DONE**
2. `[x]` ~~867 glossary terms at 100% embedding coverage~~ ✅ **DONE**
3. `[ ]` **Run Qdrant indexer** → `python scripts/index_court_opinions_qdrant.py`
4. `[ ]` **Run concept analyzer** → `python scripts/analyze_legal_concepts.py --similarities --export`
5. `[ ]` **Create `legal_statutes` table** → apply `drizzle/manual/0008_legal_statutes.sql`
6. `[ ]` **Build `fetch_state_constitutions.py`** → auto-scrape 50+DC constitutions
7. `[ ]` **Get CourtListener token** → https://www.courtlistener.com/sign-in/ (free) → ca9, ca5, cal
8. `[ ]` **Ingest USSG Sentencing Guidelines** → aggravating factors §3A chapter
9. `[x]` ~~**Add MPC §2.02 mens rea levels** to glossary (batch_10.cjs)~~ ✅ **DONE** (+4 more batches)
10. `[x]` ~~**Index glossary into Qdrant** → `scripts/index_glossary_qdrant.py`~~ ✅ **DONE** (867 pts)
