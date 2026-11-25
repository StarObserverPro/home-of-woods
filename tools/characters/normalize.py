"""Conservative offline GLB reduction; never paints textures or declares art approved.

blender --background --factory-startup --python-exit-code 1 --python tools/characters/normalize.py -- \
  --input model.glb --output .cache/character-intake/review.glb --tier visitor \
  --mesh Body --apply --report .cache/character-intake/reduction.json

Without --apply, report only. Meshes must be explicitly selected when reducing.
Faces/hands, joint blends, UV boundaries and artist HOW_Preserve vertices are
excluded. If protected vertex/UV/weight records change, that mesh is restored.
Morph meshes are left intact. A difficult target is reported, never forced.
"""
import argparse
from collections import Counter
import fnmatch
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

import bpy
import bmesh

ROOT = Path(__file__).resolve().parents[2]
FACE_HAND = re.compile(r"head|neck|eye|face|jaw|hand|finger|thumb|index|middle|ring|pinky", re.I)


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def protected_vertices(obj):
    protected = set()
    names = {group.index: group.name for group in obj.vertex_groups}
    for vertex in obj.data.vertices:
        weights = sorted((group.weight for group in vertex.groups if group.weight > 0), reverse=True)
        if any(group.weight > .05 and (FACE_HAND.search(names[group.group]) or names[group.group] == 'HOW_Preserve')
               for group in vertex.groups) or len(weights) > 1 and weights[1] >= .15:
            protected.add(vertex.index)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    # GLB UV islands often have split vertices. Protect their boundaries as well.
    for edge in bm.edges:
        if edge.is_boundary or edge.seam:
            protected.update(vertex.index for vertex in edge.verts)
    # Preserve a ring next to the protected region, rather than collapsing its edge.
    boundary = frozenset(protected)
    protected.update(other.index for vertex in bm.verts if vertex.index in boundary
                     for edge in vertex.link_edges for other in edge.verts)
    bm.free()
    return protected


def fingerprints(obj, indices=None):
    uv = {vertex.index: set() for vertex in obj.data.vertices}
    for layer_index, layer in enumerate(obj.data.uv_layers):
        for loop in obj.data.loops:
            uv[loop.vertex_index].add((layer_index, *(round(x, 6) for x in layer.data[loop.index].uv)))
    return Counter((tuple(round(x, 6) for x in vertex.co),
                    tuple(sorted((obj.vertex_groups[g.group].name, round(g.weight, 6)) for g in vertex.groups if g.weight > 0)),
                    tuple(sorted(uv[vertex.index])))
                   for vertex in obj.data.vertices if indices is None or vertex.index in indices)


def reduce_mesh(obj, ratio):
    before = triangles(obj)
    if obj.data.shape_keys:
        return {'mesh': obj.name, 'before': before, 'after': before, 'result': 'kept-morph-topology'}
    # glTF instances can share a mesh datablock. --mesh A must not rewrite B.
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    protected = protected_vertices(obj)
    original = obj.data.copy()
    signature = fingerprints(obj, protected)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bm = bmesh.from_edit_mesh(obj.data)
        for face in bm.faces:
            face.select_set(False)
        for edge in bm.edges:
            edge.select_set(False)
        for vertex in bm.verts:
            vertex.select_set(vertex.index not in protected)
        bm.select_flush_mode()
        bmesh.update_edit_mesh(obj.data)
        bpy.ops.mesh.decimate(ratio=ratio, use_vertex_group=False, use_symmetry=False)
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
    after_signature = fingerprints(obj)
    if any(after_signature[key] < count for key, count in signature.items()):
        changed = obj.data
        obj.data = original
        bpy.data.meshes.remove(changed)
        result = 'restored-protected-data'
    else:
        bpy.data.meshes.remove(original)
        result = 'reduced' if triangles(obj) < before else 'kept-no-safe-collapse'
    return {'mesh': obj.name, 'before': before, 'after': triangles(obj),
            'protectedVertices': len(protected), 'result': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--tier', choices=['hero', 'trader', 'neighbor', 'visitor'], required=True)
    parser.add_argument('--mesh', action='append', default=[], help='Explicit Blender mesh name or glob; repeatable')
    parser.add_argument('--target-triangles', type=int)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    source, output = Path(args.input).resolve(), Path(args.output).resolve()
    if source.suffix.lower() != '.glb' or output.suffix.lower() != '.glb':
        raise ValueError('Input and output must be .glb files')
    if source == output or output.exists():
        raise ValueError('Output must be a new file; source and existing revisions are never overwritten')
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node is required to read the shared TypeScript quality contract')
    command = "const m=await import(process.argv[1]);console.log(JSON.stringify({version:m.CHARACTER_QUALITY_VERSION,tiers:m.CHARACTER_QUALITY_TIERS}))"
    contract = json.loads(subprocess.run([node, '--experimental-strip-types', '--input-type=module', '-e', command,
                                         (ROOT / 'src/content/character-quality.ts').as_uri()],
                                        check=True, capture_output=True, text=True).stdout)
    budget = contract['tiers'][args.tier]['triangles']
    target = args.target_triangles if args.target_triangles is not None else budget['target']
    if not 1 <= target <= budget['maximum']:
        raise ValueError('Target must be positive and at or below the selected contract cap')
    if args.report and Path(args.report).resolve() in [source, output]:
        raise ValueError('Report must not replace the source or output model')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    # glTF import creates an Icosphere used only as the rig's custom bone shape.
    # It is not source geometry and must never enter the budget or exported GLB.
    bone_shapes = {bone.custom_shape for obj in bpy.context.scene.objects if obj.type == 'ARMATURE'
                   for bone in obj.pose.bones if bone.custom_shape}
    imported = [obj for obj in bpy.context.scene.objects if obj not in bone_shapes]
    meshes = [obj for obj in imported if obj.type == 'MESH']
    before = sum(triangles(obj) for obj in meshes)
    if before == 0:
        raise ValueError('Input contains no mesh triangles')
    selected = [obj for obj in meshes if any(fnmatch.fnmatchcase(obj.name, pattern) for pattern in args.mesh)]
    if args.mesh and not selected:
        raise ValueError('No mesh matched --mesh; inspect the dry-run mesh names first')
    if before > target and args.apply and not selected:
        raise ValueError('Reduction requires explicit --mesh selections after inspecting the input')
    fixed = sum(triangles(obj) for obj in meshes if obj not in selected)
    candidate = before - fixed
    ratio = max(.05, min(1., (target - fixed) / candidate)) if candidate else 1.
    report = {'contractVersion': contract['version'], 'tier': args.tier,
              'input': str(source), 'output': str(output), 'applied': args.apply,
              'targetTriangles': target, 'hardMaximum': budget['maximum'], 'beforeTriangles': before,
              'meshes': [{'mesh': obj.name, 'before': triangles(obj), 'selected': obj in selected} for obj in meshes],
              'artReview': 'pending', 'texturePainting': 'not-performed', 'rigRetargeting': 'not-performed'}
    if args.apply:
        report['reductions'] = [reduce_mesh(obj, ratio) for obj in selected] if before > target else []
        output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in imported:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True,
                                  export_extras=True, export_animations=True, export_apply=False, use_selection=True)
    after = sum(triangles(obj) for obj in meshes)
    report['afterTriangles'] = after
    report['result'] = ('dry-run' if not args.apply else 'within-target' if after <= target
                        else 'within-cap-needs-review' if after <= budget['maximum'] else 'needs-manual-retopology')
    report['next'] = 'Audit the exported GLB; compare silhouettes, UV seams and walking/gesture deformation against the source. Export is not admission.'
    if args.report:
        destination = Path(args.report)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
