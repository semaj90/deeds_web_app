# FEATURE_DID_YOU_MEAN_SELF_PROMPTING

Best practices for implementing "Did You Mean" self‑prompting in the app

## Goals
- Reduce friction by surfacing helpful corrections/suggestions without interrupting the user.
- Keep suggestions relevant, accurate, and respectful of privacy.
- Provide easy correction/feedback paths and measure impact.

## UX guidelines
- Show suggestions only when confidence is below a high threshold; avoid false positives.
- Present 1–3 concise alternatives (top‑k). Prefer the single best suggestion prominently.
- Highlight the changed parts (bold/underline) so users see why it was suggested.
- Let users accept with one click/tap, or ignore/dismiss the suggestion easily.
- Maintain keyboard accessibility and screen‑reader friendly labels.
- Avoid modal dialogs; use inline suggestions or unobtrusive banners.

## Matching & ranking
- Normalize queries: lowercase, trim whitespace, collapse punctuation.
- Use layered matching: exact match → synonyms/stemming → fuzzy edit distance → semantic suggestions.
- Configure confidence thresholds and fallback behavior (no suggestion vs "did you mean…").
- Keep a small blacklist to avoid suggesting harmful or irrelevant corrections.

## Architecture & performance
- Prefer client-side lightweight checking (spell/grammar + lookup) for instant feedback; do server claims/semantic checks asynchronously.
- Debounce input (e.g., 300–500 ms) to reduce churn and API calls.
- Cache recent suggestions per user/session to avoid repeated work.
- Set strict timeouts for suggestion services and provide graceful fallback.

## Privacy & security
- Avoid sending raw private text to external services when possible; anonymize or hash sensitive parts.
- Document where queries are sent and allow opt‑out if required by policy.
- Sanitize outputs before rendering to prevent XSS or injection.

## Telemetry & iteration
- Track accept/ignore rates, suggestion latency, and conversion metrics.
- Run A/B tests to validate thresholds and UI patterns.
- Log examples (with redaction) for model/model‑rule improvement.

## Monitoring & error handling
- Surface degradations (e.g., “suggestions temporarily unavailable”) gracefully.
- Retry sensible failures with exponential backoff; fail fast on auth errors.

## Testing
- Maintain unit tests for normalization and ranking logic.
- Include integration tests that assert correctness on representative queries and edge cases.
- Validate accessibility and localization behaviors in CI.

## Configuration example (conceptual)
```yaml
didYouMean:
    enabled: true
    clientDebounceMs: 350
    maxSuggestions: 2
    confidenceThreshold: 0.75
    serverTimeoutMs: 500
```

Keep the UX minimal and configurable so thresholds and presentation can be tuned from metrics and user feedback.
