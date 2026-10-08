"""CLS-01: held-out confidence threshold selection, explicit UNKNOWN abstention."""
import math

def calibrate(examples, max_false_accept_rate=0.05):
    # Each item: confidence of *predicted* class, predicted label, actual label.
    if not examples or not 0<=max_false_accept_rate<=1: raise ValueError("INVALID_CALIBRATION")
    for c,p,y in examples:
        if not math.isfinite(c) or not 0<=c<=1 or not isinstance(p,str) or not isinstance(y,str):
            raise ValueError("INVALID_EXAMPLE")
    choices=sorted({c for c,_,_ in examples}|{1.0,0.0})
    selected=None
    for t in choices:
        accepted=[(p,y) for c,p,y in examples if c>=t]
        incorrect=sum(p!=y for p,y in accepted)
        risk=incorrect/len(accepted) if accepted else 0.0
        if risk<=max_false_accept_rate:
            candidate={"threshold":t,"coverage":len(accepted)/len(examples),
                       "observed_false_accept_rate":risk,"calibration_n":len(examples)}
            if selected is None or candidate["coverage"]>selected["coverage"]:
                selected=candidate
    return {"status":"CALIBRATION_PROPOSAL","metrics":selected,
            "claim":"EMPIRICAL_ONLY_NOT_STATISTICAL_GUARANTEE"}

def predict(confidence,label,calibration):
    if not math.isfinite(confidence) or not 0<=confidence<=1: raise ValueError("INVALID_CONFIDENCE")
    if not label: raise ValueError("INVALID_LABEL")
    accept=confidence>=calibration["metrics"]["threshold"]
    return {"label":label if accept else "UNKNOWN","status":"PROPOSAL_ONLY" if accept else "ABSTAIN",
            "reason":"LOW_CONFIDENCE" if not accept else "CALIBRATION_THRESHOLD_MET"}
