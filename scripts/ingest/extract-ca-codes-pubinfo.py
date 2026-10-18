"""Extract California code sections from the official leginfo bulk feed (pubinfo_*.zip).

Source: https://downloads.leginfo.legislature.ca.gov/ (published by the Legislature for reuse).
Reads LAW_SECTION_TBL.dat + referenced .lob files only; writes one JSON object per current section.

  python -I extract-ca-codes-pubinfo.py --zip pubinfo_2025.zip --out sections.jsonl --codes PEN,HSC,CIV

Of several ACTIVE versions of one section, keeps the latest effective_date not after today, else the earliest future one.
"""
import argparse, datetime, hashlib, html, json, re, zipfile

COLS = ["id", "law_code", "section_num", "op_statutes", "op_chapter", "op_section", "effective_date",
        "version_id", "division", "title", "part", "chapter", "article", "history", "content_lob",
        "active_flag", "trans_uid", "trans_update"]


def cell(v):
    if v == "NULL":
        return None
    return v[1:-1] if len(v) >= 2 and v[0] == "`" and v[-1] == "`" else v


def to_text(xml):
    t = re.sub(r"<\s*br\s*/?>", "\n", xml, flags=re.I)
    t = re.sub(r"</\s*(p|div|li|caml:[A-Za-z]+)\s*>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    lines = [re.sub(r"[ \t ]+", " ", ln).strip() for ln in t.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--codes", required=True)
    a = ap.parse_args()
    want = {c.strip().upper() for c in a.codes.split(",") if c.strip()}
    today = datetime.date.today().isoformat()
    best = {}
    with zipfile.ZipFile(a.zip) as z:
        with z.open("LAW_SECTION_TBL.dat") as f:
            for raw in f:
                parts = raw.decode("utf-8", "replace").rstrip("\n").split("\t")
                if len(parts) != len(COLS):
                    continue
                r = dict(zip(COLS, (cell(p) for p in parts)))
                if r["law_code"] not in want or r["active_flag"] != "Y" or not r["content_lob"]:
                    continue
                key = (r["law_code"], r["section_num"])
                eff = (r["effective_date"] or "0000-00-00")[:10]
                r["_eff"] = eff
                cur = best.get(key)
                if cur is None:
                    best[key] = r
                    continue
                def rank(x):
                    e = x["_eff"]
                    return (e <= today, e if e <= today else "", "" if e <= today else e[::-1])
                if (r["_eff"] <= today, r["_eff"]) > (cur["_eff"] <= today, cur["_eff"]) if r["_eff"] <= today or cur["_eff"] <= today else r["_eff"] < cur["_eff"]:
                    best[key] = r
        n = 0
        with open(a.out, "w", encoding="utf-8") as out:
            for (code, sec), r in sorted(best.items()):
                try:
                    xml = z.read(r["content_lob"]).decode("utf-8", "replace")
                except KeyError:
                    continue
                text = to_text(xml)
                if not text:
                    continue
                out.write(json.dumps({
                    "law_code": code, "section_num": sec.rstrip("."), "text": text,
                    "sha256": hashlib.sha256(xml.encode("utf-8")).hexdigest(),
                    "effective_date": r["effective_date"][:10] if r["effective_date"] else None,
                    "op_statutes": r["op_statutes"], "op_chapter": r["op_chapter"], "op_section": r["op_section"],
                    "division": r["division"], "title": r["title"], "part": r["part"], "chapter": r["chapter"],
                    "article": r["article"], "history": r["history"], "version_id": r["version_id"],
                    "source_id": r["id"],
                }, ensure_ascii=False) + "\n")
                n += 1
    print(f"wrote {n} sections for {sorted(want)}")


if __name__ == "__main__":
    main()
