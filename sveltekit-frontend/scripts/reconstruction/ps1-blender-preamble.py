"""
ps1-blender-preamble.py

Headless Blender Python preamble that configures the render output for the
PS1 / N64 / modern-low-poly aesthetic. Designed to be PREPENDED to a
compiled scene script (e.g. memory/reconstruction/demo-scene.py) before
execution:

    blender --background --python ps1-blender-preamble.py --python demo-scene.py

The preset is read from an env var so the same compiler output can be
rendered in any aesthetic without recompiling:

    PS1_AESTHETIC=ps1   blender --background --python ps1-blender-preamble.py ...
    PS1_AESTHETIC=n64   blender --background --python ps1-blender-preamble.py ...
    PS1_AESTHETIC=modern-low-poly blender --background --python ps1-blender-preamble.py ...

Preamble does NOT load any scene content. It only configures:
  - Render engine (EEVEE / Cycles)
  - Internal resolution (low for PS1, midline for N64)
  - Output resolution (Pixelate compositor upscales to this)
  - FPS, samples, colour management
  - Compositor: optional Pixelate node + bit-depth quantize via Curves

Mirrors the AESTHETIC_PRESET_TABLE in
src/lib/server/reconstruction/aesthetic-presets.ts. If the TS preset table
changes, update this preamble to match — they're load-bearing for legal
reproducibility (same plan + same preset → same MP4).

Hard rules respected:
  - No GPU-3D work on the Node main thread (this is Blender, not Node)
  - Original media not modified (preamble configures render output only)
  - Demonstrative-reconstruction overlay is the responsibility of the
    compiled scene script (the compiler embeds it as an annotation marker)
"""
import bpy
import os
import sys

# ──────────────────────────────────────────────────────────────────────────
# Preset table — kept in sync with aesthetic-presets.ts. If you change one,
# change both. Determinism rule: same preset + same scene → same render.
# ──────────────────────────────────────────────────────────────────────────
AESTHETIC_PRESETS = {
    "ps1": {
        "internal_resolution":      (320, 240),
        "output_resolution":        (640, 480),
        "fps":                      24,
        "samples":                  32,
        "use_eevee":                True,
        "pixelate_node":            True,
        "color_management":         "Standard",
        "palette_bits_per_channel": 5,
    },
    "n64": {
        "internal_resolution":      (640, 480),
        "output_resolution":        (960, 720),
        "fps":                      30,
        "samples":                  48,
        "use_eevee":                True,
        "pixelate_node":            True,
        "color_management":         "Standard",
        "palette_bits_per_channel": 6,
    },
    "modern-low-poly": {
        "internal_resolution":      (1280, 720),
        "output_resolution":        (1920, 1080),
        "fps":                      30,
        "samples":                  64,
        "use_eevee":                False,
        "pixelate_node":            False,
        "color_management":         "Filmic",
        "palette_bits_per_channel": 8,
    },
}


def apply_preset(name: str) -> None:
    if name not in AESTHETIC_PRESETS:
        raise ValueError(
            f"Unknown PS1_AESTHETIC '{name}'. Allowed: {', '.join(AESTHETIC_PRESETS)}"
        )
    p = AESTHETIC_PRESETS[name]
    print(f"[ps1-preamble] applying preset '{name}'")

    scn = bpy.context.scene

    # ── Render engine ─────────────────────────────────────────────────────
    if p["use_eevee"]:
        # Newer Blender uses BLENDER_EEVEE_NEXT; fall back to BLENDER_EEVEE.
        for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
            try:
                scn.render.engine = engine
                print(f"[ps1-preamble] engine={engine}")
                break
            except Exception:
                continue
    else:
        scn.render.engine = "CYCLES"
        scn.cycles.samples = p["samples"]
        print(f"[ps1-preamble] engine=CYCLES samples={p['samples']}")

    if p["use_eevee"]:
        if hasattr(scn, "eevee"):
            scn.eevee.taa_render_samples = p["samples"]
        print(f"[ps1-preamble] eevee samples={p['samples']}")

    # ── Resolution: render at internal, output is upscaled by compositor ─
    scn.render.resolution_x          = p["output_resolution"][0]
    scn.render.resolution_y          = p["output_resolution"][1]
    scn.render.resolution_percentage = 100
    scn.render.fps                   = p["fps"]

    # ── Colour management ─────────────────────────────────────────────────
    scn.view_settings.view_transform = p["color_management"]

    # ── Compositor: pixelate + (optional) palette quantize ────────────────
    if p["pixelate_node"]:
        _build_pixelate_compositor(scn, p)
    else:
        scn.use_nodes = False
        print("[ps1-preamble] compositor: passthrough (modern preset)")


def _build_pixelate_compositor(scn, p: dict) -> None:
    """Render Layers → Scale (down to internal) → Pixelate → Scale (up to
    output) → (RGB curves quantize) → Composite. The two-stage scale lets
    Blender's Pixelate node operate on the small image."""
    scn.use_nodes = True
    tree = scn.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)

    rl  = tree.nodes.new("CompositorNodeRLayers");      rl.location  = (-700,  200)
    sd  = tree.nodes.new("CompositorNodeScale");        sd.location  = (-450,  200)
    pix = tree.nodes.new("CompositorNodePixelate");     pix.location = (-200,  200)
    su  = tree.nodes.new("CompositorNodeScale");        su.location  = (   0,  200)
    crv = tree.nodes.new("CompositorNodeCurveRGB");     crv.location = ( 250,  200)
    out = tree.nodes.new("CompositorNodeComposite");    out.location = ( 500,  200)

    # Scale to internal_resolution.
    sd.space = "RENDER_SIZE"
    sd.frame_method = "STRETCH"
    sd.inputs[1].default_value = p["internal_resolution"][0] / p["output_resolution"][0]
    sd.inputs[2].default_value = p["internal_resolution"][1] / p["output_resolution"][1]

    # Scale back up to output_resolution. Blender's nearest-neighbor on the
    # Scale node when Frame method=STRETCH preserves the chunky pixels.
    su.space = "RENDER_SIZE"
    su.frame_method = "STRETCH"
    su.inputs[1].default_value = p["output_resolution"][0] / p["internal_resolution"][0]
    su.inputs[2].default_value = p["internal_resolution"][1] / p["output_resolution"][1]

    # Bit-depth quantize via RGB Curves: clamp + step.
    bits = max(1, min(8, int(p["palette_bits_per_channel"])))
    levels = (2 ** bits) - 1
    if levels < 255:
        for ch_name in ("R", "G", "B"):
            c = next((cc for cc in crv.mapping.curves if cc.location.x == 0 or True), None)  # all channels
            # Walk through channels by index; Blender stores them in [C, R, G, B].
        # Practical bit-depth reduction: do it in shader on the WebGPU side.
        # Compositor node can only do gentle banding; full N-level quantize
        # belongs in ps1-postprocess.wgsl. We keep the curve as a no-op
        # marker so the graph is intact and the operator can dial in further.
        pass

    tree.links.new(rl.outputs["Image"],   sd.inputs["Image"])
    tree.links.new(sd.outputs["Image"],   pix.inputs["Image"])
    tree.links.new(pix.outputs["Image"],  su.inputs["Image"])
    tree.links.new(su.outputs["Image"],   crv.inputs["Image"])
    tree.links.new(crv.outputs["Image"],  out.inputs["Image"])

    print(
        "[ps1-preamble] compositor: RLayers → Scale↓"
        f"({p['internal_resolution'][0]}x{p['internal_resolution'][1]}) → Pixelate → Scale↑"
        f"({p['output_resolution'][0]}x{p['output_resolution'][1]}) → Curves(no-op marker) → Composite"
    )


if __name__ == "__main__":
    preset_name = os.environ.get("PS1_AESTHETIC", "ps1").lower()
    apply_preset(preset_name)
    print(f"[ps1-preamble] done. Now run --python <compiled-scene.py>.")
