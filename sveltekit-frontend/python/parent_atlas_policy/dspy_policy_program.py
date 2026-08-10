"""EXPERIMENT ONLY: DSPy program-level routing optimization.

This is intentionally not imported by production runtime. Optimize against held-out Parent Atlas
metrics (valid action, compile/test success, latency), then compare with the deterministic baseline.
"""
try:
    import dspy
except ImportError as exc:
    raise SystemExit('Install DSPy only in the experiment environment: pip install dspy') from exc

class RouteDecision(dspy.Signature):
    """Choose one allowed Parent Atlas action from a finite state and budget."""
    state: str = dspy.InputField()
    allowed_actions: list[str] = dspy.InputField()
    evidence_summary: str = dspy.InputField()
    action: str = dspy.OutputField()

program = dspy.Predict(RouteDecision)
