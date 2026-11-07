"""Allow-listed Blender operations called by blender-model-mcp.mjs.

This file is executed only by Blender's embedded Python interpreter. It does
not evaluate user-provided Python and writes results to a new .blend file.
"""
import json
import math
import os
import re
import sys
import traceback

import bpy
from mathutils import Vector


def embedding_payload_bytes(representation, dimensions):
    bits_per_element = {
        "FP32": 32,
        "FP16": 16,
        "BF16": 16,
        "INT8": 8,
        "PACKED_INT4": 4,
        "PACKED_2BIT": 2,
        "FP8_STORAGE_ONLY": 8,
    }
    if representation not in bits_per_element:
        raise ValueError("Unsupported embedding representation")
    return (int(dimensions) * bits_per_element[representation] + 7) // 8


def scene_triangle_count():
    total = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            total += len(obj.data.loop_triangles)
    return total


def scene_geometry_stats():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    polygons = sum(len(obj.data.polygons) for obj in meshes)
    triangles = scene_triangle_count()
    return {
        "meshObjectCount": len(meshes),
        "vertexCount": vertices,
        "polygonCount": polygons,
        "triangleCount": triangles,
    }


def scene_mesh_bounds():
    """Return an axis-aligned world-space bound in Blender scene units."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    corners = []
    mesh_count = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        if not evaluated.bound_box:
            continue
        mesh_count += 1
        corners.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not corners:
        return None
    minimum = [min(float(point[axis]) for point in corners) for axis in range(3)]
    maximum = [max(float(point[axis]) for point in corners) for axis in range(3)]
    return {
        "coordinateUnits": "BLENDER_SCENE_UNITS",
        "meshObjectCount": mesh_count,
        "min": [round(value, 6) for value in minimum],
        "max": [round(value, 6) for value in maximum],
        "extent": [round(maximum[axis] - minimum[axis], 6) for axis in range(3)],
    }


def finite_vector(value, label):
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(label + " must be a 3-number array")
    numbers = [float(part) for part in value]
    if not all(math.isfinite(part) and abs(part) <= 100000 for part in numbers):
        raise ValueError(label + " contains an invalid coordinate")
    return numbers


def finite_quaternion_xyzw(value):
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError("rotationQuaternion must be a 4-number [x, y, z, w] array")
    numbers = [float(part) for part in value]
    if not all(math.isfinite(part) for part in numbers):
        raise ValueError("rotationQuaternion contains a non-finite value")
    norm = math.sqrt(sum(part * part for part in numbers))
    if abs(norm - 1.0) > 1e-3:
        raise ValueError("rotationQuaternion must be normalized")
    return [part / norm for part in numbers]


def apply_transform(obj, spec):
    if "location" in spec:
        obj.location = finite_vector(spec["location"], "location")
    if "rotationQuaternion" in spec:
        x, y, z, w = finite_quaternion_xyzw(spec["rotationQuaternion"])
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = (w, x, y, z)
    elif "rotation" in spec:
        obj.rotation_euler = finite_vector(spec["rotation"], "rotation")
    if "scale" in spec:
        scale = finite_vector(spec["scale"], "scale")
        if not all(0 < part <= 1000 for part in scale):
            raise ValueError("scale values must be positive and <= 1000")
        obj.scale = scale


def create_material(name, rgba):
    if not isinstance(rgba, list) or len(rgba) != 4:
        raise ValueError("color must be RGBA")
    color = [float(part) for part in rgba]
    if not all(math.isfinite(part) and 0 <= part <= 1 for part in color):
        raise ValueError("color components must be between 0 and 1")
    material = bpy.data.materials.new(name=name + "_Material")
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = color
    return material


def add_generated_checker_texture(obj, spec):
    """Create a bounded, packed checker texture for synthetic recipe props."""
    if spec is None:
        return None
    if not isinstance(spec, dict) or spec.get("kind") != "CHECKER":
        raise ValueError("Only the CHECKER synthetic texture recipe is supported")
    resolution = spec.get("resolution")
    cells = spec.get("cells")
    if isinstance(resolution, bool) or not isinstance(resolution, int) or not 32 <= resolution <= 128:
        raise ValueError("Checker texture resolution must be between 32 and 128 pixels")
    if isinstance(cells, bool) or not isinstance(cells, int) or not 2 <= cells <= 16:
        raise ValueError("Checker texture cells must be between 2 and 16")
    colors = [spec.get("colorA"), spec.get("colorB")]
    for color in colors:
        if not isinstance(color, list) or len(color) != 4 or not all(
            isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and 0 <= value <= 1
            for value in color
        ):
            raise ValueError("Checker texture colors must be finite RGBA values in [0, 1]")

    if obj.data.uv_layers.active is None:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
    if obj.data.uv_layers.active is None:
        raise ValueError("Blender could not create a UV map for the generated checker texture")

    image = bpy.data.images.new(
        name=f"{obj.name}_GeneratedChecker", width=resolution, height=resolution,
        alpha=True, float_buffer=False,
    )
    pixels = []
    for y in range(resolution):
        for x in range(resolution):
            cell = ((x * cells) // resolution + (y * cells) // resolution) & 1
            pixels.extend(colors[cell])
    image.pixels.foreach_set(pixels)
    image.pack()

    material = obj.data.materials[-1]
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        raise ValueError("Generated material has no Principled BSDF node")
    uv_node = nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = obj.data.uv_layers.active.name
    texture_node = nodes.new("ShaderNodeTexImage")
    texture_node.image = image
    material.node_tree.links.new(uv_node.outputs["UV"], texture_node.inputs["Vector"])
    material.node_tree.links.new(texture_node.outputs["Color"], bsdf.inputs["Base Color"])
    return image


def create_object(spec):
    name = spec["name"]
    kind = spec["primitive"]
    if bpy.data.objects.get(name) is not None:
        raise ValueError("An object with that name already exists")
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1)
    elif kind == "uv_sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16)
    elif kind == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.5, depth=1)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.5, radius2=0, depth=1)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=12)
    elif kind in ("billboard", "sam_billboard"):
        width = 1.0
        height = 1.8
        half_w = width * 0.5
        verts = [
            Vector((-half_w, 0.0, 0.0)),
            Vector((half_w, 0.0, 0.0)),
            Vector((half_w, 0.0, height)),
            Vector((-half_w, 0.0, height))
        ]
        faces = [(0, 1, 2, 3)]
        mesh = bpy.data.meshes.new(name + "_Mesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
    else:
        raise ValueError("Unsupported primitive")
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    apply_transform(obj, spec)
    if "dagParentIds" in spec:
        obj["atlas_dag_parent_ids"] = json.dumps(spec["dagParentIds"], separators=(",", ":"))
    if spec.get("boneId"):
        obj["atlas_bone_id"] = spec["boneId"]
    if spec.get("rigMode"):
        obj["atlas_rig_mode"] = spec["rigMode"]
    metadata = spec.get("metadata", {})
    if not isinstance(metadata, dict) or len(metadata) > 16:
        raise ValueError("Primitive metadata must contain at most 16 scalar properties")
    for key, value in metadata.items():
        if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]{0,31}", key):
            raise ValueError("Primitive metadata key is invalid")
        if isinstance(value, bool):
            pass
        elif isinstance(value, str) and len(value) <= 256:
            pass
        elif isinstance(value, (int, float)) and math.isfinite(value) and abs(value) <= 1e12:
            pass
        else:
            raise ValueError("Primitive metadata values must be bounded strings, finite numbers, or booleans")
        obj[f"atlas_meta_{key}"] = value
    obj.data.materials.append(create_material(name, spec.get("color", [0.72, 0.55, 0.2, 1])))
    add_generated_checker_texture(obj, spec.get("texture"))
    return obj


def create_mesh(spec):
    name = spec["name"]
    if bpy.data.objects.get(name) is not None:
        raise ValueError("An object with that name already exists")
    vertices = spec.get("vertices", [])
    faces = spec.get("faces", [])
    if len(vertices) < 3 or len(vertices) > 5000 or not faces or len(faces) > 5000:
        raise ValueError("Mesh must contain 3-5000 vertices and 1-5000 faces")
    checked_faces = []
    for face in faces:
        if len(face) not in (3, 4) or any(not isinstance(index, int) or index < 0 or index >= len(vertices) for index in face):
            raise ValueError("Mesh faces must be triangles or quads with valid vertex indices")
        checked_faces.append(face)
    coords = [finite_vector(vertex, "vertex") for vertex in vertices]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(coords, [], checked_faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    apply_transform(obj, spec)
    obj.data.materials.append(create_material(name, spec.get("color", [0.72, 0.55, 0.2, 1])))
    return obj


def create_skeleton(spec):
    """Create a bounded armature from validated parent-first bone recipes."""
    if not spec:
        return None
    bones = spec.get("bones")
    if not isinstance(bones, list) or not 1 <= len(bones) <= 64:
        raise ValueError("Skeleton must contain 1 to 64 bones")
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    armature = bpy.context.object
    armature.name = "Atlas_Skeleton"
    armature.data.name = "Atlas_Skeleton_Data"
    edit_bones = armature.data.edit_bones
    for existing in list(edit_bones):
        edit_bones.remove(existing)
    created = {}
    for spec_bone in bones:
        bone_id = spec_bone.get("boneId")
        parent_id = spec_bone.get("parentBoneId")
        head = finite_vector(spec_bone.get("head"), "bone head")
        tail = finite_vector(spec_bone.get("tail"), "bone tail")
        if not isinstance(bone_id, str) or not bone_id or bone_id in created:
            raise ValueError("Bone IDs must be unique non-empty strings")
        bone = edit_bones.new(bone_id)
        bone.head = head
        bone.tail = tail
        if parent_id:
            parent = created.get(parent_id)
            if parent is None:
                raise ValueError("Bone recipes must be ordered parent-first")
            bone.parent = parent
        created[bone_id] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    armature["atlas_rig_schema"] = "parent-atlas.scene-recipe-rig.v1"
    return armature


def bind_objects_to_skeleton(objects, armature):
    """Rigidly or gradated skin each declared primitive to named bones using vertex weights."""
    if not armature:
        return 0
    bone_names = {bone.name for bone in armature.data.bones}
    bound = 0
    for obj in objects:
        bone_id = obj.get("atlas_bone_id")
        rig_mode = obj.get("atlas_rig_mode", "rigid")
        if not bone_id and rig_mode != "gradient_2bone":
            continue
        if bone_id and bone_id not in bone_names:
            raise ValueError("Primitive references a bone missing from the armature")

        if rig_mode == "gradient_2bone" and len(armature.data.bones) >= 2:
            bone0 = armature.data.bones[0].name
            bone1 = armature.data.bones[1].name
            g0 = obj.vertex_groups.new(name=bone0)
            g1 = obj.vertex_groups.new(name=bone1)
            zs = [vertex.co.z for vertex in obj.data.vertices]
            min_z = min(zs) if zs else 0.0
            max_z = max(zs) if zs else 1.0
            range_z = max(1e-5, max_z - min_z)
            for vertex in obj.data.vertices:
                t = (vertex.co.z - min_z) / range_z
                g0.add([vertex.index], 1.0 - t, "REPLACE")
                g1.add([vertex.index], t, "REPLACE")
        else:
            group = obj.vertex_groups.new(name=bone_id)
            vertices = [vertex.index for vertex in obj.data.vertices]
            if vertices:
                group.add(vertices, 1.0, "REPLACE")

        modifier = obj.modifiers.new(name="Atlas_Armature", type="ARMATURE")
        modifier.object = armature
        bpy.context.view_layer.update()
        world_matrix = obj.matrix_world.copy()
        obj.parent = armature
        obj.matrix_parent_inverse = armature.matrix_world.inverted()
        obj.matrix_world = world_matrix
        bpy.context.view_layer.update()
        if bone_id:
            obj["atlas_bone_id"] = bone_id
        bound += 1
    return bound


def apply_transform_animation(animation, objects, armature=None):
    """Apply bounded object and bone keyframes to an exported GLB clip."""
    if not animation:
        return {"objectTrackCount": 0, "boneTrackCount": 0}
    if not isinstance(animation, dict) or not isinstance(animation.get("tracks"), list):
        raise ValueError("Animation must contain a track list")
    by_name = {obj.name: obj for obj in objects}
    name = animation.get("name")
    fps = animation.get("fps")
    if not isinstance(name, str) or not name or isinstance(fps, bool) or not isinstance(fps, int) or not 1 <= fps <= 120:
        raise ValueError("Animation name or frame rate is invalid")
    tracks = animation.get("tracks", [])
    bone_tracks = animation.get("boneTracks", [])
    if not isinstance(tracks, list) or not isinstance(bone_tracks, list) or not tracks and not bone_tracks or len(tracks) > 100 or len(bone_tracks) > 32:
        raise ValueError("Animation must contain bounded object or bone tracks")
    seen = set()
    final_frame = 0
    for track in tracks:
        node_id = track.get("nodeId")
        if node_id not in by_name or node_id in seen:
            raise ValueError("Animation track references an unknown or duplicate node")
        seen.add(node_id)
        keyframes = track.get("keyframes")
        if not isinstance(keyframes, list) or not 2 <= len(keyframes) <= 120:
            raise ValueError("Each animation track must contain 2 to 120 keyframes")
        frames = set()
        obj = by_name[node_id]
        for keyframe in keyframes:
            frame = keyframe.get("frame")
            if isinstance(frame, bool) or not isinstance(frame, int) or not 0 <= frame <= 100000 or frame in frames:
                raise ValueError("Animation keyframe index is invalid or duplicated")
            frames.add(frame)
            final_frame = max(final_frame, frame)
            channels = 0
            if "location" in keyframe:
                obj.location = finite_vector(keyframe["location"], "animation location")
                obj.keyframe_insert(data_path="location", frame=frame, group=name)
                channels += 1
            if "rotationQuaternion" in keyframe:
                x, y, z, w = finite_quaternion_xyzw(keyframe["rotationQuaternion"])
                obj.rotation_mode = "QUATERNION"
                obj.rotation_quaternion = (w, x, y, z)
                obj.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
                channels += 1
            if "scale" in keyframe:
                scale = finite_vector(keyframe["scale"], "animation scale")
                if not all(0 < part <= 1000 for part in scale):
                    raise ValueError("Animation scale values must be positive and <= 1000")
                obj.scale = scale
                obj.keyframe_insert(data_path="scale", frame=frame, group=name)
                channels += 1
            if channels == 0:
                raise ValueError("Each animation keyframe must animate a transform channel")
        if obj.animation_data and obj.animation_data.action:
            obj.animation_data.action.name = name
    animated_bones = set()
    if bone_tracks and not armature:
        raise ValueError("Bone animation requires a skeleton")
    for track in bone_tracks:
        bone_id = track.get("boneId")
        if not isinstance(bone_id, str) or bone_id in animated_bones:
            raise ValueError("Bone animation tracks must reference unique bones")
        pose_bone = armature.pose.bones.get(bone_id)
        if pose_bone is None:
            raise ValueError("Bone animation references an unknown bone")
        animated_bones.add(bone_id)
        keyframes = track.get("keyframes")
        if not isinstance(keyframes, list) or not 2 <= len(keyframes) <= 120:
            raise ValueError("Each bone animation track must contain 2 to 120 keyframes")
        frames = set()
        for keyframe in keyframes:
            frame = keyframe.get("frame")
            if isinstance(frame, bool) or not isinstance(frame, int) or not 0 <= frame <= 100000 or frame in frames:
                raise ValueError("Bone keyframe index is invalid or duplicated")
            frames.add(frame)
            final_frame = max(final_frame, frame)
            channels = 0
            if "location" in keyframe:
                pose_bone.location = finite_vector(keyframe["location"], "bone animation location")
                pose_bone.keyframe_insert(data_path="location", frame=frame, group=name)
                channels += 1
            if "rotationQuaternion" in keyframe:
                x, y, z, w = finite_quaternion_xyzw(keyframe["rotationQuaternion"])
                pose_bone.rotation_mode = "QUATERNION"
                pose_bone.rotation_quaternion = (w, x, y, z)
                pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
                channels += 1
            if "scale" in keyframe:
                scale = finite_vector(keyframe["scale"], "bone animation scale")
                if not all(0 < part <= 1000 for part in scale):
                    raise ValueError("Bone animation scale values must be positive and <= 1000")
                pose_bone.scale = scale
                pose_bone.keyframe_insert(data_path="scale", frame=frame, group=name)
                channels += 1
            if channels == 0:
                raise ValueError("Each bone keyframe must animate a transform channel")
        if armature.animation_data and armature.animation_data.action:
            armature.animation_data.action.name = name
    bpy.context.scene.render.fps = fps
    bpy.context.scene.frame_end = max(final_frame, 1)
    bpy.context.scene["atlas_animation_name"] = name
    return {"objectTrackCount": len(tracks), "boneTrackCount": len(bone_tracks)}


def create_memory_block(block, domain, tier_index, tier_counts):
    """Create one low-polygon 8x8 display tile; cells are not token contents."""
    tiers = {
        "hot": (2.8, [0.92, 0.29, 0.12, 1.0]),
        "warm": (0.0, [0.88, 0.63, 0.17, 1.0]),
        "cold": (-2.8, [0.22, 0.56, 0.82, 1.0]),
    }
    tier_y, tier_color = tiers[block["tier"]]
    position_in_tier = tier_counts[block["tier"]]
    x = (position_in_tier - (tier_counts[block["tier"] + "_total"] - 1) / 2.0) * 2.25
    tier_counts[block["tier"]] += 1

    # Mix the declared domain color into the residency tier color for a subtle
    # secondary cue. This visualizes caller-supplied classification only.
    rgba = [tier_color[i] * 0.78 + domain["color"][i] * 0.22 for i in range(3)] + [1.0]
    name = "memory_" + block["id"]
    if bpy.data.objects.get(name) is not None:
        raise ValueError("Duplicate memory block id")

    width, depth = 1.55, 1.25
    height = 0.22 + 0.35 * float(block["residencyScore"])
    # Four bottom corners and an 8x8 quad matrix on top. 4,096-token blocks
    # use 64 display cells (64 tokens per cell) to keep geometry bounded.
    vertices = [
        (-width / 2, -depth / 2, -height / 2),
        ( width / 2, -depth / 2, -height / 2),
        ( width / 2,  depth / 2, -height / 2),
        (-width / 2,  depth / 2, -height / 2),
    ]
    steps = 8
    for row in range(steps + 1):
        for col in range(steps + 1):
            vertices.append((-width / 2 + width * col / steps, -depth / 2 + depth * row / steps, height / 2))

    def top(row, col):
        return 4 + row * (steps + 1) + col

    faces = [(3, 2, 1, 0)]
    for row in range(steps):
        for col in range(steps):
            faces.append((top(row, col), top(row, col + 1), top(row + 1, col + 1), top(row + 1, col)))
    for col in range(steps):
        faces.append((0, 1, top(0, col + 1), top(0, col)))
        faces.append((1, 2, top(col + 1, steps), top(col, steps)))
        faces.append((2, 3, top(steps, col), top(steps, col + 1)))
        faces.append((3, 0, top(col, 0), top(col + 1, 0)))

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (x, tier_y, 0.0)
    obj.rotation_euler = tuple(math.radians(float(value)) for value in block["rotationDeg"])
    obj.data.materials.append(create_material(name, rgba))
    obj["visualization"] = "SYNTHETIC_INPUTS_ONLY"
    obj["cache_tier"] = block["tier"]
    residency = block.get("residency", "UNSPECIFIED")
    obj["residency_tier"] = residency
    if block.get("payloadKind"):
        obj["payload_kind"] = block["payloadKind"]
    if block.get("representation"):
        obj["representation"] = block["representation"]
    if block.get("vectorDimensions") is not None:
        obj["vector_dimensions"] = int(block["vectorDimensions"])
    payload_bytes = block.get("payloadBytes")
    if block.get("payloadKind") == "EMBEDDING_VECTOR" and payload_bytes is None:
        payload_bytes = embedding_payload_bytes(block["representation"], block["vectorDimensions"])
    if payload_bytes is not None:
        obj["payload_bytes"] = int(payload_bytes)
    if block.get("payloadKind") == "EMBEDDING_VECTOR" and block.get("representation") == "FP8_STORAGE_ONLY":
        obj["encoding_semantics"] = "ONE_BYTE_PER_VALUE_STORAGE_ESTIMATE_ONLY"
        obj["hardware_execution"] = "NOT_SUPPORTED_BY_DECLARED_RTX_3060_TI_FP8_TENSOR_CORES"
    elif block.get("payloadKind") == "EMBEDDING_VECTOR":
        obj["encoding_semantics"] = "PACKED_OR_ELEMENT_PAYLOAD_SIZE_ONLY_NOT_RUNTIME_EXECUTION_PROOF"
    obj["domain_id"] = block["domainId"]
    obj["packet_key"] = block["packetKey"]
    obj["token_start"] = int(block["tokenStart"])
    obj["token_count"] = int(block["tokenCount"])
    obj["token_block_size"] = 4096
    obj["display_cells"] = 64
    obj["tokens_per_display_cell"] = 64
    obj["residency_score_input"] = float(block["residencyScore"])
    obj["isoquant_rotation_deg_input"] = [float(value) for value in block["rotationDeg"]]

    # Text is converted to mesh so it remains visible in a GLB export.
    bpy.ops.object.text_add(location=(x, tier_y, height / 2 + 0.04))
    text_obj = bpy.context.object
    text_obj.name = name + "_label"
    payload_label = ""
    if block.get("payloadKind") == "EMBEDDING_VECTOR":
        payload_label = "  " + str(block["vectorDimensions"]) + "D " + block["representation"] + " " + str(payload_bytes) + "B"
    elif payload_bytes is not None:
        payload_label = "  " + str(payload_bytes) + "B"
    text_obj.data.body = (block["id"] + "  " + block["label"] + ("  [" + residency + "]" if residency != "UNSPECIFIED" else "") + payload_label)[:80]
    text_obj.data.size = 0.16
    text_obj.data.align_x = "CENTER"
    bpy.ops.object.convert(target="MESH")
    label_obj = bpy.context.object
    label_obj.name = name + "_label"
    label_obj.data.materials.append(create_material(name + "_label", [0.96, 0.88, 0.66, 1.0]))
    return obj, label_obj


def create_memory_fabric(spec, glb_path):
    if int(spec.get("tokenBlockSize", 0)) != 4096:
        raise ValueError("Memory-fabric tokenBlockSize must be 4096")
    gpu_profile = spec.get("gpuProfile")
    if gpu_profile not in (None, "RTX_3060_TI_8GB"):
        raise ValueError("Unsupported declared GPU profile")
    max_triangles = spec.get("maxTriangles", 100000)
    if isinstance(max_triangles, bool) or not isinstance(max_triangles, int) or max_triangles < 1 or max_triangles > 1000000:
        raise ValueError("Memory-fabric maxTriangles must be an integer from 1 to 1000000")
    domains = spec.get("domains", [])
    blocks = spec.get("blocks", [])
    edges = spec.get("edges", [])
    cache_moves = spec.get("cacheMoves", [])
    index_builds = spec.get("indexBuilds", [])
    if not domains or len(domains) > 8 or not blocks or len(blocks) > 24 or len(edges) > 64 or len(cache_moves) > 64 or len(index_builds) > 2:
        raise ValueError("Memory fabric exceeds its bounded domains, blocks, DAG edges, or cache moves")
    if len({item.get("engine") for item in index_builds}) != len(index_builds):
        raise ValueError("Each index engine may appear at most once")
    for item in index_builds:
        if item.get("engine") not in ("PGVECTOR_HNSW", "CUVS_CAGRA") or item.get("status") not in ("PLANNED", "MEASURED"):
            raise ValueError("Index build must name a supported engine and PLANNED or MEASURED status")
        if item["status"] == "MEASURED":
            required = ("datasetRevision", "receiptRef", "hardware", "vectorCount", "dimensions", "buildTimeMs", "recallAt10")
            if any(item.get(key) is None for key in required):
                raise ValueError("Measured index build requires a dataset, receipt, hardware, dimensions, build time, and Recall@10")
            if isinstance(item["buildTimeMs"], bool) or not isinstance(item["buildTimeMs"], (int, float)) or not math.isfinite(item["buildTimeMs"]) or item["buildTimeMs"] <= 0:
                raise ValueError("Measured buildTimeMs must be positive")
            if isinstance(item["recallAt10"], bool) or not isinstance(item["recallAt10"], (int, float)) or not 0 <= item["recallAt10"] <= 1:
                raise ValueError("Measured Recall@10 must be between 0 and 1")
            for key, maximum in (("vectorCount", 100000000), ("dimensions", 65536)):
                value = item[key]
                if isinstance(value, bool) or not isinstance(value, int) or value < 1 or value > maximum:
                    raise ValueError("Measured " + key + " is outside its supported positive integer range")
            for key, maximum in (("datasetRevision", 96), ("receiptRef", 160), ("hardware", 120)):
                value = item[key]
                if not isinstance(value, str) or not value.strip() or len(value) > maximum:
                    raise ValueError("Measured " + key + " must be a non-empty bounded string")
    domain_by_id = {domain["id"]: domain for domain in domains}
    block_by_id = {block["id"]: block for block in blocks}
    if len(domain_by_id) != len(domains) or len(block_by_id) != len(blocks):
        raise ValueError("Domain and block IDs must be unique")
    if any(block["domainId"] not in domain_by_id for block in blocks):
        raise ValueError("Every block must reference a declared domain")
    allowed_residencies = ("GPU_VRAM", "CPU_RAM", "VALKEY", "POSTGRES")
    if any(block.get("residency") is not None and block.get("residency") not in allowed_residencies for block in blocks):
        raise ValueError("Memory block has an unsupported residency tier")
    allowed_payload_kinds = ("TOKEN_BLOCK", "EMBEDDING_VECTOR", "PACKET")
    allowed_representations = ("FP32", "FP16", "BF16", "INT8", "PACKED_INT4", "PACKED_2BIT", "FP8_STORAGE_ONLY")
    for block in blocks:
        kind = block.get("payloadKind")
        representation = block.get("representation")
        dimensions = block.get("vectorDimensions")
        payload_bytes = block.get("payloadBytes")
        if kind is not None and kind not in allowed_payload_kinds:
            raise ValueError("Memory block has an unsupported payload kind")
        if representation is not None and representation not in allowed_representations:
            raise ValueError("Memory block has an unsupported representation")
        if kind == "EMBEDDING_VECTOR":
            if representation is None or isinstance(dimensions, bool) or not isinstance(dimensions, int) or dimensions < 1 or dimensions > 65536:
                raise ValueError("Embedding vector block requires a supported representation and positive vectorDimensions")
            expected_bytes = embedding_payload_bytes(representation, dimensions)
            if payload_bytes is not None and payload_bytes != expected_bytes:
                raise ValueError("Embedding payloadBytes must match dimensions and representation")
        elif dimensions is not None:
            raise ValueError("vectorDimensions is only valid for EMBEDDING_VECTOR blocks")
        if payload_bytes is not None and (isinstance(payload_bytes, bool) or not isinstance(payload_bytes, int) or payload_bytes < 1 or payload_bytes > 2 ** 40):
            raise ValueError("payloadBytes must be a positive integer within the supported bound")
    if any(edge["from"] not in block_by_id or edge["to"] not in block_by_id or edge["from"] == edge["to"] for edge in edges):
        raise ValueError("Every DAG edge must connect two different declared blocks")
    if len({(edge["from"], edge["to"]) for edge in edges}) != len(edges):
        raise ValueError("Duplicate DAG edges are not allowed")
    move_ids = [move.get("id") for move in cache_moves]
    move_sequences = [move.get("sequence") for move in cache_moves]
    if len(set(move_ids)) != len(move_ids) or len(set(move_sequences)) != len(move_sequences):
        raise ValueError("Cache-move IDs and sequence numbers must be unique")
    for move in cache_moves:
        source = block_by_id.get(move.get("fromBlockId"))
        target = block_by_id.get(move.get("toBlockId"))
        if not source or not target or source["id"] == target["id"]:
            raise ValueError("Every cache move must connect two different declared blocks")
        if source["packetKey"] != target["packetKey"] or source["tier"] == target["tier"]:
            raise ValueError("Cache moves must connect different residency tiers for the same packetKey")
        transport = move.get("transport")
        allowed_transports = {
            "HOST_TO_DEVICE": ("CPU_RAM", "GPU_VRAM"),
            "DEVICE_TO_HOST": ("GPU_VRAM", "CPU_RAM"),
            "VALKEY_READ": ("VALKEY", "CPU_RAM"),
            "POSTGRES_READ": ("POSTGRES", "CPU_RAM"),
            "CPU_COPY": ("CPU_RAM", "CPU_RAM"),
            "GPU_LOCAL": ("GPU_VRAM", "GPU_VRAM"),
        }
        if transport is not None:
            if transport not in allowed_transports:
                raise ValueError("Cache move has an unsupported transport")
            if (source.get("residency", "UNSPECIFIED"), target.get("residency", "UNSPECIFIED")) != allowed_transports[transport]:
                raise ValueError("Cache move transport does not match its declared residency endpoints")
        if isinstance(move.get("sequence"), bool) or not isinstance(move.get("sequence"), int) or move["sequence"] < 1 or move["sequence"] > 1000000:
            raise ValueError("Cache-move sequence must be an integer from 1 to 1000000")
        if move.get("reason") not in ("prefill", "cache_promotion", "cache_demotion", "eviction", "recovery"):
            raise ValueError("Cache move has an unsupported reason")
        gate_id = move.get("gateId")
        if gate_id is not None and (not isinstance(gate_id, str) or not gate_id.strip() or len(gate_id) > 48):
            raise ValueError("Cache-move gateId must be a non-empty string up to 48 characters")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    tier_counts = {"hot": 0, "warm": 0, "cold": 0}
    for tier in ("hot", "warm", "cold"):
        tier_counts[tier + "_total"] = sum(1 for block in blocks if block["tier"] == tier)
    created = {}
    for block in blocks:
        obj, _label_obj = create_memory_block(block, domain_by_id[block["domainId"]], 0, tier_counts)
        created[block["id"]] = obj

    relation_colors = {
        "depends_on": [0.94, 0.76, 0.3, 1.0],
        "routes_to": [0.3, 0.82, 0.91, 1.0],
        "summarizes": [0.72, 0.52, 0.9, 1.0],
    }
    for index, edge in enumerate(edges):
        source = created[edge["from"]]
        target = created[edge["to"]]
        start = source.location.copy()
        end = target.location.copy()
        start.z += 0.42
        end.z += 0.42
        direction = end - start
        distance = direction.length
        if distance <= 0:
            raise ValueError("DAG edge endpoints must differ")
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.018, depth=distance, location=(start + end) / 2)
        link = bpy.context.object
        link.name = "dag_link_" + str(index + 1)
        link.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
        link.data.materials.append(create_material(link.name, relation_colors[edge["kind"]]))
        link["visualization"] = "SYNTHETIC_DAG_INPUT"
        link["from_block"] = edge["from"]
        link["to_block"] = edge["to"]
        link["relation_kind"] = edge["kind"]

    # Ordered cache movements are separate from the dependency DAG. They are
    # synthetic caller inputs, not observations of live KV residency.
    move_material = create_material("cache_move_material", [0.78, 0.36, 0.91, 1.0])
    for move in sorted(cache_moves, key=lambda value: value["sequence"]):
        source_obj = created[move["fromBlockId"]]
        target_obj = created[move["toBlockId"]]
        source_block = block_by_id[move["fromBlockId"]]
        target_block = block_by_id[move["toBlockId"]]
        start = source_obj.location.copy()
        end = target_obj.location.copy()
        start.z += 0.56
        end.z += 0.56
        direction = end - start
        distance = direction.length
        if distance <= 0:
            raise ValueError("Cache-move endpoints must differ")
        axis = direction.normalized()
        arrow_length = min(0.24, distance * 0.28)
        shaft_end = end - axis * arrow_length
        shaft_direction = shaft_end - start
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=0.025,
            depth=shaft_direction.length,
            location=(start + shaft_end) / 2,
        )
        shaft = bpy.context.object
        shaft.name = "cache_move_" + move["id"] + "_shaft"
        shaft.rotation_euler = shaft_direction.to_track_quat("Z", "Y").to_euler()
        shaft.data.materials.append(move_material)
        shaft["visualization"] = "SYNTHETIC_CACHE_MOVE_INPUT"
        shaft["cache_move_id"] = move["id"]
        shaft["sequence"] = move["sequence"]
        shaft["packet_key"] = source_block["packetKey"]
        shaft["from_tier"] = source_block["tier"]
        shaft["to_tier"] = target_block["tier"]
        shaft["reason"] = move["reason"]
        shaft["transport"] = move.get("transport", "UNSPECIFIED")
        shaft["from_residency"] = source_block.get("residency", "UNSPECIFIED")
        shaft["to_residency"] = target_block.get("residency", "UNSPECIFIED")
        if move.get("gateId"):
            shaft["gate_id"] = move["gateId"]

        bpy.ops.mesh.primitive_cone_add(
            vertices=8,
            radius1=0.075,
            radius2=0.0,
            depth=arrow_length,
            location=(shaft_end + end) / 2,
        )
        arrow = bpy.context.object
        arrow.name = "cache_move_" + move["id"] + "_arrow"
        arrow.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
        arrow.data.materials.append(move_material)
        arrow["visualization"] = "SYNTHETIC_CACHE_MOVE_INPUT"
        arrow["cache_move_id"] = move["id"]

        if move.get("transport"):
            label_position = (start + end) / 2
            label_position.z += 0.18
            bpy.ops.object.text_add(location=label_position)
            move_label = bpy.context.object
            move_label.name = "cache_move_" + move["id"] + "_transport_label"
            move_label.data.body = move["transport"]
            move_label.data.size = 0.09
            move_label.data.materials.append(create_material(move_label.name, [0.82, 0.9, 1.0, 1.0]))
            bpy.ops.object.convert(target="MESH")
            move_label = bpy.context.object
            move_label.name = "cache_move_" + move["id"] + "_transport_label"

    # Index construction is a separate comparison layer, not a DAG edge,
    # cache move, or additional retrieval vote. Unmeasured rows display no
    # invented timing. A measured card carries its receipt identity in GLB metadata.
    index_colors = {
        "PGVECTOR_HNSW": [0.88, 0.56, 0.18, 1.0],
        "CUVS_CAGRA": [0.18, 0.62, 0.82, 1.0],
    }
    index_records = []
    for row, item in enumerate(index_builds):
        engine = item["engine"]
        status = item["status"]
        x, y, z = 5.0, 2.3 - row * 1.65, 0.12
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
        card = bpy.context.object
        card.name = "index_build_" + item["id"]
        card.dimensions = (3.5, 1.1, 0.12)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        card.data.materials.append(create_material(card.name, index_colors[engine]))
        card["visualization"] = "INDEX_BUILD_COMPARISON"
        card["engine"] = engine
        card["status"] = status
        card["measured"] = status == "MEASURED"
        for key in ("datasetRevision", "receiptRef", "hardware", "vectorCount", "dimensions", "buildTimeMs", "recallAt10"):
            if key in item:
                card[key] = item[key]

        title = "PGVECTOR HNSW" if engine == "PGVECTOR_HNSW" else "cuVS CAGRA"
        detail = title + "  |  " + status
        if status == "MEASURED":
            detail += "  |  " + str(item["vectorCount"]) + " x " + str(item["dimensions"]) + "  |  " + str(item["buildTimeMs"]) + " ms  |  R@10 " + format(item["recallAt10"], ".3f")
        bpy.ops.object.text_add(location=(x - 1.58, y - 0.06, z + 0.13))
        label = bpy.context.object
        label.name = card.name + "_label"
        label.data.body = detail
        label.data.size = 0.13
        label.data.materials.append(create_material(label.name, [0.96, 0.91, 0.78, 1.0]))
        index_records.append({
            "id": item["id"], "engine": engine, "status": status,
            "datasetRevision": item.get("datasetRevision"),
            "receiptRef": item.get("receiptRef"),
            "hardware": item.get("hardware"),
            "vectorCount": item.get("vectorCount"), "dimensions": item.get("dimensions"),
            "buildTimeMs": item.get("buildTimeMs"), "recallAt10": item.get("recallAt10"),
        })

    # Add a visible legend and per-tier labels; all are simple converted text meshes.
    for row, (tier, y, color) in enumerate([
        ("HOT CACHE", 3.45, [0.96, 0.36, 0.2, 1.0]),
        ("WARM CACHE", 0.65, [0.96, 0.72, 0.24, 1.0]),
        ("COLD CACHE", -2.15, [0.34, 0.68, 0.92, 1.0]),
    ]):
        bpy.ops.object.text_add(location=(-5.1, y, 0.0))
        legend = bpy.context.object
        legend.name = "tier_legend_" + tier.lower().replace(" ", "_")
        legend.data.body = tier + "  ·  4096 TOKENS / BLOCK"
        legend.data.size = 0.22
        bpy.ops.object.convert(target="MESH")
        legend = bpy.context.object
        legend.name = "tier_legend_" + tier.lower().replace(" ", "_")
        legend.data.materials.append(create_material(legend.name, color))
    scene = bpy.context.scene
    if gpu_profile == "RTX_3060_TI_8GB":
        bpy.ops.object.text_add(location=(-5.1, 4.2, 0.0))
        gpu_label = bpy.context.object
        gpu_label.name = "declared_gpu_profile"
        gpu_label.data.body = "RTX 3060 Ti  ·  8 GiB TOTAL  ·  FREE VRAM UNMEASURED"
        gpu_label.data.size = 0.16
        gpu_label.data.materials.append(create_material(gpu_label.name, [0.96, 0.78, 0.28, 1.0]))
        bpy.ops.object.convert(target="MESH")
        gpu_label = bpy.context.object
        gpu_label.name = "declared_gpu_profile"
        gpu_label["profile"] = "RTX_3060_TI_8GB"
        gpu_label["total_vram_gib"] = 8
        gpu_label["free_vram_measured"] = False
    # The glTF exporter turns Blender FONT objects into meshes. Convert them
    # before measuring so the triangle/mesh receipts and the declared budget
    # include exactly the geometry that the exported GLB will contain.
    font_objects = [obj for obj in scene.objects if obj.type == "FONT"]
    for font_obj in font_objects:
        bpy.ops.object.select_all(action="DESELECT")
        font_obj.select_set(True)
        bpy.context.view_layer.objects.active = font_obj
        bpy.ops.object.convert(target="MESH")
    text_object_conversion_count = len(font_objects)
    mesh_objects = [obj for obj in scene.objects if obj.type == "MESH"]
    vertex_count = sum(len(obj.data.vertices) for obj in mesh_objects)
    polygon_count = sum(len(obj.data.polygons) for obj in mesh_objects)
    triangle_count = sum(max(0, len(poly.vertices) - 2) for obj in mesh_objects for poly in obj.data.polygons)
    if triangle_count > max_triangles:
        raise ValueError("Memory-fabric triangle budget exceeded: measured " + str(triangle_count) + ", maximum " + str(max_triangles))
    scene["atlas_visualization"] = "SYNTHETIC_MEMORY_FABRIC_V1"
    scene["token_block_size"] = 4096
    scene["live_cache_read"] = False
    scene["mesh_triangle_count"] = triangle_count
    scene["mesh_triangle_budget"] = max_triangles
    scene["text_objects_converted_for_export"] = text_object_conversion_count
    scene["cache_move_count"] = len(cache_moves)
    scene["index_build_count"] = len(index_builds)
    scene["gpu_profile"] = gpu_profile or "UNSPECIFIED"
    scene["gpu_total_vram_gib"] = 8 if gpu_profile == "RTX_3060_TI_8GB" else 0
    scene["gpu_free_vram_measured"] = False
    return {
        "operation": "create_memory_fabric",
        "sceneName": spec.get("name", "Atlas Memory Fabric"),
        "provenance": "SYNTHETIC_INPUTS_ONLY",
        "liveCacheRead": False,
        "tokenBlockSize": 4096,
        "displayGrid": "8x8; each cell represents 64 token positions for visualization only",
        "blockCount": len(blocks),
        "domainCount": len(domains),
        "dagEdgeCount": len(edges),
        "cacheMoveCount": len(cache_moves),
        "indexBuildCount": len(index_records),
        "gpuProfile": gpu_profile or "UNSPECIFIED",
        "gpuTotalVramGiB": 8 if gpu_profile == "RTX_3060_TI_8GB" else None,
        "gpuFreeVramMeasured": False,
        "indexBuilds": index_records,
        "cacheMoveProvenance": "SYNTHETIC_INPUTS_ONLY" if cache_moves else "NONE_PROVIDED",
        "cacheMoves": [
            {
                "id": move["id"],
                "sequence": move["sequence"],
                "packetKey": block_by_id[move["fromBlockId"]]["packetKey"],
                "fromTier": block_by_id[move["fromBlockId"]]["tier"],
                "toTier": block_by_id[move["toBlockId"]]["tier"],
                "reason": move["reason"],
                "transport": move.get("transport", "UNSPECIFIED"),
                "fromResidency": block_by_id[move["fromBlockId"]].get("residency", "UNSPECIFIED"),
                "toResidency": block_by_id[move["toBlockId"]].get("residency", "UNSPECIFIED"),
                "gateId": move.get("gateId"),
            }
            for move in sorted(cache_moves, key=lambda value: value["sequence"])
        ],
        # glTF export can split Blender vertices at attribute seams. Keep the
        # Blender-side count explicit and report re-import counts separately.
        "blenderSceneVertexCount": vertex_count,
        "vertexCount": vertex_count,
        "polygonCount": polygon_count,
        "triangleCount": triangle_count,
        "triangleBudget": max_triangles,
        "triangleBudgetStatus": "WITHIN_BUDGET",
        "meshObjectCount": len(mesh_objects),
        "textObjectsConvertedForExport": text_object_conversion_count,
        "simtGpuExecutionMeasured": False,
        "gpuPerformanceNote": "Geometry totals are measured in the Blender scene before export; glTF may split vertices at attribute seams. GPU occupancy, warp scheduling, vertex throughput, and frame time are not measured.",
        "tierCounts": {tier: sum(1 for block in blocks if block["tier"] == tier) for tier in ("hot", "warm", "cold")},
        "blockIds": list(block_by_id.keys()),
        "blockResidencies": [
            {"blockId": block["id"], "packetKey": block["packetKey"], "tier": block["tier"], "residency": block.get("residency", "UNSPECIFIED")}
            for block in blocks
        ],
        "blockPayloads": [
            {
                "blockId": block["id"], "payloadKind": block.get("payloadKind", "UNSPECIFIED"),
                "representation": block.get("representation", "UNSPECIFIED"),
                "vectorDimensions": block.get("vectorDimensions"),
                "payloadBytes": block.get("payloadBytes") if block.get("payloadBytes") is not None else (embedding_payload_bytes(block["representation"], block["vectorDimensions"]) if block.get("payloadKind") == "EMBEDDING_VECTOR" else None),
            }
            for block in blocks
        ],
        "glbPath": glb_path,
    }


def object_record(obj):
    obj.update_tag()
    dimensions = [round(float(value), 6) for value in obj.dimensions]
    rotation = obj.rotation_quaternion if obj.rotation_mode == "QUATERNION" else obj.rotation_euler.to_quaternion()
    try:
        dag_parent_ids = json.loads(obj.get("atlas_dag_parent_ids", "[]"))
    except (TypeError, ValueError):
        dag_parent_ids = []
    return {
        "name": obj.name,
        "type": obj.type,
        "location": [round(float(value), 6) for value in obj.location],
        "rotation": [round(float(value), 6) for value in obj.rotation_euler],
        "rotationQuaternion": [round(float(rotation.x), 6), round(float(rotation.y), 6), round(float(rotation.z), 6), round(float(rotation.w), 6)],
        "scale": [round(float(value), 6) for value in obj.scale],
        "dimensions": dimensions,
        "dagParentIds": dag_parent_ids,
    }


def inspect_scene():
    objects = sorted((object_record(obj) for obj in bpy.context.scene.objects), key=lambda item: item["name"])
    return {"operation": "inspect_scene", "objects": objects, "objectCount": len(objects), **scene_geometry_stats(), "bounds": scene_mesh_bounds()}


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 1:
        raise ValueError("Expected a single request JSON path")
    with open(args[0], "r", encoding="utf-8") as handle:
        request = json.load(handle)
    operation = request.get("operation")
    payload = request.get("payload", {})
    output_path = request.get("outputPath")

    if operation == "inspect_scene":
        result = inspect_scene()
    elif operation == "create_model":
        # Factory startup is still cleared explicitly so behavior is deterministic.
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        specs = payload.get("objects", [])
        if not specs or len(specs) > 100:
            raise ValueError("create_model requires 1 to 100 objects")
        armature = create_skeleton(payload.get("skeleton"))
        created = [create_object(spec) for spec in specs]
        bound_mesh_count = bind_objects_to_skeleton(created, armature)
        animation_result = apply_transform_animation(payload.get("animation"), created, armature)
        result = {"operation": operation, "objects": [object_record(obj) for obj in created], "objectCount": len(created)}
        if armature:
            result["skeleton"] = {"boneCount": len(armature.data.bones), "boundMeshCount": bound_mesh_count, "rigging": "RIGID_VERTEX_GROUP_WEIGHTS"}
        if animation_result["objectTrackCount"] or animation_result["boneTrackCount"]:
            result["animation"] = {
                "name": payload["animation"]["name"],
                "fps": payload["animation"]["fps"],
                **animation_result,
                "frameEnd": bpy.context.scene.frame_end,
                "kind": "SKELETAL_AND_OBJECT_TRANSFORM_KEYFRAMES" if animation_result["boneTrackCount"] else "OBJECT_TRANSFORM_KEYFRAMES",
            }
        glb_path = payload.get("glbOutputPath")
        if glb_path is not None:
            max_triangles = payload.get("maxTriangles")
            max_glb_bytes = payload.get("maxGlbBytes")
            if not isinstance(glb_path, str) or not glb_path.lower().endswith(".glb") or os.path.exists(glb_path):
                raise ValueError("Recipe GLB output must be a new .glb path")
            if isinstance(max_triangles, bool) or not isinstance(max_triangles, int) or max_triangles < 1:
                raise ValueError("Recipe triangle budget must be a positive integer")
            if isinstance(max_glb_bytes, bool) or not isinstance(max_glb_bytes, int) or max_glb_bytes < 1:
                raise ValueError("Recipe GLB byte target must be a positive integer")
            geometry = scene_geometry_stats()
            if geometry["triangleCount"] > max_triangles:
                raise ValueError("Recipe exceeds its declared triangle budget")
            os.makedirs(os.path.dirname(glb_path), exist_ok=True)
            bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=False, export_extras=True, export_animations=True)
            glb_bytes = os.path.getsize(glb_path)
            result.update({
                **geometry,
                "glbOutputPath": glb_path,
                "glbBytes": glb_bytes,
                "triangleBudget": max_triangles,
                "triangleBudgetStatus": "WITHIN_BUDGET",
                "byteTarget": max_glb_bytes,
                "byteTargetStatus": "WITHIN_BUDGET" if glb_bytes <= max_glb_bytes else "BUDGET_NOT_MET",
                "qualityStatus": "NOT_ASSESSED",
            })
    elif operation == "create_mesh":
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        obj = create_mesh(payload["mesh"])
        result = {"operation": operation, "object": object_record(obj), "objectCount": 1}
    elif operation == "create_memory_fabric":
        glb_path = payload.get("glbOutputPath")
        if not isinstance(glb_path, str) or not glb_path.lower().endswith(".glb") or os.path.exists(glb_path):
            raise ValueError("Memory-fabric GLB path must be new and end in .glb")
        result = create_memory_fabric(payload["fabric"], glb_path)
    elif operation == "generate_mesh_lod":
        glb_path = payload.get("glbOutputPath")
        ratio = payload.get("ratio")
        max_triangles = payload.get("maxTriangles")
        max_glb_bytes = payload.get("maxGlbBytes")
        if not isinstance(glb_path, str) or not glb_path.lower().endswith(".glb") or os.path.exists(glb_path):
            raise ValueError("LOD GLB output must be a new .glb path")
        if isinstance(ratio, bool) or not isinstance(ratio, (int, float)) or not math.isfinite(ratio) or ratio <= 0 or ratio > 1:
            raise ValueError("LOD ratio must be greater than zero and at most one")
        if isinstance(max_triangles, bool) or not isinstance(max_triangles, int) or max_triangles < 1 or isinstance(max_glb_bytes, bool) or not isinstance(max_glb_bytes, int) or max_glb_bytes < 1:
            raise ValueError("LOD triangle and byte budgets must be positive integers")
        before_triangles = scene_triangle_count()
        mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        if not mesh_objects:
            raise ValueError("Cannot generate a mesh LOD from a scene without mesh objects")
        for obj in mesh_objects:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new(name="ParentAtlas_LOD_Decimate", type="DECIMATE")
            modifier.ratio = ratio
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        after_triangles = scene_triangle_count()
        if after_triangles > max_triangles:
            raise ValueError("Generated LOD exceeds the declared triangle ceiling")
        os.makedirs(os.path.dirname(glb_path), exist_ok=True)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=False)
        glb_bytes = os.path.getsize(glb_path)
        result = {
            "operation": operation,
            "sourceTriangleCount": before_triangles,
            "outputTriangleCount": after_triangles,
            "triangleReductionRatio": (1 - after_triangles / before_triangles) if before_triangles else 0,
            "meshObjectCount": len(mesh_objects),
            "decimateRatio": ratio,
            "glbOutputPath": glb_path,
            "glbBytes": glb_bytes,
            "byteBudget": max_glb_bytes,
            "byteBudgetStatus": "WITHIN_BUDGET" if glb_bytes <= max_glb_bytes else "BUDGET_NOT_MET",
            "qualityStatus": "NOT_ASSESSED",
        }
    elif operation == "add_primitive":
        obj = create_object(payload["object"])
        result = {"operation": operation, "object": object_record(obj)}
    elif operation == "transform_object":
        obj = bpy.data.objects.get(payload["objectName"])
        if obj is None:
            raise ValueError("Named object was not found")
        apply_transform(obj, payload)
        result = {"operation": operation, "object": object_record(obj)}
    elif operation == "remove_object":
        obj = bpy.data.objects.get(payload["objectName"])
        if obj is None:
            raise ValueError("Named object was not found")
        bpy.data.objects.remove(obj, do_unlink=True)
        result = {"operation": operation, "removedObject": payload["objectName"]}
    elif operation == "export_gltf":
        if not output_path or not output_path.lower().endswith(".glb"):
            raise ValueError("GLB export requires a .glb output path")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        if os.path.exists(output_path):
            raise FileExistsError("Output file already exists")
        bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB", use_selection=False)
        result = {"operation": operation, "exportedPath": output_path, "format": "glb"}
    elif operation == "import_gltf":
        gltf_path = payload.get("gltfPath")
        if not isinstance(gltf_path, str) or not gltf_path.lower().endswith(".glb") or not os.path.isfile(gltf_path):
            raise ValueError("Import requires an existing binary .glb file")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        # Blender's default armature display creates a hidden Icosphere helper
        # for bone custom shapes. It is not part of the GLB and inflates scene
        # mesh/triangle counts, so keep the bone heuristic but disable helpers.
        bpy.ops.import_scene.gltf(
            filepath=gltf_path,
            bone_heuristic="BLENDER",
            disable_bone_shape=True,
        )
        imported = sorted(bpy.context.scene.objects, key=lambda obj: obj.name)
        if not imported:
            raise ValueError("The GLB import produced an empty Blender scene")
        result = {
            "operation": operation,
            "importedPath": gltf_path,
            "objectCount": len(imported),
            "objects": [object_record(obj) for obj in imported],
            **scene_geometry_stats(),
        }
    elif operation == "import_model":
        source_path = payload.get("sourcePath")
        source_format = payload.get("sourceFormat")
        glb_path = payload.get("glbOutputPath")
        max_triangles = payload.get("maxTriangles")
        max_glb_bytes = payload.get("maxGlbBytes")
        allowed_formats = {"GLB", "GLTF", "FBX", "OBJ"}
        if not isinstance(source_path, str) or not os.path.isfile(source_path):
            raise ValueError("Model import requires an existing source file")
        if source_format not in allowed_formats or not source_path.lower().endswith("." + source_format.lower()):
            raise ValueError("Model import format must match a supported file extension")
        if not isinstance(glb_path, str) or not glb_path.lower().endswith(".glb") or os.path.exists(glb_path):
            raise ValueError("Model import requires a new .glb output path")
        if isinstance(max_triangles, bool) or not isinstance(max_triangles, int) or max_triangles < 1:
            raise ValueError("Model import triangle ceiling must be a positive integer")
        if isinstance(max_glb_bytes, bool) or not isinstance(max_glb_bytes, int) or max_glb_bytes < 1:
            raise ValueError("Model import byte target must be a positive integer")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        if source_format in ("GLB", "GLTF"):
            # Blender's default armature display adds an auxiliary Icosphere
            # bone shape to imported skinned GLBs. Exclude that helper from
            # scene geometry and triangle receipts; it is not source content.
            bpy.ops.import_scene.gltf(
                filepath=source_path,
                bone_heuristic="BLENDER",
                disable_bone_shape=True,
            )
        elif source_format == "FBX":
            bpy.ops.import_scene.fbx(filepath=source_path)
        else:
            obj_import = getattr(bpy.ops.wm, "obj_import", None)
            if obj_import is not None:
                obj_import(filepath=source_path)
            else:
                bpy.ops.import_scene.obj(filepath=source_path)
        imported = sorted(bpy.context.scene.objects, key=lambda obj: obj.name)
        if not imported:
            raise ValueError("The model import produced an empty Blender scene")
        geometry = scene_geometry_stats()
        if geometry["triangleCount"] > max_triangles:
            raise ValueError("Imported model exceeds its declared triangle ceiling")
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=False, export_extras=True, export_animations=True)
        glb_bytes = os.path.getsize(glb_path)
        result = {
            "operation": operation,
            "sourcePath": source_path,
            "sourceFormat": source_format,
            "objectCount": len(imported),
            "objects": [object_record(obj) for obj in imported],
            **geometry,
            "glbOutputPath": glb_path,
            "glbBytes": glb_bytes,
            "triangleBudget": max_triangles,
            "triangleBudgetStatus": "WITHIN_BUDGET",
            "byteTarget": max_glb_bytes,
            "byteTargetStatus": "WITHIN_BUDGET" if glb_bytes <= max_glb_bytes else "BUDGET_NOT_MET",
            "qualityStatus": "NOT_ASSESSED",
            "animationClipCount": len(bpy.data.actions),
            "animationClipNames": sorted(action.name for action in bpy.data.actions),
            "armatureCount": sum(1 for obj in imported if obj.type == "ARMATURE"),
            "boneCount": sum(len(obj.data.bones) for obj in imported if obj.type == "ARMATURE"),
        }
    else:
        raise ValueError("Unsupported Blender MCP operation")

    if output_path and operation != "export_gltf":
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        if os.path.exists(output_path):
            raise FileExistsError("Output file already exists")
        bpy.ops.wm.save_as_mainfile(filepath=output_path, check_existing=False)
        result["savedPath"] = output_path
    if operation == "create_memory_fabric":
        os.makedirs(os.path.dirname(payload["glbOutputPath"]), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=payload["glbOutputPath"], export_format="GLB", use_selection=False)
        result["exportedGlbPath"] = payload["glbOutputPath"]

    with open(request["resultPath"], "w", encoding="utf-8") as handle:
        json.dump(result, handle, separators=(",", ":"), allow_nan=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("BLENDER_MCP_OPERATION_FAILED: " + str(error), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
