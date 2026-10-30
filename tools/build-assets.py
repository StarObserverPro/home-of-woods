"""Home of Woods M0. Run in Blender 5.2; five original project models.
R3 generated concept is a visual guide; no third-party mesh is imported.
Creates a separate scene and exports only its objects. Existing scenes stay intact.
"""
import bpy, math, json, pathlib
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'assets' / 'm0'
OUT.mkdir(parents=True, exist_ok=True)
SCENE = bpy.data.scenes.new('Home_of_Woods_M0_Assets')
bpy.context.window.scene = SCENE
materials = {}
exported_count = 0

def material(name, hex_color):
    if name in materials: return materials[name]
    color = tuple(int(hex_color[i:i+2], 16)/255 for i in (0,2,4))
    m = bpy.data.materials.new('HOW_' + name)
    m.diffuse_color = (*color,1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    # Convert display colors to linear so glTF matches the web palette.
    linear = tuple(c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4 for c in color)
    bsdf.inputs['Base Color'].default_value = (*linear,1)
    bsdf.inputs['Roughness'].default_value = .62
    bsdf.inputs['Metallic'].default_value = 0
    materials[name] = m
    return m

wood=material('wood','95602f'); wood_light=material('wood_light','c08a49')
cream=material('canvas','f0d6a1'); roof=material('roof','a97036')
dark=material('dark','354b42'); stone=material('stone','9ca69a')
pine=material('pine','426c25'); leaf=material('leaf','628a34')
skin=material('skin','e4b18a'); hair=material('hair','634b3b')
shirt=material('shirt','e6d5a5'); green=material('overalls','467c67')
orange=material('scarf','cf7b47'); boots=material('boots','6e5341')

def empty(name):
    o=bpy.data.objects.new(name,None); SCENE.collection.objects.link(o); return o

def box(name, pos, size, mat, parent=None, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Molded rounded edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=mod.name)
    o.parent=parent; return o

def sphere(name,pos,scale,mat,parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=pos)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(mat)
    for f in o.data.polygons: f.use_smooth=True
    o.parent=parent; return o

def beam(name,a,b,width,mat,parent):
    v=Vector(b)-Vector(a); o=box(name,(Vector(a)+Vector(b))/2,(width,width,v.length),mat,parent,bevel=width*.15)
    o.rotation_euler=v.to_track_quat('Z','Y').to_euler(); return o

def export(root, filename):
    global exported_count
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root]+list(root.children_recursive): o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True)
    # Move the asset only after export, so every file has origin at its own ground contact.
    root.location.x = exported_count*18
    exported_count += 1

def cabin():
    root=empty('cabin')
    box('stone_foundation',(0,0,.28),(9.2,6.8,.56),stone,root,.17)
    box('wood_floor',(0,0,.65),(8.8,6.4,.25),wood_light,root)
    # Back and sides are separate beveled courses; front leaves a real recessed doorway.
    for j in range(7):
        z=1+j*.45
        box('back_log',(0,3,z),(8.6,.5,.43),wood_light if j%3==0 else wood,root)
        for x in [-4.05,4.05]: box('side_log',(x,0,z),(.52,6.2,.43),wood if j%2 else wood_light,root)
        box('front_left',(-2.75,-3,z),(2.5,.48,.43),wood,root)
        box('front_right',(2.4,-3,z),(3.35,.48,.43),wood_light if j==4 else wood,root)
    box('door_shadow',(-.6,-2.93,1.9),(1.5,.15,2.6),dark,root)
    for x in [-1.45,.25]: box('door_frame',(x,-3.35,1.9),(.22,.27,2.8),wood_light,root)
    box('door_lintel',(-.6,-3.35,3.25),(1.9,.3,.25),wood_light,root)
    box('window_recess',(2.45,-3.28,2.55),(1.6,.16,1.32),dark,root)
    for x in [1.65,3.25]: box('window_frame',(x,-3.4,2.55),(.18,.22,1.55),wood_light,root)
    for z in [1.86,3.25]: box('window_frame',(2.45,-3.4,z),(1.8,.22,.18),wood_light,root)
    for j in range(2):
        o=box('boarded_window',(2.45,-3.55,2.3+j*.5),(1.9,.17,.18),wood_light,root); o.rotation_euler.y=.12*(-1 if j else 1)
    for y in [-3.25,-1.1,1.1,3.25]:
        beam('roof_rafter',(-4.8,y,3.9),(0,y,6.1),.34,wood_light,root)
        beam('roof_rafter',(0,y,6.1),(4.8,y,3.9),.34,wood_light,root)
    for side in [-1,1]:
        for j in range(10):
            # Missing planks expose the structural rafters clearly.
            if (side==1 and j in [2,3,4,5,7]) or (side==-1 and j in [3,4,5,6]): continue
            y=-3.6+j*.79
            o=box('roof_board',(side*2.35,y,4.98),(5.35,.76,.24),roof if j%3 else wood_light,root,.08)
            o.rotation_euler.y=side*math.atan2(2.2,4.8)
    for j in range(3): box('porch_step',(-.6,-3.8-j*.5,.55-j*.15),(2.2,.65,.2),wood_light,root)
    export(root,'cabin.glb')

def tent():
    root=empty('tent')
    box('groundsheet',(0,0,.14),(5.4,4.7,.28),wood_light,root,.14)
    for side in [-1,1]:
        beam('tent_pole',(side*2.7,-2.5,.15),(0,-2.5,3.9),.15,wood_light,root)
        beam('tent_pole',(side*2.7,2.5,.15),(0,2.5,3.9),.15,wood_light,root)
        o=box('canvas_panel',(side*1.36,0,2.0),(4.75,4.8,.14),cream,root,.08)
        o.rotation_euler.y=side*math.atan2(3.75,2.7)
    beam('ridge',(0,-2.8,3.9),(0,2.8,3.9),.16,wood_light,root)
    mesh=bpy.data.meshes.new('tent_back'); mesh.from_pydata([(-2.6,2.33,.2),(2.6,2.33,.2),(0,2.33,3.82)],[],[(0,1,2)]); mesh.update()
    o=bpy.data.objects.new('canvas_back',mesh); SCENE.collection.objects.link(o); o.parent=root; mesh.materials.append(cream)
    for side in [-1,1]:
        beam('guy_rope',(0,side*2.75,3.6),(0,side*4.0,.12),.04,cream,root)
        box('peg',(0,side*4.0,.12),(.12,.18,.5),wood,root)
    box('rolled_blanket',(-1.5,-2.5,.5),(1.2,.65,.65),green,root,.22)
    export(root,'tent.glb')

def ranger():
    root=empty('ranger')
    box('body',(0,0,1.13),(.76,.5,.88),shirt,root,.18)
    box('overalls',(0,-.04,.92),(.78,.54,.49),green,root,.13)
    box('bib',(0,-.29,1.27),(.46,.06,.42),green,root,.06)
    sphere('head',(0,0,1.96),(.52,.47,.53),skin,root)
    sphere('hair_cap',(0,.06,2.2),(.53,.46,.37),hair,root)
    for x in [-.18,.18]: sphere('eye',(x,-.445,1.99),(.045,.045,.065),dark,root)
    sphere('nose',(0,-.475,1.88),(.07,.07,.06),skin,root)
    for x in [-.51,.51]: sphere('ear',(x,0,1.96),(.1,.11,.15),skin,root)
    for side in [-1,1]:
        leg=empty('leg_L' if side<0 else 'leg_R'); leg.parent=root; leg.location=(side*.22,0,.78)
        box('trouser',(0,0,-.22),(.3,.36,.55),green,leg,.11)
        box('boot',(0,-.10,-.57),(.35,.55,.28),boots,leg,.10)
        arm=empty('arm_L' if side<0 else 'arm_R'); arm.parent=root; arm.location=(side*.51,0,1.48)
        box('sleeve',(0,0,-.18),(.28,.32,.42),shirt,arm,.12)
        sphere('hand',(0,-.02,-.47),(.15,.16,.18),skin,arm)
    box('scarf',(0,-.02,1.57),(.65,.62,.18),orange,root,.07)
    o=box('scarf_tail',(.31,.37,1.24),(.2,.12,.65),orange,root,.06); o.rotation_euler.y=.22
    box('backpack',(0,.4,1.14),(.65,.35,.67),wood_light,root,.15)
    export(root,'ranger.glb')

def rounded_tree(kind):
    # Original remodel after the accepted R3 visual. Kenney candidates remain archived;
    # their flat crowns did not match the requested clustered molded-plastic silhouette.
    root=empty(kind)
    if kind=='pine':
        bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=.42, radius2=.29, depth=2.4, location=(0,0,1.2))
        trunk=bpy.context.object; trunk.name='chunky_pine_trunk'; trunk.parent=root; trunk.data.materials.append(wood)
        for level,(z,radius,height) in enumerate([(2.9,2.0,2.5),(4.3,1.62,2.35),(5.65,1.2,2.35)]):
            bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=radius, radius2=.04, depth=height, location=(0,0,z))
            o=bpy.context.object; o.name='rounded_pine_tier_'+str(level); o.parent=root; o.data.materials.append(pine)
            mod=o.modifiers.new('Rounded tier rims','BEVEL'); mod.width=.16; mod.segments=3
            bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=o.modifiers.new('Broad toy normals','WEIGHTED_NORMAL'); mod.keep_sharp=True; bpy.ops.object.modifier_apply(modifier=mod.name)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=9,radius1=.65,radius2=.36,depth=3.1,location=(0,0,1.55))
        trunk=bpy.context.object; trunk.name='broadleaf_flared_trunk'; trunk.parent=root; trunk.data.materials.append(wood)
        for a in [-.7,.55,2.5]:
            beam('thick_branch',(0,0,1.6),(math.cos(a)*1.2,math.sin(a)*1.0,3.5),.42,wood,root)
        clusters=[(-1.1,-.3,3.9,1.55),(1.1,-.15,4.0,1.5),(-.9,1.05,4.5,1.5),(.9,.95,4.8,1.55),(0,-.5,5.0,1.85),(0,.5,5.5,1.6)]
        for i,(x,y,z,radius) in enumerate(clusters):
            o=sphere('rounded_crown_'+str(i),(x,y,z),(radius,radius*.9,radius*.95),leaf,root)
            # Explicit smooth lobe normals, low-poly silhouette, no leaf texture.
    export(root,kind+'.glb')

if __name__=='__main__':
    cabin(); tent(); ranger()
    rounded_tree('pine'); rounded_tree('broadleaf')
    (ROOT/'art').mkdir(parents=True, exist_ok=True)
    # Write only this sandbox scene. Do not save unrelated open user scenes or change their filename.
    bpy.data.libraries.write(str(ROOT/'art'/'woodland-m0.blend'), {SCENE})
    report={'blender':bpy.app.version_string,'files':[p.name for p in OUT.glob('*.glb')],'objects':len(SCENE.objects)}
    (ROOT/'art'/'export-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
