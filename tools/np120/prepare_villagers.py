"""Prepare the four local NPC meshes from the supplied NP120 archive."""

from pathlib import Path, PurePosixPath
from struct import pack, unpack_from
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import json
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motion import FPS, PERIOD, STRIDE, boot_contacts, key_pose, pose_at


MODELS = {
    'villager-j01': 'NP120_J01',
    'villager-j01-02': 'NP120_J01_02',
    'villager-j02': 'NP120_J02',
    'villager-j02-02': 'NP120_J02_02',
}
TINTS = {'NP120 Hair': (.66,.37,.30,1), 'NP120 Skin': (.94,.885,.852,1)}
LOCAL_MODELS = Path(__file__).resolve().parents[2] / '.cache' / 'j01-player'


def mesh_islands(obj):
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    links = [[] for point in points]
    positions = {}
    for i, point in enumerate(points):
        other = positions.setdefault(tuple(round(c, 5) for c in point), i)
        if i != other:
            links[i].append(other)
            links[other].append(i)
    for edge in obj.data.edges:
        a,b = edge.vertices
        links[a].append(b)
        links[b].append(a)
    islands = []
    unseen = set(range(len(points)))
    while unseen:
        current = min(unseen)
        unseen.remove(current)
        pending = [current]
        for index in pending:
            for other in links[index]:
                if other in unseen:
                    unseen.remove(other)
                    pending.append(other)
        islands.append(pending)
    return points, sorted(islands, key=len, reverse=True)


def recolor_j01(obj):
    points, islands = mesh_islands(obj)
    if [len(ids) for ids in islands[:6]] != [698,530,466,386,353,353]:
        raise ValueError('J01 拓扑与已检视原模不同，需重新选取皮肤与头发范围')
    hair = {7,10,11,12,13,14,17,24}
    for index, ids in enumerate(islands, 1):
        low,high = (fn(points[i].z for i in ids) for fn in (min,max))
        if index != 3 and low > .91 and high > 1.033:
            hair.add(index)
    for material, keys in zip(TINTS, (hair, {3,5,6,15,16}), strict=True):
        variant = obj.data.materials[0].copy()
        variant.name = material
        obj.data.materials.append(variant)
        vertices = {i for key in keys for i in islands[key-1]}
        for face in obj.data.polygons:
            if all(i in vertices for i in face.vertices):
                face.material_index = len(obj.data.materials)-1


def tint_glb(path):
    # All three material slots share the original atlas. glTF stores each tint
    # as a linear base-color factor instead of duplicating the texture.
    data = path.read_bytes()
    size, kind = unpack_from('<I4s', data, 12)
    if data[:4] != b'glTF' or kind != b'JSON':
        raise ValueError('Expected a GLB with a JSON chunk')
    header = json.loads(data[20:20+size])
    binary = data[20+size:]
    for mat in header['materials']:
        factor = next((color for name,color in TINTS.items() if mat['name'].startswith(name)),None)
        if factor:
            mat['pbrMetallicRoughness']['baseColorFactor'] = factor
    chunk = json.dumps(header, ensure_ascii=False, separators=(',',':')).encode('utf-8')
    chunk += b' ' * (-len(chunk) % 4)
    path.write_bytes(pack('<4sIII4s',b'glTF',2,20+len(chunk)+len(binary),len(chunk),b'JSON')+chunk+binary)


def key_bone(bone, at):
    bone.keyframe_insert(data_path='location',frame=at,group=bone.name)
    bone.keyframe_insert(data_path='rotation_quaternion',frame=at,group=bone.name)


def export_model(scene, source, path, recolor):
    before = set(scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(source), use_image_search=False)
    imported = set(scene.objects)-before
    try:
        rig, = (obj for obj in imported if obj.type == 'ARMATURE')
        body, = (obj for obj in imported if obj.type == 'MESH')
        if len(rig.data.bones) != 50:
            raise ValueError('Expected the supplied 50-bone NP120 rig')
        scene.frame_set(1)
        bpy.context.view_layer.update()
        rig.animation_data_clear()
        rest = {b.name:rig.matrix_world@b.matrix_local for b in rig.data.bones}
        points,soles = boot_contacts(body)
        if recolor:
            recolor_j01(body)
        for bone in rig.pose.bones:
            bone.rotation_mode = 'QUATERNION'
        for step in range(PERIOD+1):
            key_pose(rig,pose_at(step/PERIOD,rig,rest,points,soles),step+1,key_bone)
        idle = PERIOD+3
        neutral = pose_at(0,rig,rest,points,soles,standing=True)
        key_pose(rig,neutral,idle,key_bone)
        key_pose(rig,neutral,idle+1,key_bone)
        scene.frame_start,scene.frame_end = 1,idle+1
        scene.render.fps = FPS
        scene['np120WalkDuration'] = PERIOD/FPS
        scene['np120IdleTime'] = (idle-1)/FPS
        scene['np120Stride'] = STRIDE
        scene.frame_set(1)
        for obj in scene.objects:
            obj.select_set(obj in imported)
        destination = path.with_suffix('.tmp.glb')
        bpy.ops.export_scene.gltf(
            filepath=str(destination),export_format='GLB',use_selection=True,use_active_scene=True,
            export_extras=True,export_yup=True,export_animation_mode='SCENE',
            export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,
        )
        if recolor:
            tint_glb(destination)
        destination.replace(path)
        for material in body.data.materials[:1]:
            shader = next(node for node in material.node_tree.nodes if node.type=='BSDF_PRINCIPLED')
            texture = shader.inputs['Base Color'].links[0].from_node.image
            print(source.stem, tuple(texture.size), Path(texture.filepath).name, path.stat().st_size)
    finally:
        for obj in imported:
            bpy.data.objects.remove(obj,do_unlink=True)


def prepare(archive, output=LOCAL_MODELS):
    output = Path(output)
    output.mkdir(parents=True,exist_ok=True)
    prior = bpy.context.window.scene
    scene = bpy.data.scenes.new('NP120 local villagers')
    try:
        bpy.context.window.scene = scene
        with TemporaryDirectory(prefix='how-np120-') as folder, ZipFile(archive) as package:
            source = Path(folder)
            for entry in package.infolist():
                name = PurePosixPath(entry.filename.replace('\\','/')).name
                if name.startswith('NP120_') and Path(name).suffix.lower() in ('.png','.fbx'):
                    (source/name).write_bytes(package.read(entry))
            for role, stem in MODELS.items():
                export_model(scene,source/(stem+'.FBX'),output/(role+'.glb'),role=='villager-j01')
    finally:
        bpy.context.window.scene = prior
        bpy.data.scenes.remove(scene)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if len(args) != 1:
        raise SystemExit('blender --background --python tools/np120/prepare_villagers.py -- <NP120.zip>')
    prepare(args[0])
