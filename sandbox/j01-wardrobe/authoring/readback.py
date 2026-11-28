"""Read the exported GLB in a fresh Blender scene and compare its binding contract."""
from collections import Counter
import json
from pathlib import Path
import sys

import bpy


def read_glb(path):
    blob = path.read_bytes()
    length = int.from_bytes(blob[12:16],'little')
    return json.loads(blob[20:20+length])


def main(base, output):
    base_data=read_glb(base)
    target=output/'wearables.glb'
    pack=read_glb(target)
    expected=json.loads((output/'build-report.json').read_text(encoding='utf-8'))
    signature=lambda document: {document['nodes'][idx]['name'] for idx in document['skins'][0]['joints']}
    assert len(pack['skins'])==1 and len(signature(pack))==50 and signature(pack)==signature(base_data),'Original joint names'
    assert not pack.get('animations'),'Preview uses the J01 action directly'
    assert sum(mat['name'].startswith('Dye.') for mat in pack['materials'])==24,'One dye channel per slot and style'
    assert all('baseColorFactor' in mat['pbrMetallicRoughness'] for mat in pack['materials'] if mat['name'].startswith('Dye.')),'Material tints survived'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(target))
    rigs=[obj for obj in bpy.context.scene.objects if obj.type=='ARMATURE']
    assert len(rigs)==1 and len(rigs[0].data.bones)==50
    exported={}
    influences=Counter()
    maximum_error=0
    for obj in bpy.context.scene.objects:
        if not obj.get('kitSlot'):
            continue
        assert obj.type=='MESH' and any(mod.type=='ARMATURE' and mod.object==rigs[0] for mod in obj.modifiers)
        if obj['kitLayer']=='attachment':
            assert obj.get('kitAnchor'),obj.name
        if obj['kitLayer']=='fit-body':
            assert len(json.loads(obj['kitFaceDeltas']))==expected['bodyFit']['skinUnderlayVertices']>0
        obj.data.calc_loop_triangles()
        key=(obj['kitSlot'],obj['kitStyle'],obj['kitLayer'],obj['kitFit'] or None)
        assert key not in exported,key
        exported[key]=len(obj.data.loop_triangles)
        for vertex in obj.data.vertices:
            w=[group.weight for group in vertex.groups if group.weight>1e-6]
            assert 1<=len(w)<=4,(obj.name,vertex.index,w)
            if obj['kitSlot']=='head':
                active=[obj.vertex_groups[g.group].name for g in vertex.groups if g.weight>1e-6]
                assert active==['head'],(obj.name,vertex.index,active)
            maximum_error=max(maximum_error,abs(sum(w)-1))
            influences[len(w)] += 1
    want={(row['slot'],row['style'],row['layer'],row['fit']):row['triangles'] for row in expected['objects']}
    assert exported==want,'Layer or topology changed on GLB import'
    assert {style for slot,style,layer,_ in exported if slot=='head' and layer=='hair'}=={'yard','town','trail'}
    assert ('top','yard','fit-body',None) in exported
    for style,cap in expected['headwear']['hats'].items():
        assert cap['skullSamples']>=40 and cap['uncastSkullSamples']==0,style
        assert cap['minSkullClearanceMm']>=1.5,(style,cap['minSkullClearanceMm'])
        assert cap['hair']['maxRadialAtBand']<=1.025 and cap['hair']['maxHeightAboveBandMm']<=9.02,style
    assert maximum_error<.0001,maximum_error
    # Check that the source file keeps the same rest rig and a real imported walk action.
    bpy.ops.wm.open_mainfile(filepath=str(output/'J01-wardrobe.blend'))
    source=next(obj for obj in bpy.context.scene.objects if obj.type=='ARMATURE')
    editable=[obj for obj in bpy.context.scene.objects if obj.get('kitSlot')]
    assert len(source.data.bones)==50 and len(editable)==len(want) and bpy.data.actions
    json_report=dict(variants=24,sharedRigBones=50,layerMeshes=len(want),triangles=sum(want.values()),
        verticesByInfluenceCount=dict(influences),weightSumMaxError=maximum_error,editableActions=len(bpy.data.actions),
        headwear=expected['headwear'],bodyFit=expected['bodyFit'])
    (output/'readback.json').write_text(json.dumps(json_report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(json_report,ensure_ascii=False))


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:]
    main(*(Path(arg).resolve() for arg in args))
