import bpy
from pathlib import Path
from math import radians
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.72;p.inputs['Metallic'].default_value=0
 return m
wood=material('warm ash handle',(.34,.19,.09));steel=material('matte blue grey steel',(.28,.37,.39))
bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=.036,depth=1.08,location=(0,0,.2))
shaft=bpy.context.object;shaft.name='woodcutting_axe_handle';shaft.data.materials.append(wood)
outline=[(-.10,.61),(.12,.62),(.43,.52),(.45,.88),(.12,.78),(-.10,.77)]
verts=[(x,y,z) for y in [-.055,.055] for x,z in outline]
faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]
for i in range(6):j=(i+1)%6;faces.append((i,j,j+6,i+6))
mesh=bpy.data.meshes.new('single bit axe head');mesh.from_pydata(verts,[],faces);mesh.update()
head=bpy.data.objects.new('woodcutting_axe_head',mesh);bpy.context.collection.objects.link(head);head.data.materials.append(steel)
bevel=head.modifiers.new('soft edges','BEVEL');bevel.width=.018;bevel.segments=2
bpy.context.view_layer.objects.active=head;head.select_set(True);bpy.ops.object.modifier_apply(modifier=bevel.name)
bpy.ops.object.select_all(action='SELECT')
root=bpy.data.objects.new('woodcutting_axe',None);bpy.context.collection.objects.link(root)
shaft.parent=root;head.parent=root
root['source']='Original project tool mesh, 2026-10-30; no external mesh input'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/characters/axe.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/characters/axe.glb'),export_format='GLB',export_animations=False)
