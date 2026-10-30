import bpy, json, colorsys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'sources/kaykit/adventurers'
bpy.ops.wm.read_factory_settings(use_empty=True)
reports=[]
def head_islands(mesh):
    parent={}
    def key(v):return tuple(round(c,5) for c in v.co)
    def find(v):
        parent.setdefault(v,v)
        if parent[v]!=v:parent[v]=find(parent[v])
        return parent[v]
    for p in mesh.polygons:
        ks=[key(mesh.vertices[i]) for i in p.vertices]
        for k in ks[1:]:parent[find(k)]=find(ks[0])
    groups={}
    for p in mesh.polygons:groups.setdefault(find(key(mesh.vertices[p.vertices[0]])),[]).append(p)
    return list(groups.values())
for variant,cloth,scarf,pants in [
    ('player',(0.36,0.46,0.31),(0.70,0.66,0.49),(0.58,0.51,0.37)),
    ('npc',(0.57,0.29,0.21),(0.83,0.78,0.62),(0.44,0.47,0.38)),
]:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SRC/'Rogue.glb'))
    imported=list(set(bpy.data.objects)-before)
    rig=next(o for o in imported if o.type=='ARMATURE')
    rig.name='Forest_'+variant.title()+'_Rig'
    meshes=[o for o in imported if o.type=='MESH' and o.name.startswith('Rogue_') and 'Cape' not in o.name]
    for o in imported:
        if o not in meshes and o!=rig:
            bpy.data.objects.remove(o,do_unlink=True)
    original=next(n.image for n in meshes[0].data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
    head=next(o for o in meshes if o.name.startswith('Rogue_Head'))
    glints=[];eye_edits=0;brow_edits=0
    for polys in head_islands(head.data):
        vs={i for p in polys for i in p.vertices}
        coords=[head.data.vertices[i].co for i in vs]
        center=sum(coords,coords[0].copy()*0)/len(coords)
        uvs=[head.data.uv_layers.active.data[i].uv for p in polys for i in p.loop_indices]
        mean_u=sum(u.x for u in uvs)/len(uvs)
        if len(polys)==108 and .18<mean_u<.23:
            slope=sum((v.x-center.x)*(v.z-center.z) for v in coords)/sum((v.x-center.x)**2 for v in coords)
            for v in coords:
                v.z=center.z+.025+(v.z-center.z)*.66-slope*(v.x-center.x)*.65
                v.x=center.x+(v.x-center.x)*.94
            brow_edits+=1
        if len(polys)==69 and .27<mean_u<.33:
            front=min(v.y for v in coords)
            for v in coords:
                v.x=center.x+(v.x-center.x)*1.06
                v.z=center.z+(v.z-center.z)*1.08
            glints.append((center.x-.014,front-.006,center.z+.026));eye_edits+=1
    # Keep skin and leather unchanged. Reserve separate atlas strips for hair and eye highlights.
    width,height=original.size
    pixels=list(original.pixels[:])
    atlas=bpy.data.images.new('Forest_'+variant+'_atlas',width=width,height=height+256,alpha=True)
    out=[0.0]*(width*(height+256)*4)
    changed=0
    for y in range(height):
        for x in range(width):
            i=(y*width+x)*4
            r,g,b,a=pixels[i:i+4]
            if g>r*1.12 and g>b*1.07:
                target=scarf if (x>=width*.25 and x<width*.5 and y>=height*.5) else cloth
                luminance=max(r,g,b)
                factor=0.70+0.45*luminance
                r,g,b=[min(1,c*factor) for c in target]
                changed+=1
            out[i:i+4]=[r,g,b,a]
    for y in range(height,height+256):
        for x in range(width):
            i=(y*width+x)*4
            if x<width*.25:color=pants
            elif x<width*.5:
                shade=.72+.35*(y-height)/256
                color=tuple(c*shade for c in (.085,.100,.108))
            elif x<width*.75:color=(.06,.075,.08)
            else:color=(.94,.93,.85)
            out[i:i+4]=[*color,1]
    atlas.pixels[:]=out
    atlas.filepath_raw=str(ROOT/'art/characters'/('forest-'+variant+'-atlas.png'))
    atlas.file_format='PNG'
    atlas.save()
    mat=bpy.data.materials.new('Forest_'+variant+'_matte')
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value=.74
    bsdf.inputs['Metallic'].default_value=0
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=atlas
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    for obj in meshes:
        uv=obj.data.uv_layers.active
        for p in obj.data.polygons:
            center=sum(obj.data.vertices[v].co.z for v in p.vertices)/len(p.vertices)
            trousers='Leg' in obj.name and center>.27
            for li in p.loop_indices:
                old=uv.data[li].uv.copy()
                hair=obj==head and .16<old.x<.24 and old.y>.80
                if trousers: uv.data[li].uv=(.125,.9)
                elif hair: uv.data[li].uv=(.375,.84+max(0,min(1,(old.y-.80)/.15))*.13)
                else: uv.data[li].uv.y*=height/(height+256)
        obj.data.materials.clear();obj.data.materials.append(mat)
    for i,position in enumerate(glints):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=1,location=(0,0,0))
        glint=bpy.context.object;glint.name='Eye_soft_glint_'+str(i)
        for v in glint.data.vertices:
            v.co.x=position[0]+v.co.x*.009
            v.co.y=position[1]+v.co.y*.004
            v.co.z=position[2]+v.co.z*.011
        glint.parent=rig
        group=glint.vertex_groups.new(name='head');group.add(list(range(len(glint.data.vertices))),1,'REPLACE')
        mod=glint.modifiers.new('Head skeleton','ARMATURE');mod.object=rig
        glint.data.materials.append(mat)
        for u in glint.data.uv_layers.active.data:u.uv=(.875,.9)
        meshes.append(glint)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.join()
    body=bpy.context.object;body.name='Forest_'+variant.title()
    rig.scale=(.78,.78,.78)
    rig['source']='Kay Lousberg / KayKit Adventurers 2.0 / Rogue / CC0'
    rig['modifications']='Cape removed; forest palette; black hair; softened eyebrows; eyes 6% wider/8% taller with small highlights; matte atlas; 0.78 scale'
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/characters'/('player.glb' if variant=='player' else 'visitor.glb')),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_extras=True)
    reports.append({'variant':variant,'bones':len(rig.data.bones),'vertices':len(body.data.vertices),'triangles':sum(len(p.vertices)-2 for p in body.data.polygons),'materials':len(body.data.materials),'recoloured_pixels':changed,'scale':.78,'hair':'black','eyes_reshaped':eye_edits,'brows_softened':brow_edits,'eye_glints':len(glints)})
    rig.location.x=-1.5 if variant=='player' else 1.5
    # Body stays parented to rig; arrange editable assets side by side in source only.
for image in bpy.data.images:
    if image.has_data: image.pack()
    image.filepath='//'+Path(image.name).name
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/characters/actors.blend'))
(ROOT/'evidence/characters/blender-export.json').write_text(json.dumps({'blender':bpy.app.version_string,'assets':reports},indent=2),encoding='utf8')
print(json.dumps(reports))
