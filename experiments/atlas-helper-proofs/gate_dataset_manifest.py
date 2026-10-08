"""DATA-01: freeze verified pre-labeled rows; no generated ground truth."""
import hashlib
import json
from pathlib import Path

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(",",":"),allow_nan=False).encode()

def freeze(records, registry, label_revision, taxonomy_revision, seed=7):
    if not records or not registry or not label_revision or not taxonomy_revision:
        raise ValueError("MISSING_DATASET_CONTRACT")
    if sorted(registry.values())!=list(range(len(registry))):
        raise ValueError("INVALID_FEATURE_REGISTRY")
    groups={}
    seen=set()
    for row in records:
        for name in ("row_id","query_group","label","source_revision","features","presence_mask"):
            if name not in row: raise ValueError("MISSING_FIELD:"+name)
        if row["row_id"] in seen: raise ValueError("DUPLICATE_ROW")
        seen.add(row["row_id"])
        if not row["query_group"] or not row["source_revision"]:
            raise ValueError("UNQUALIFIED_ROW")
        if len(row["features"])!=len(registry) or len(row["presence_mask"])!=len(registry):
            raise ValueError("FEATURE_WIDTH")
        groups.setdefault(row["query_group"],[]).append(row["row_id"])
    if len(groups)<3: raise ValueError("INSUFFICIENT_GROUPS")
    # Hash order, not alphabetical order, spreads groups reproducibly across partitions.
    ordered=sorted(groups,key=lambda g:hashlib.sha256((str(seed)+":"+g).encode()).hexdigest())
    train,calibrate,test=[],[],[]
    for i,g in enumerate(ordered):
        (train if i%3==0 else calibrate if i%3==1 else test).extend(groups[g])
    manifest={"schema":"atlas.cpu-labeled-dataset.v1","records_sha256":"sha256:"+hashlib.sha256(canonical(sorted(records,key=lambda r:r["row_id"]))).hexdigest(),
              "registry_sha256":"sha256:"+hashlib.sha256(canonical(registry)).hexdigest(),
              "label_revision":label_revision,"taxonomy_revision":taxonomy_revision,"seed":seed,
              "train":sorted(train),"calibration":sorted(calibrate),"test":sorted(test),
              "canonical_authority":False}
    manifest["manifest_sha256"]="sha256:"+hashlib.sha256(canonical(manifest)).hexdigest()
    return manifest

def write_once(path, manifest):
    path=Path(path)
    with path.open("x",encoding="utf-8") as f: json.dump(manifest,f,sort_keys=True,indent=2)
    actual=json.loads(path.read_text())
    checksum=actual.pop("manifest_sha256")
    if "sha256:"+hashlib.sha256(canonical(actual)).hexdigest()!=checksum:
        raise ValueError("MANIFEST_READBACK_MISMATCH")
