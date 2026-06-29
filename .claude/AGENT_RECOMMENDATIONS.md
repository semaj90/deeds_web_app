# AGENT_RECOMMENDATIONS.md

## Recommendation Pass Order
1. Check Redis/BitFrost cache
2. Check telemetry failures
3. Retrieve semantic neighbors
4. Retrieve graph neighbors
5. Retrieve episodic memory
6. Validate schemas
7. Decide local deep research if confidence < threshold

## Confidence Rules
>=0.85 : answer + patch
0.60-0.85 : answer + recommendations
<0.60 : local deep research required

## Required Outputs
- confidence
- retrieved aliases
- graph path
- telemetry evidence
- replay proof status
