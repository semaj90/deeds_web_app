"""Frozen-group split, masked CPU learning baseline; no data store/model write."""
from collections import defaultdict
from math import isfinite

def group_split(rows, group_ids, ratio=0.25):
    if len(rows)!=len(group_ids) or len(rows)<4 or not 0<ratio<1:
        raise ValueError("INVALID_SPLIT")
    groups=sorted(set(group_ids))
    if len(groups)<2 or any(not isinstance(g,str) or not g for g in group_ids):
        raise ValueError("INSUFFICIENT_GROUPS")
    held=max(1,min(len(groups)-1,round(len(groups)*ratio)))
    test=set(groups[-held:])
    train_idx=tuple(i for i,g in enumerate(group_ids) if g not in test)
    test_idx=tuple(i for i,g in enumerate(group_ids) if g in test)
    return train_idx,test_idx

def impute_train_only(rows, masks, train_idx):
    if not rows or len(rows)!=len(masks) or not train_idx:
        raise ValueError("INVALID_INPUT")
    width=len(rows[0])
    if width!=25 or any(len(r)!=width or len(m)!=width for r,m in zip(rows,masks)):
        raise ValueError("INVALID_WIDTH")
    means=[]
    for j in range(width):
        observed=[rows[i][j] for i in train_idx if masks[i][j]==1]
        if any(not isfinite(x) for x in observed):
            raise ValueError("NONFINITE_VALUE")
        means.append(sum(observed)/len(observed) if observed else 0.0)
    normalized=[]
    for row,mask in zip(rows,masks):
        if any(x not in (0,1) for x in mask):
            raise ValueError("INVALID_MASK")
        normalized.append(tuple(float(row[j]) if mask[j] else means[j] for j in range(width)))
    return tuple(normalized),tuple(means)

def classification_report(true, predicted, unknown=-1):
    if len(true)!=len(predicted) or not true:
        raise ValueError("INVALID_PREDICTIONS")
    labels=sorted(set(true)-{unknown})
    metrics={}
    for label in labels:
        tp=sum(a==label and b==label for a,b in zip(true,predicted))
        fp=sum(a!=label and b==label for a,b in zip(true,predicted))
        fn=sum(a==label and b!=label for a,b in zip(true,predicted))
        metrics[str(label)]=(2*tp/(2*tp+fp+fn)) if (2*tp+fp+fn)>0 else 0.0
    return {"macro_f1":sum(metrics.values())/max(1,len(metrics)),
            "abstention_rate":sum(x==unknown for x in predicted)/len(predicted),
            "per_class_f1":metrics, "status":"EVALUATION_ONLY"}
