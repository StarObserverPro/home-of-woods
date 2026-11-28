"""Background Blender entry point. Reads the approved local J01 GLB without changing it."""
import hashlib
import json
from pathlib import Path
import struct
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from mesh import Fabric, Surface
from clothes import make_tops, make_trousers
from footwear import make_shoes
from accessories import make_bags, make_belts, make_gloves, make_neckwear
from headwear import HATS, fit_hair, head_last, make_hats
from torso import fit_torso


def col(name, parent):
    collection=bpy.data.collections.new(name)
    parent.children.link(collection)
    return collection


def archive_reference(obj, destination):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    destination.objects.link(obj)


def keep_face_and_hands(obj):
    """Blender review copy: the original boots share the face atlas and mesh."""
    original=obj.data
    mesh=original.copy()
    obj.data=mesh
    graph=bmesh.new()
    graph.from_mesh(mesh)
    discard=[v for v in graph.verts if (obj.matrix_world @ v.co).z<.37]
    bmesh.ops.delete(graph,geom=discard,context='VERTS')
    graph.to_mesh(mesh)
    graph.free()
    mesh.update()


def arrange_view(rig):
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type!='VIEW_3D':
                continue
            space=area.spaces.active
            space.region_3d.view_distance=1.65
            space.region_3d.view_location=Vector((0,0,.56))
            space.region_3d.view_rotation=Vector((-1, .40, -.08)).to_track_quat('-Z','Y')
            space.region_3d.view_perspective='ORTHO'
            space.overlay.show_floor=False
            space.overlay.show_axis_x=False
            space.overlay.show_axis_y=False
            space.shading.color_type='MATERIAL'


def keep_cloth_tints(path, fabric):
    """The Blender exporter carries the three neutral weave maps. Retain their material multipliers."""
    original=path.read_bytes()
    size,kind=struct.unpack_from('<I4s',original,12)
    if kind!=b'JSON':
        raise ValueError('Invalid GLB JSON chunk')
    document=json.loads(original[20:20+size])
    for material in document['materials']:
        if material['name'] in fabric.materials:
            source=fabric.materials[material['name']]
            material['pbrMetallicRoughness']['baseColorFactor']=list(source.diffuse_color)
    tail=original[20+size:]
    data=json.dumps(document,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    data+=b' '*(-len(data)%4)
    path.write_bytes(struct.pack('<4sIII4s',b'glTF',2,20+len(data)+len(tail),len(data),b'JSON')+data+tail)


def fit_face_deltas(source):
    """Carry the authored neck-underlay displacement to the unchanged shared actor."""
    blob=source.read_bytes()
    size=struct.unpack_from('<I',blob,12)[0]
    document=json.loads(blob[20:20+size])
    face=next(node for node in document['nodes'] if node.get('extras',{}).get('j01Part')=='face')
    primitive,=document['meshes'][face['mesh']]['primitives']
    position=document['accessors'][primitive['attributes']['POSITION']]
    view=document['bufferViews'][position['bufferView']]
    assert position['componentType']==5126 and position['type']=='VEC3'
    offset=28+size+view.get('byteOffset',0)+position.get('byteOffset',0)
    stride=view.get('byteStride',12)
    deltas=[]
    for i in range(position['count']):
        x,y,z=struct.unpack_from('<3f',blob,offset+i*stride)
        fitted=fit_torso((x,-z,y))
        move=(fitted.x-x,fitted.z-y,-fitted.y-z)
        if any(abs(value)>1e-6 for value in move):
            deltas.append([i,*[round(value,7) for value in (x,y,z,*move)]])
    return json.dumps(deltas,separators=(',',':'))


def apply_torso_fit(obj):
    world=obj.matrix_world
    inverse=world.inverted()
    displacement=0
    for vertex in obj.data.vertices:
        source_point=world @ vertex.co
        point=fit_torso(source_point)
        displacement=max(displacement,(source_point-point).length)
        vertex.co=inverse @ point
    obj.data.update()
    return displacement


def main(source, output):
    output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    bpy.context.view_layer.update()
    scene=bpy.context.scene
    scene.name='林工 J01 · 版型样衣'
    rig=next(obj for obj in scene.objects if obj.type=='ARMATURE')
    rig.data.pose_position='REST'
    parts={obj.name:obj for obj in scene.objects if obj.get('j01Part')}
    shirt=Surface(next(obj for obj in parts.values() if obj.get('j01Part')=='shirt-canvas' and obj.get('fitPart')=='shell'))
    pants=Surface(next(obj for obj in parts.values() if obj.get('j01Part')=='trousers'))
    face=next(obj for obj in parts.values() if obj.get('j01Part')=='face')
    hands=Surface(face)
    head=head_last(hands,rig.matrix_world @ rig.data.bones['head'].head_local)
    hair=next(obj for obj in parts.values() if obj.get('j01Part')=='hair')
    base_torso=next(obj for obj in parts.values() if obj.get('j01Part')=='under-top')
    fabric=Fabric()
    wardrobe=col('样衣 · 衣柜',scene.collection)
    source_parts=col('J01 · 本地参考（脸、手、发型）',scene.collection)
    slot_labels={'top':'上身','legs':'裤装','feet':'鞋靴','head':'帽子','back':'背负','hands':'手套','waist':'腰带','neck':'领巾'}
    style_labels={'yard':'林场工装','town':'镇上便服','trail':'林地巡游'}
    layer_labels={'base':'版型','upgrade':'精制','attachment':'挂件','straps':'背带'}
    anchors={'top':'chest','legs':'outseam','feet':'lace-pair','head':'hatband','back':'side-loop',
             'hands':'cuff-pair','waist':'key-loop','neck':'knot'}
    slots={id:col(label,wardrobe) for id,label in slot_labels.items()}
    groups={(slot,style):col(label,group) for slot,group in slots.items() for style,label in style_labels.items()}
    items=[]
    rows=[]

    def keep_piece(obj,slot,style,layer,fit=None):
        obj['kitSlot']=slot
        obj['kitStyle']=style
        obj['kitLayer']=layer
        obj['kitFit']=fit or ''
        items.append(obj)
        obj.data.calc_loop_triangles()
        rows.append(dict(slot=slot,style=style,layer=layer,fit=fit,vertices=len(obj.data.vertices),triangles=len(obj.data.loop_triangles)))

    def add(slot,style,layer,mesh,fit=None):
        name=f'{slot_labels[slot]} · {style_labels[style]} · {layer_labels[layer]}'
        if fit:
            name+=' · '+style_labels[fit]+'适配'
        if slot in ('top','neck') or slot=='back' and layer=='straps':
            mesh.points=[fit_torso(point) for point in mesh.points]
        obj=mesh.object(name,groups[slot,style],rig)
        if obj is None:
            raise RuntimeError(name+' 是空网格')
        if layer=='attachment':
            obj['kitAnchor']=f'{slot}.{anchors[slot]}'
        keep_piece(obj,slot,style,layer,fit)

    fitting=make_tops(shirt,fabric,add)
    make_trousers(pants,fabric,add)
    make_shoes(fabric,add)
    hat_checks=make_hats(head,fabric,add)
    for style,profile in HATS.items():
        fitted=hair.copy()
        fitted.data=hair.data.copy()
        fitted.name='发型 · '+style_labels[style]+' · 帽下'
        del fitted['j01Part']
        groups['head',style].objects.link(fitted)
        bpy.context.view_layer.update()
        hat_checks[style]['hair']=fit_hair(fitted,head,profile)
        keep_piece(fitted,'head',style,'hair')
    make_bags(fabric,add,fitting)
    make_gloves(hands,rig,fabric,add)
    make_belts(fabric,add,fitting)
    make_neckwear(fabric,add,fitting)
    fitted_torso=base_torso.copy()
    fitted_torso.data=base_torso.data.copy()
    fitted_torso.name='体型 · 上身底衣'
    del fitted_torso['j01Part']
    fitted_torso['kitFaceDeltas']=fit_face_deltas(source)
    groups['top','yard'].objects.link(fitted_torso)
    bpy.context.view_layer.update()
    displacement=apply_torso_fit(fitted_torso)
    keep_piece(fitted_torso,'top','yard','fit-body')

    bpy.ops.object.select_all(action='DESELECT')
    for obj in items+[rig]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(output/'wearables.glb'),export_format='GLB',use_selection=True,
        export_extras=True,export_animations=False,export_all_influences=False,export_yup=True)
    keep_cloth_tints(output/'wearables.glb',fabric)

    keep_face_and_hands(face)
    apply_torso_fit(face)
    for obj in parts.values():
        archive_reference(obj,source_parts)
        obj.hide_set(obj.get('j01Part') not in ('face','wrist'))
        obj.hide_render=obj.hide_get()
    for obj in items:
        obj.hide_set(obj.get('kitStyle')!='yard' or obj.get('kitLayer') not in ('base','straps','hair') or obj.get('kitFit') not in ('yard',''))
        obj.hide_render=obj.hide_get()
    rig.show_in_front=False
    rig.hide_set(True)
    rig.data.pose_position='POSE'
    # Leave the original walking action and local materials available for manual fitting.
    scene.frame_set(scene.frame_end)
    bpy.ops.object.select_all(action='DESELECT')
    arrange_view(rig)
    scene['wardrobeSource']='J01 fit/3 · local approved reference'
    scene['wardrobeSlots']='|'.join(slot_labels)
    note=bpy.data.texts.new('使用说明')
    note.write('本文件基于本机已认可 J01。由物件集合开关切换衣物和适配层。\n'
        '染色材质以 Dye. 起名；精制层和挂件层可单独隐藏。\n'
        '头部集合中的帽冠和帽下发型各自独立，两者同绑 head。\n'
        '动作保留在原骨架。完整的换装、正/侧/背与步态预览见独立试衣间。\n')
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'J01-wardrobe.blend'),compress=True)
    headwear=dict(seatHeightMm=round(head.seat*1000,2),scalpWidthMm=round(head.side*2000,2),
        frontRadiusMm=round(head.front*1000,2),estimatedRearRadiusMm=round(head.rear*1000,2),hats=hat_checks)
    summary=dict(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),bones=len(rig.data.bones),headwear=headwear,
        bodyFit=dict(peakDisplacementMm=round(displacement*1000,2),skinUnderlayVertices=len(json.loads(fitted_torso['kitFaceDeltas']))),objects=rows)
    (output/'build-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Wardrobe exported: {len(rows)} skinned pieces, {summary["bones"]} original joints')


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if len(args)!=2:
        raise SystemExit('Blender --background --python build.py -- <j01.glb> <output-folder>')
    main(*(Path(part).resolve() for part in args))
