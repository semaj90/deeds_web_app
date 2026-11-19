# e2e-error-intelligence-kanban

Created: 2026-11-19

Turn Playwright and server failures into one deduplicated, feature-labelled issue per defect, with a verified server identity behind every run. Scope and status are in `tasks.md`.

Boundaries: no writes to `legal_ai_db` without an explicit approval step. Kanban state and issue disposition stay separate. Log files are immutable evidence; PostgreSQL is the issue store once approved.
