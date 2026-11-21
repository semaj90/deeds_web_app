#!/usr/bin/env python3
"""
Parent Atlas Mesh Requirements v1 — Repository Gap Audit

Compares ~/Downloads/Parent_Atlas_Mesh_Requirements_v1.json (130 mesh/visual
definitions + 7 prefab proposals) against the actual repository registries:
  - scene-ontology-catalog-v1.json (506 pa:* concepts)
  - scene-primitive-registry-v1.ts (8 primitive kinds + 2 assemblies)
  - scene-prefab-registry-v1.ts (house.studio.v1 + prefab compiler)
  - character-behavior-haircard-v1.ts / avatar-primitives-v1.ts / character-runtime-v2.ts
  - reviewed-polygon-mesh-v1.ts / video-clip-motion-classifier-v1.ts
  - sveltekit-frontend/static/models/**/*.glb

Outputs:
  - docs/reports/parent-atlas-mesh-gap-audit-v1.json
  - docs/reports/parent-atlas-mesh-gap-audit-v1.md
"""

import json
import re
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
REQ_PATH = Path(os.path.expanduser("~/Downloads/Parent_Atlas_Mesh_Requirements_v1.json"))
ONTOLOGY_PATH = REPO_ROOT / "sveltekit-frontend/src/lib/splat/scene-ontology/scene-ontology-catalog-v1.json"
MODELS_DIR = REPO_ROOT / "sveltekit-frontend/static/models"
OUT_JSON = REPO_ROOT / "docs/reports/parent-atlas-mesh-gap-audit-v1.json"
OUT_MD = REPO_ROOT / "docs/reports/parent-atlas-mesh-gap-audit-v1.md"
P0_RECIPE_SOURCE = REPO_ROOT / "sveltekit-frontend/src/lib/reconstruction/scene-modular-p0-recipes-v1.ts"

# Exact canonical pa:* concept mappings verified against scene-ontology-catalog-v1.json
ONTOLOGY_MAP = {
    # architecture_structure
    "atlas.mesh.architecture_structure.door_frame.v1": "pa:geometry.composite.door-frame",
    "atlas.mesh.architecture_structure.door_leaf.v1": "pa:space.structure.door",
    "atlas.mesh.architecture_structure.doorway_opening.v1": "pa:space.structure.doorway",
    "atlas.mesh.architecture_structure.facade_section.v1": "pa:space.building",
    "atlas.mesh.architecture_structure.floor_slab.v1": "pa:space.structure.floor-slab",
    "atlas.mesh.architecture_structure.foundation_slab.v1": "pa:space.structure.floor-slab",
    "atlas.mesh.architecture_structure.room_boundary_proxy.v1": "pa:space.room",
    "atlas.mesh.architecture_structure.wall_corner.v1": "pa:space.structure.wall",
    "atlas.mesh.architecture_structure.wall_exterior.v1": "pa:space.structure.wall",
    "atlas.mesh.architecture_structure.wall_interior.v1": "pa:space.structure.wall",
    "atlas.mesh.architecture_structure.window_frame.v1": "pa:space.structure.window",
    "atlas.mesh.architecture_structure.balcony.v1": "pa:space.room.balcony",
    "atlas.mesh.architecture_structure.ceiling_panel.v1": "pa:space.structure.ceiling",
    "atlas.mesh.architecture_structure.fence_gate.v1": "pa:space.structure.gate",
    "atlas.mesh.architecture_structure.porch_steps.v1": "pa:space.structure.stair",
    "atlas.mesh.architecture_structure.railing_balustrade.v1": "pa:space.structure.railing",
    "atlas.mesh.architecture_structure.roof_flat.v1": "pa:space.structure.roof",
    "atlas.mesh.architecture_structure.roof_gable.v1": "pa:space.structure.roof",
    "atlas.mesh.architecture_structure.stair_railing.v1": "pa:space.structure.railing",
    "atlas.mesh.architecture_structure.staircase.v1": "pa:geometry.composite.staircase",
    "atlas.mesh.architecture_structure.storefront_shell.v1": "pa:space.building.shop",
    "atlas.mesh.architecture_structure.support_column.v1": "pa:space.structure.pillar",
    "atlas.mesh.architecture_structure.window_glass.v1": "pa:space.structure.window",
    "atlas.mesh.architecture_structure.garage_door.v1": "pa:space.building.garage",
    "atlas.mesh.architecture_structure.fence_segment.v1": "pa:space.structure.fence",

    # evidence_visualization
    "atlas.mesh.evidence_visualization.bounding_box_3d.v1": "pa:object.evidence-proxy.bounding-box",
    "atlas.mesh.evidence_visualization.depth_map_plane.v1": "pa:geometry.representation.depth-relief",
    "atlas.mesh.evidence_visualization.evidence_marker_tent.v1": "pa:object.evidence-proxy.marker",
    "atlas.mesh.evidence_visualization.image_evidence_plane.v1": "pa:geometry.representation.source-image-plane",
    "atlas.mesh.evidence_visualization.reviewed_contour.v1": "pa:observation.image-region.polygon-region",
    "atlas.mesh.evidence_visualization.source_camera_proxy.v1": "pa:observation.coordinate.camera-ray",
    "atlas.mesh.evidence_visualization.trajectory_line.v1": "pa:object.evidence-proxy.trajectory-line",
    "atlas.mesh.evidence_visualization.video_billboard.v1": "pa:geometry.representation.billboard",
    "atlas.mesh.evidence_visualization.actor_ghost_frame.v1": "pa:observation.model-output.person-proposal",
    "atlas.mesh.evidence_visualization.annotation_pin.v1": "pa:object.evidence-proxy.annotation-pin",
    "atlas.mesh.evidence_visualization.distance_ruler.v1": "pa:object.evidence-proxy.measurement-line",
    "atlas.mesh.evidence_visualization.footprint_marker.v1": "pa:object.evidence-proxy.footprint-card",
    "atlas.mesh.evidence_visualization.region_volume.v1": "pa:observation.image-region.bounding-box",

    # humanoid_modular
    "atlas.mesh.humanoid_modular.actor_foot.v1": "pa:actor.component.left-foot",
    "atlas.mesh.humanoid_modular.actor_forearm.v1": "pa:actor.component.left-arm",
    "atlas.mesh.humanoid_modular.actor_hand.v1": "pa:actor.component.left-hand",
    "atlas.mesh.humanoid_modular.actor_head.v1": "pa:actor.component.head",
    "atlas.mesh.humanoid_modular.actor_hierarchy_proxy.v1": "pa:actor.representation.neutral-humanoid",
    "atlas.mesh.humanoid_modular.actor_lower_leg.v1": "pa:actor.component.left-leg",
    "atlas.mesh.humanoid_modular.actor_neutral_body.v1": "pa:actor.representation.low-poly-body",
    "atlas.mesh.humanoid_modular.actor_rigid_proxy.v1": "pa:geometry.composite.person-proxy",
    "atlas.mesh.humanoid_modular.actor_skinned_7bone.v1": "pa:actor.representation.rigged-body",
    "atlas.mesh.humanoid_modular.actor_torso.v1": "pa:actor.component.torso",
    "atlas.mesh.humanoid_modular.actor_upper_arm.v1": "pa:actor.component.right-arm",
    "atlas.mesh.humanoid_modular.actor_upper_leg.v1": "pa:actor.component.right-leg",
    "atlas.mesh.humanoid_modular.actor_witness_placeholder.v1": "pa:actor.role.illustrative-participant",
    "atlas.mesh.humanoid_modular.clothing_lower.v1": "pa:actor.component.clothing",
    "atlas.mesh.humanoid_modular.clothing_upper.v1": "pa:actor.component.clothing",
    "atlas.mesh.humanoid_modular.eyes_sockets.v1": "pa:actor.component.eye",
    "atlas.mesh.humanoid_modular.hair_cards_long.v1": "pa:actor.component.hair-card",
    "atlas.mesh.humanoid_modular.hair_cards_short.v1": "pa:actor.component.hair-card",
    "atlas.mesh.humanoid_modular.shoes_pair.v1": "pa:object.personal-item.shoes",

    # indoor_furniture
    "atlas.mesh.indoor_furniture.bed_frame.v1": "pa:geometry.composite.bed",
    "atlas.mesh.indoor_furniture.ceiling_light.v1": "pa:object.fixture.light-fixture",
    "atlas.mesh.indoor_furniture.chair_simple.v1": "pa:geometry.composite.chair",
    "atlas.mesh.indoor_furniture.desk.v1": "pa:object.furniture.desk",
    "atlas.mesh.indoor_furniture.kitchen_counter.v1": "pa:object.furniture.counter",
    "atlas.mesh.indoor_furniture.sofa.v1": "pa:geometry.composite.sofa",
    "atlas.mesh.indoor_furniture.table_simple.v1": "pa:geometry.composite.table",
    "atlas.mesh.indoor_furniture.armchair.v1": "pa:object.furniture.chair",
    "atlas.mesh.indoor_furniture.bookcase.v1": "pa:object.furniture.bookcase",
    "atlas.mesh.indoor_furniture.cabinet.v1": "pa:geometry.composite.cabinet",
    "atlas.mesh.indoor_furniture.coffee_table.v1": "pa:object.furniture.table",
    "atlas.mesh.indoor_furniture.dining_table.v1": "pa:object.furniture.table",
    "atlas.mesh.indoor_furniture.dresser.v1": "pa:object.furniture.dresser",
    "atlas.mesh.indoor_furniture.floor_lamp.v1": "pa:geometry.composite.lamp",
    "atlas.mesh.indoor_furniture.interior_door.v1": "pa:space.structure.door",
    "atlas.mesh.indoor_furniture.mattress.v1": "pa:object.furniture.bed",
    "atlas.mesh.indoor_furniture.nightstand.v1": "pa:object.furniture.nightstand",
    "atlas.mesh.indoor_furniture.office_chair.v1": "pa:object.furniture.chair",
    "atlas.mesh.indoor_furniture.picture_frame.v1": "pa:geometry.primitive.rectangle",
    "atlas.mesh.indoor_furniture.refrigerator.v1": "pa:object.appliance.refrigerator",
    "atlas.mesh.indoor_furniture.shelf_unit.v1": "pa:geometry.composite.shelf",
    "atlas.mesh.indoor_furniture.sink.v1": "pa:object.fixture.sink",
    "atlas.mesh.indoor_furniture.stool.v1": "pa:object.furniture.stool",
    "atlas.mesh.indoor_furniture.stove.v1": "pa:object.appliance.stove",
    "atlas.mesh.indoor_furniture.toilet.v1": "pa:object.fixture.toilet",
    "atlas.mesh.indoor_furniture.wardrobe.v1": "pa:object.furniture.dresser",
    "atlas.mesh.indoor_furniture.bathtub.v1": "pa:object.fixture.bathtub",
    "atlas.mesh.indoor_furniture.shower_unit.v1": "pa:object.fixture.shower",

    # terrain_environment
    "atlas.mesh.terrain_environment.beach_sand.v1": "pa:object.landscape.sand",
    "atlas.mesh.terrain_environment.coastal_water.v1": "pa:object.landscape.water",
    "atlas.mesh.terrain_environment.curb.v1": "pa:space.outdoor-zone.sidewalk",
    "atlas.mesh.terrain_environment.ground_tile.v1": "pa:geometry.primitive.plane",
    "atlas.mesh.terrain_environment.road_intersection.v1": "pa:space.outdoor-zone.intersection",
    "atlas.mesh.terrain_environment.road_segment.v1": "pa:space.outdoor-zone.road",
    "atlas.mesh.terrain_environment.sidewalk.v1": "pa:space.outdoor-zone.sidewalk",
    "atlas.mesh.terrain_environment.terrain_grid.v1": "pa:geometry.primitive.plane",
    "atlas.mesh.terrain_environment.terrain_heightfield.v1": "pa:geometry.representation.mesh",
    "atlas.mesh.terrain_environment.dune_berm.v1": "pa:space.outdoor-zone.sand-dune",
    "atlas.mesh.terrain_environment.grass_patch.v1": "pa:object.landscape.grass",
    "atlas.mesh.terrain_environment.ground_gravel.v1": "pa:space.outdoor-zone.yard",
    "atlas.mesh.terrain_environment.pedestrian_path.v1": "pa:space.navigation.accessible-path",
    "atlas.mesh.terrain_environment.rock_boulder.v1": "pa:object.landscape.rock",
    "atlas.mesh.terrain_environment.shoreline_strip.v1": "pa:space.outdoor-zone.shore",
    "atlas.mesh.terrain_environment.shrub.v1": "pa:object.landscape.shrub",
    "atlas.mesh.terrain_environment.terrain_slope.v1": "pa:geometry.representation.mesh",
    "atlas.mesh.terrain_environment.tree_lowpoly.v1": "pa:object.landscape.tree",

    # urban_outdoor
    "atlas.mesh.urban_outdoor.bonfire_assembly.v1": "pa:object.landscape.fire-pit",
    "atlas.mesh.urban_outdoor.crosswalk_marking.v1": "pa:space.outdoor-zone.crosswalk",
    "atlas.mesh.urban_outdoor.streetlamp.v1": "pa:object.landscape.lamp-post",
    "atlas.mesh.urban_outdoor.vehicle_car_proxy.v1": "pa:geometry.composite.vehicle-proxy",
    "atlas.mesh.urban_outdoor.beach_tent.v1": "pa:geometry.composite.beach-umbrella",
    "atlas.mesh.urban_outdoor.bench_public.v1": "pa:object.furniture.bench",
    "atlas.mesh.urban_outdoor.bonfire_flame.v1": "pa:object.landscape.fire-pit",
    "atlas.mesh.urban_outdoor.dumpster.v1": "pa:object.landscape.trash-bin",
    "atlas.mesh.urban_outdoor.fire_hydrant.v1": "pa:space.outdoor-zone.sidewalk",
    "atlas.mesh.urban_outdoor.parking_marking.v1": "pa:space.outdoor-zone.parking-lot",
    "atlas.mesh.urban_outdoor.road_sign.v1": "pa:space.outdoor-zone.road",
    "atlas.mesh.urban_outdoor.stop_sign.v1": "pa:space.outdoor-zone.intersection",
    "atlas.mesh.urban_outdoor.traffic_signal.v1": "pa:space.outdoor-zone.intersection",
    "atlas.mesh.urban_outdoor.trash_bin.v1": "pa:object.landscape.trash-bin",
    "atlas.mesh.urban_outdoor.utility_pole.v1": "pa:object.landscape.lamp-post",
    "atlas.mesh.urban_outdoor.vehicle_van_proxy.v1": "pa:object.transport.truck",
    "atlas.mesh.urban_outdoor.wall_bollard.v1": "pa:space.navigation.obstacle",
    "atlas.mesh.urban_outdoor.bicycle_proxy.v1": "pa:object.transport.bicycle",
    "atlas.mesh.urban_outdoor.bus_shelter.v1": "pa:space.structure.canopy",
    "atlas.mesh.urban_outdoor.parking_meter.v1": "pa:space.outdoor-zone.parking-lot",

    # props_misc
    "atlas.mesh.props_misc.backpack.v1": "pa:object.personal-item.bag",
    "atlas.mesh.props_misc.bag_soft.v1": "pa:object.personal-item.bag",
    "atlas.mesh.props_misc.book_document.v1": "pa:observation.source.pdf",
    "atlas.mesh.props_misc.bottle.v1": "pa:object.personal-item.bottle",
    "atlas.mesh.props_misc.box_parcel.v1": "pa:geometry.primitive.box",
    "atlas.mesh.props_misc.briefcase.v1": "pa:object.personal-item.bag",
    "atlas.mesh.props_misc.camera_cctv.v1": "pa:observation.source.video",
    "atlas.mesh.props_misc.cup.v1": "pa:object.personal-item.cup",
    "atlas.mesh.props_misc.laptop.v1": "pa:object.appliance.computer",
    "atlas.mesh.props_misc.phone.v1": "pa:object.personal-item.phone",
    "atlas.mesh.props_misc.rope_cordon.v1": "pa:space.navigation.obstacle",
    "atlas.mesh.props_misc.camera_tripod.v1": "pa:observation.source.photo",
    "atlas.mesh.props_misc.key_set.v1": "pa:object.personal-item.key",
}

# Verified repository status for existing items
REPO_EVIDENCE = {
    # EXISTS_AND_VALIDATED
    "atlas.mesh.evidence_visualization.evidence_marker_tent.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/static/models/crime-scene-primitives-v1.glb + scripts/blender/populate_crime_scene_primitives.py (Primitive_MarkerTent_1..3)",
    ),
    "atlas.mesh.evidence_visualization.footprint_marker.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/static/models/crime-scene-primitives-v1.glb + scripts/blender/populate_crime_scene_primitives.py (Primitive_FootprintCard_0..4)",
    ),
    "atlas.mesh.evidence_visualization.reviewed_contour.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/src/lib/splat/reviewed-polygon-mesh-v1.ts + reviewed-polygon-mesh-v1.spec.ts",
    ),
    "atlas.mesh.evidence_visualization.depth_map_plane.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/src/lib/reconstruction/video-clip-motion-classifier-v1.ts (unpackDepthQ4ToR8V1 DataTexture overlay)",
    ),
    "atlas.mesh.evidence_visualization.image_evidence_plane.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts (rectangle) + scene-primitive-three-v1.ts",
    ),
    "atlas.mesh.humanoid_modular.actor_head.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/static/models/parent-atlas-face-primitives/{neutral,masculine,feminine}.glb + avatar-primitives-v1.ts",
    ),
    "atlas.mesh.humanoid_modular.hair_cards_short.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/src/lib/characters/character-behavior-haircard-v1.ts (generateHaircardStripGeometryV1) + scripts/blender/generate_procedural_hair_primitive.py",
    ),
    "atlas.mesh.humanoid_modular.hair_cards_long.v1": (
        "EXISTS_NEEDS_REPAIR",
        "generateHaircardStripGeometryV1 supports parameterized length/segments; needs long-style preset & GLB export",
    ),
    "atlas.mesh.humanoid_modular.eyes_sockets.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/src/lib/characters/avatar-primitives-v1.ts + character-behavior-haircard-v1.ts (face.eye.left/right sockets)",
    ),
    "atlas.mesh.humanoid_modular.actor_skinned_7bone.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/tests/fixtures/scene-studio/synthetic-rigged-textured-animation.glb + static/models/detective-actor-v1.glb + static/models/courtroom/character_alice_skinned.glb",
    ),
    "atlas.mesh.terrain_environment.ground_tile.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/src/lib/splat/scene-primitive-three-v1.ts (createIllustrativeRoomBlockoutV1) + scene-prefab-registry-v1.ts",
    ),
    "atlas.mesh.props_misc.box_parcel.v1": (
        "EXISTS_AND_VALIDATED",
        "sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts (box primitive recipe)",
    ),

    # EXISTS_NEEDS_REPAIR (exists in house.studio.v1, primitive blockouts, or unlinked GLBs, needs modularization/ontology link)
    "atlas.mesh.architecture_structure.floor_slab.v1": (
        "EXISTS_NEEDS_REPAIR",
        "house.studio.v1 (prefab_floor_wood_v1 in scene-prefab-registry-v1.ts) — single studio slab, needs modular 4m/1m tile variants",
    ),
    "atlas.mesh.architecture_structure.wall_interior.v1": (
        "EXISTS_NEEDS_REPAIR",
        "house.studio.v1 (prefab_wall_plaster_v1 in scene-prefab-registry-v1.ts) — solid 4m box only, needs doorway/window cutout modules",
    ),
    "atlas.mesh.indoor_furniture.table_simple.v1": (
        "EXISTS_NEEDS_REPAIR",
        "house.studio.v1 (prefab_table_dining_v1) — single box blockout; needs 4-leg composite recipe",
    ),
    "atlas.mesh.indoor_furniture.chair_simple.v1": (
        "EXISTS_NEEDS_REPAIR",
        "house.studio.v1 (prefab_chair_lowpoly_v1) — single box blockout; needs seat/back/legs composite recipe",
    ),
    "atlas.mesh.indoor_furniture.ceiling_light.v1": (
        "EXISTS_NEEDS_REPAIR",
        "house.studio.v1 (prefab_ceiling_light_v1 cylinder) — recipe exists in studio prefab, not yet registered in shared P0 catalog",
    ),
    "atlas.mesh.humanoid_modular.actor_rigid_proxy.v1": (
        "EXISTS_NEEDS_REPAIR",
        "sveltekit-frontend/static/models/n64-toy.glb + retro-scout.glb — GLBs exist on disk, not yet indexed in SceneObjectRegistryV1",
    ),
    "atlas.mesh.humanoid_modular.actor_hierarchy_proxy.v1": (
        "EXISTS_NEEDS_REPAIR",
        "sveltekit-frontend/static/models/rubber-hose-actor-v1.glb + avatar-primitives-v1.ts (createPrimitiveAvatar) — needs unified registry recipe",
    ),
    "atlas.mesh.humanoid_modular.actor_neutral_body.v1": (
        "EXISTS_NEEDS_REPAIR",
        "scripts/blender/procedural-humanoid-v1.py + static/models/courtroom/character_alice_n64.glb — needs neutral catalog GLB export",
    ),
    "atlas.mesh.evidence_visualization.bounding_box_3d.v1": (
        "EXISTS_NEEDS_REPAIR",
        "Box3 helpers used in scene-controller-v1 / spatial-bvh-manager-v1 — needs dedicated Three.js wireframe overlay factory",
    ),
    "atlas.mesh.evidence_visualization.trajectory_line.v1": (
        "EXISTS_NEEDS_REPAIR",
        "character-behavior-haircard-v1.ts (motion path curves) — needs dedicated Three.js Line2/Tube evidence trajectory builder",
    ),

    # NOT_APPLICABLE (purely procedural Three.js / runtime effects or non-GLB overlays)
    "atlas.mesh.terrain_environment.terrain_grid.v1": (
        "NOT_APPLICABLE",
        "Runtime Three.js GridHelper — should remain procedural Three.js helper, not a stored GLB",
    ),
    "atlas.mesh.urban_outdoor.bonfire_flame.v1": (
        "NOT_APPLICABLE",
        "Runtime Three.js particle/shader emitter — should remain procedural Three.js visual, not a static GLB",
    ),
}


def main():
    reqs = json.loads(REQ_PATH.read_text(encoding="utf-8"))
    ontology = json.loads(ONTOLOGY_PATH.read_text(encoding="utf-8"))
    valid_concepts = {c["id"] for c in ontology["concepts"]}
    # A recipe definition is not proof of a runtime consumer. Record those assets
    # as present but needing repair until the scene renderer consumes the registry.
    modular_recipe_keys = set(re.findall(
        r"draftMeshKey:\s*'([^']+)'", P0_RECIPE_SOURCE.read_text(encoding="utf-8")
    ))

    # Verify all mapped ontology IDs exist in the 506-concept catalog
    for key, cid in ONTOLOGY_MAP.items():
        if cid not in valid_concepts:
            raise ValueError(f"Mapped ontology concept '{cid}' for '{key}' not found in scene-ontology-catalog-v1.json")

    rows = []
    status_counts = {
        "EXISTS_AND_VALIDATED": 0,
        "EXISTS_NEEDS_REPAIR": 0,
        "MISSING": 0,
        "NOT_APPLICABLE": 0,
    }
    p0_status_counts = dict(status_counts)

    for item in reqs["meshRequirements"]:
        key = item["draftMeshKey"]
        cid = ONTOLOGY_MAP.get(key)
        if not cid:
            raise ValueError(f"Missing ontology mapping for {key}")

        if key in REPO_EVIDENCE:
            status, evidence = REPO_EVIDENCE[key]
        elif key in modular_recipe_keys:
            status = "EXISTS_NEEDS_REPAIR"
            evidence = (
                "Defined in sveltekit-frontend/src/lib/reconstruction/scene-modular-p0-recipes-v1.ts; "
                "recipe/prefab fixture tests exist, but this recipe is not consumed by the live scene renderer"
            )
        else:
            status = "MISSING"
            evidence = f"No matching recipe or GLB found; recommended builder: {item['recommendedBuilder']}"

        status_counts[status] += 1
        if item["priority"] == "P0":
            p0_status_counts[status] += 1

        rows.append({
            "draftMeshKey": key,
            "label": item["label"],
            "category": item["category"],
            "priority": item["priority"],
            "representation": item["representation"],
            "recommendedBuilder": item["recommendedBuilder"],
            "canonicalOntologyConceptId": cid,
            "status": status,
            "evidence": evidence,
        })

    # Prefab audit
    prefab_rows = []
    for p in reqs["prefabProposals"]:
        if p["draftPrefabKey"] == "atlas.prefab.residence.studio.v1":
            p_status = "EXISTS_NEEDS_REPAIR"
            p_evidence = "Factory exists as house.studio.v1 in sveltekit-frontend/src/lib/reconstruction/scene-prefab-registry-v1.ts; no live case-scene renderer consumer was found"
            cid = "pa:space.building.studio"
        elif p["draftPrefabKey"] == "atlas.prefab.house.four_bedroom.v1":
            p_status = "EXISTS_NEEDS_REPAIR"
            p_evidence = "Defined by buildFourBedroomHousePrefabV1() in scene-modular-p0-recipes-v1.ts and covered by fixture tests; not connected to live scene plan/render targets"
            cid = "pa:space.building.house"
        elif p["draftPrefabKey"] == "atlas.prefab.city.block.v1":
            p_status = "EXISTS_NEEDS_REPAIR"
            p_evidence = "Defined by buildCityBlockPrefabV1() in scene-modular-p0-recipes-v1.ts and covered by fixture tests; not connected to live scene plan/render targets"
            cid = "pa:space.site.urban"
        elif p["draftPrefabKey"] == "atlas.prefab.beach.night.v1":
            p_status = "EXISTS_NEEDS_REPAIR"
            p_evidence = "Defined by buildBeachNightPrefabV1() in scene-modular-p0-recipes-v1.ts and covered by fixture tests; not connected to live scene plan/render targets"
            cid = "pa:space.site.beach"
        elif p["draftPrefabKey"] == "atlas.prefab.office.v1":
            p_status = "MISSING"
            p_evidence = "P1 assembly target"
            cid = "pa:space.building.office"
        elif p["draftPrefabKey"] == "atlas.prefab.road.parking_lot.v1":
            p_status = "MISSING"
            p_evidence = "P1 assembly target"
            cid = "pa:space.outdoor-zone.parking-lot"
        else:
            p_status = "EXISTS_NEEDS_REPAIR"
            p_evidence = "Static courtroom GLBs exist in static/models/courtroom/, but there is no generic courtroom prefab assembly wired to the case scene"
            cid = "pa:space.building.courthouse"

        prefab_rows.append({
            "draftPrefabKey": p["draftPrefabKey"],
            "label": p["label"],
            "priority": p["priority"],
            "canonicalOntologyConceptId": cid,
            "status": p_status,
            "evidence": p_evidence,
        })

    report = {
        "schema": "parent-atlas-mesh-gap-audit-v1",
        "sourceRequirements": str(REQ_PATH),
        "ontologyCatalogCount": len(valid_concepts),
        "totalRequirements": len(rows),
        "statusCounts": status_counts,
        "p0StatusCounts": p0_status_counts,
        "prefabAudit": prefab_rows,
        "meshGapTable": rows,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Write Markdown report
    lines = [
        "# Parent Atlas Mesh Requirements v1 — Repository Gap Audit",
        "",
        f"- **Ontology Concepts Verified**: {len(valid_concepts)} (`scene-ontology-catalog-v1.json`)",
        f"- **Total Candidate Mesh/Visual Definitions**: {len(rows)}",
        f"- **Overall Status Counts**: {json.dumps(status_counts)}",
        f"- **P0 Status Counts (52 total)**: {json.dumps(p0_status_counts)}",
        "",
        "## Prefab Proposals Audit (7 Targets)",
        "",
        "| Draft Prefab Key | Priority | Ontology Concept | Status | Evidence |",
        "| :--- | :---: | :--- | :--- | :--- |",
    ]
    for pr in prefab_rows:
        lines.append(f"| `{pr['draftPrefabKey']}` | {pr['priority']} | `{pr['canonicalOntologyConceptId']}` | **{pr['status']}** | {pr['evidence']} |")

    lines.extend([
        "",
        "## P0 Mesh & Visual Gap Table (52 P0 Items)",
        "",
        "| Draft Mesh Key | Category | Builder | Ontology Concept | Status | Evidence |",
        "| :--- | :--- | :--- | :--- | :--- | :--- |",
    ])
    for r in rows:
        if r["priority"] == "P0":
            lines.append(f"| `{r['draftMeshKey']}` | {r['category']} | `{r['recommendedBuilder']}` | `{r['canonicalOntologyConceptId']}` | **{r['status']}** | {r['evidence']} |")

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_JSON} and {OUT_MD}")
    print("Overall:", status_counts)
    print("P0 (52):", p0_status_counts)


if __name__ == "__main__":
    main()
