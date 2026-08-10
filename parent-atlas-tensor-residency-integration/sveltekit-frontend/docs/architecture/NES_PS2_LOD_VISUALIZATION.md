# NES / PS2 LOD Visualization

The visualization presents residency and semantic/topology state as a game-like derived scene.

```text
COLD      → tiny glyph
MMAPPED   → loaded sprite metadata
PINNED    → highlighted prefetch glyph
GPU       → full sprite / active shader instance
IN_USE    → animated active state
```

A sprite instance may use SOM x/y as position, authority as scale or vertical displacement, entropy/utility as intensity, and LOD as glyph complexity. These values are operator/debug UI only.

Do not treat glyph coordinates, texture atlas indices, or shader buffers as canonical packet identity.
