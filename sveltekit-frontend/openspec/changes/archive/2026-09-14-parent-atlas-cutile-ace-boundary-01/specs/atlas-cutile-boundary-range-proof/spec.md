## ADDED Requirements

### Requirement: The signed-division workaround's safety is proven against the real field bound
The system SHALL state the actual declared bit-width bound of any field cast to a narrower or
differently-signed type for a compiler-workaround purpose, and SHALL NOT rely on a qualitative
claim (e.g. "non-negative") alone when a quantitative overflow risk exists.

#### Scenario: The uint16 bound is stated numerically against INT32_MAX
- **WHEN** `pagerankQuantized`/`recency` are cast from their loaded width to `int32` before
  division
- **THEN** the finding record states both the field's real maximum (65535) and `INT32_MAX`
  (2147483647), demonstrating the cast cannot overflow for any value the field may legally hold

### Requirement: Boundary values are tested explicitly, not only via random sampling
The system SHALL include an explicit fixture covering each scored field's minimum, maximum, and
values adjacent to internal formula thresholds (the `/257` bucket boundaries at 256/257/258), in
addition to any existing randomized fixture.

#### Scenario: All three GPU-primitive lanes agree at every boundary row
- **WHEN** the boundary fixture is run through the CPU oracle, the LEVEL 2 CUDA C++ kernel, and the
  LEVEL 3 Python `cuda.tile` kernel
- **THEN** every lane's score and packed-key output exactly matches the CPU oracle at every row,
  including the all-zero and all-max glyphs
