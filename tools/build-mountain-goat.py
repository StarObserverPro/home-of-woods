#!/usr/bin/env python3
"""HOW's original North American mountain-goat mesh + 21-joint animation rig.

Standard library only; offline, deterministic, faceted not wireframe. Rebuilds
public/assets/wildlife/mountain-goat.glb from this source, with 4 real animations.
"""
from __future__ import annotations
import json, math, struct, hashlib, random, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/wildlife/mountain-goat.glb'
rng = random.Random(1018)

# One shared geometry, one skin and one nonmetallic vertex-color material.
verts, normals, colors, joints, weights, indices = [], [], [], [], [], []
REGIONS = {}
color_cream=(0.94,0.94,0.87)
color_ivory=(0.90,0.91,0.87)
color_warm=(0.84,0.85,0.79)
color_shade=(0.78,0.80,0.77)
color_dark=(0.105,0.115,0.115)
color_hoof=(0.18,0.19,0.19)
color_inner=(0.57,0.55,0.51)

# World-space bind-pose bone positions, parented to the torso for correct gait.
bones=[]
name_to_joint={}
def bone(name, parent, xyz):
    idx=len(bones)
    name_to_joint[name]=idx
    bones.append(dict(name=name,parent=parent,translation=tuple(xyz)))
    return idx
bone('goat_root',None,(0,0,0))
bone('goat_torso','goat_root',(0,1.46,0.0))
bone('goat_neck','goat_torso',(0,0.33,0.62))
bone('goat_head','goat_neck',(0,0.29,0.42))
bone('goat_tail','goat_torso',(0,0.12,-0.94))
for side in ('left','right'):
    x=-0.39 if side=='left' else 0.39
    for leg in ('front','hind'):
        front=leg=='front'
        z=0.60 if front else -0.64
        bone(f'{side}_{leg}_upper','goat_torso',(x,-0.16 if front else -0.17,z))
        bone(f'{side}_{leg}_lower',f'{side}_{leg}_upper',(0,-0.62 if front else -0.55,0.06 if front else 0.10))
        bone(f'{side}_{leg}_pastern',f'{side}_{leg}_lower',(0,-0.51 if front else -0.48,0.03 if front else -0.16))
        bone(f'{side}_{leg}_hoof',f'{side}_{leg}_pastern',(0,-0.20 if front else -0.28,0.045 if front else 0.07))
assert len(bones)==21

def absp(b):
    if isinstance(b,str): b=name_to_joint[b]
    node=bones[b]
    if node['parent'] is None:return node['translation']
    p=absp(node['parent'])
    return tuple(x+y for x,y in zip(p,node['translation']))

# Each faceted triangle uses independent vertices / normal; this is a deliberate
# geometric triangular silhouette, NOT a coplanar quad trivially triangulated.
def tri(a,b,c,joint,color,region,outward=None):
    a,b,c=tuple(a),tuple(b),tuple(c)
    u=tuple(b[i]-a[i] for i in range(3));v=tuple(c[i]-a[i] for i in range(3))
    n=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
    length=math.sqrt(sum(q*q for q in n))
    if length<1e-9:return
    if outward is not None and sum(n[i]*outward[i] for i in range(3))<0:
        b,c=c,b;n=tuple(-q for q in n)
    n=tuple(q/length for q in n)
    base=len(verts)
    shade=0.975+0.035*rng.random() # close white hues, main facet shading is physical light
    rgb=tuple(min(1.,c*shade) for c in color)
    for p in (a,b,c):
        verts.append(p);normals.append(n);colors.append((*rgb,1.));joints.append((joint,0,0,0));weights.append((1.,0.,0.,0.))
    indices.extend((base,base+1,base+2))
    REGIONS[region]=REGIONS.get(region,0)+1

# ring parameters z, centerY, radiusX, radiusY; twisted rings generate true
# triangular planes.  Irregular axial ring gaps avoid the quad-strip look.
def axial(name,bone_name,rings,k=11,palette=color_cream,jitter=0.036,theta=0.0):
    j=name_to_joint[bone_name]
    nodes=[]
    for ri,(z,y,rx,ry) in enumerate(rings):
        row=[]
        phase=theta+(.08 if ri%2==0 else -.13)+.019*math.sin(ri*2.8)
        for i in range(k):
            t=2*math.pi*i/k+phase
            phi=1+(rng.random()-.5)*jitter
            row.append((math.cos(t)*rx*phi,y+math.sin(t)*ry*phi,z))
        nodes.append(row)
    for ri in range(len(nodes)-1):
        for i in range(k):
            u=i;v=(i+1)%k
            p0,p1,p2,p3=nodes[ri][u],nodes[ri][v],nodes[ri+1][v],nodes[ri+1][u]
            center_y=(rings[ri][1]+rings[ri+1][1])*.5
            # Two different triangles; vary diagonal to avoid a regular checker pattern
            pairs=[(p0,p1,p3),(p1,p2,p3)] if (ri+i)%2==0 else [(p0,p1,p2),(p0,p2,p3)]
            for a,b,c in pairs:
                mid=tuple((a[d]+b[d]+c[d])/3 for d in range(3))
                out=(mid[0],mid[1]-center_y,0.)
                tri(a,b,c,j,palette,name,out)
    if rings[0][2]>0.001:
        for i in range(k):
            t=i;u=(i+1)%k
            z,y,_,_=rings[0]
            tri((0,y,z),nodes[0][t],nodes[0][u],j,palette,name,(0,0,-1))
    if rings[-1][2]>0.001:
        for i in range(k):
            t=i;u=(i+1)%k
            z,y,_,_=rings[-1]
            tri((0,y,z),nodes[-1][t],nodes[-1][u],j,palette,name,(0,0,1))

# Outer body: shoulder hump centered ahead, deep chest and square rump.
axial('torso','goat_torso',[
 (-1.03,1.43,.12,.23),(-.91,1.43,.32,.39),(-.72,1.44,.43,.49),
 (-.44,1.42,.49,.51),(-.16,1.43,.50,.53),(.15,1.49,.57,.59),
 (.39,1.55,.60,.66),(.58,1.53,.55,.64),(.75,1.50,.45,.51),
 (.91,1.45,.28,.36),(.98,1.45,.09,.18)],k=15,palette=color_cream)
# Hump crest follows the mountain goat's characteristic heavy withers.
axial('shoulder_mantle','goat_torso',[
 (.12,1.81,.08,.07),(.24,1.80,.32,.26),(.37,1.77,.42,.32),
 (.49,1.72,.40,.30),(.68,1.66,.24,.20),(.73,1.61,.04,.04)],k=11,palette=color_ivory)
# Neck is thick and short, not the long neck of a domestic goat.
axial('neck','goat_neck',[
 (.36,1.80,.37,.37),(.50,1.88,.39,.39),(.66,1.97,.34,.35),
 (.79,2.09,.30,.30),(.92,2.13,.26,.26),(1.03,2.12,.16,.19)],k=12,palette=color_cream)
# A compact elongated muzzle, small attentive ears, black nose and black short horns.
axial('head','goat_head',[
 (.85,2.17,.22,.25),(1.01,2.21,.27,.25),(1.17,2.22,.25,.23),
 (1.28,2.17,.21,.20),(1.42,2.10,.16,.13),(1.51,2.09,.11,.10)],k=11,palette=color_ivory)
axial('nose','goat_head',[(1.46,2.075,.13,.105),(1.57,2.06,.12,.085),(1.60,2.055,.085,.05)],k=8,palette=color_dark)

# Faceted polygon eyes attached to head, not oversized toy eyes.
def faceted_ball(name,bone_name,center,radius,basecolor,k=8,latitudes=3):
    cx,cy,cz=center
    ringlist=[]
    for ri in range(latitudes+1):
        theta=math.pi*ri/latitudes
        row=[]
        for i in range(k):
            phi=2*math.pi*(i+.2*(ri%2))/k
            row.append((cx+radius*math.sin(theta)*math.cos(phi),cy+radius*math.cos(theta),cz+radius*math.sin(theta)*math.sin(phi)))
        ringlist.append(row)
    joint=name_to_joint[bone_name]
    for ri in range(latitudes):
        for i in range(k):
            a,b,c,d=ringlist[ri][i],ringlist[ri][(i+1)%k],ringlist[ri+1][(i+1)%k],ringlist[ri+1][i]
            for vs in ((a,b,d),(b,c,d)):
                mid=tuple(sum(p[h] for p in vs)/3 for h in range(3))
                tri(*vs,joint,basecolor,name,tuple(mid[h]-center[h] for h in range(3)))
for side in (-1,1):
    faceted_ball('eye_'+str(side),'goat_head',(side*.248,2.28,1.14),.041,color_dark,7,3)
    # slender dark horn tilts backwards, each finite low-poly taper is skinned to head
    # terminate at < ~2.78 world height. It should not look like a ram's spiral.
    def tube_horn(side):
        j=name_to_joint['goat_head'];k=7
        ctrs=[(side*.165,2.37,.94),(side*.182,2.51,.92),(side*.21,2.65,.85),(side*.24,2.69,.77)]
        rads=[.071,.055,.033,.012]
        rows=[]
        for q,(x,y,z) in enumerate(ctrs):
            rows.append([(x+math.cos(i*math.tau/k)*rads[q],y,z+math.sin(i*math.tau/k)*rads[q]) for i in range(k)])
        for q in range(len(rows)-1):
            for i in range(k):
                ii=(i+1)%k
                for a,b,c in ((rows[q][i],rows[q][ii],rows[q+1][i]),(rows[q][ii],rows[q+1][ii],rows[q+1][i])):
                    mid=tuple((a[h]+b[h]+c[h])/3 for h in range(3));cen=ctrs[q]
                    tri(a,b,c,j,color_dark,'horn',tuple(mid[h]-cen[h] for h in range(3)))
    tube_horn(side)
    # Small white pointed ears, with a dark gray inner facet.
    j=name_to_joint['goat_head']
    earbase=(side*.25,2.34,.98)
    earend=(side*.47,2.35,.88)
    earleft=(side*.39,2.44,.91)
    earbottom=(side*.39,2.29,.91)
    tri(earbase,earleft,earend,j,color_ivory,'ear',(0,.1,0))
    tri(earbase,earend,earbottom,j,color_shade,'ear',(0,-.1,0))
    tri((side*.30,2.34,.985),(side*.415,2.38,.89),earend,j,color_inner,'ear_inner',(0,.1,.1))

# Small chin beard and low-poly winter neck fringe. The shoulder mane and short
# front-leg chaps matter more for species identity than adding facial detail.
chin=name_to_joint['goat_head']
for side in (-1,1):
    for off in (0.0,0.07):
        tri((side*.12,2.003,1.39-off),(side*.02,1.999,1.39-off),
            (side*.065,1.75+off*.6,1.27-off),chin,color_ivory,'chin_beard',(side*.3,-1,0))
neck_joint=name_to_joint['goat_neck']
for side in (-1,1):
    for z,y in [(.64,1.64),(.78,1.73),(.90,1.82)]:
        tri((side*.24,y+.17,z-.04),(side*.30,y+.1,z+.08),
            (side*.22,y-.16,z+.025),neck_joint,color_ivory,'throat_mane',(side,0,0))

# Polygonal tail, close to body; avoid domestic-goat tail raised high.
axial('tail','goat_tail',[
 (-1.19,1.60,.035,.04),(-1.08,1.60,.10,.12),(-.97,1.59,.105,.11)],k=7,palette=color_ivory)

# Fur tufts create soft-looking thick coat using geometry (not alpha hair).
# Triangles hang down from brisket and underside; restrained at 6-8 tufts.
fur_j=name_to_joint['goat_torso']
for side in (-1,1):
    for q,(z,y,rz) in enumerate([(.51,1.11,.1),(.33,1.07,.17),(.12,1.08,.13),(-.23,1.02,.16)]):
        x=side*(.32 + (q%2)*.045)
        a=(x-.08, y+.13,z-.05);b=(x+.08,y+.12,z-.05);c=(x,y-.12,z+rz)
        tri(a,b,c,fur_j,color_ivory,'coat_fur',(-side,0,0))

# Transform arbitrary segment axis into a ring around it; flat caps inside joint overlaps.
def joint_tube(name,bone_name,points,radii,n=9,palette=color_cream):
    j=name_to_joint[bone_name]
    # Ring normal approximately along the axis; displace individual faceted vertices
    rows=[]
    for q,p in enumerate(points):
        p=tuple(p)
        before=points[max(q-1,0)];after=points[min(q+1,len(points)-1)]
        axis=[after[h]-before[h] for h in range(3)]
        length=math.sqrt(sum(x*x for x in axis))
        axis=[x/length for x in axis]
        other=(0.,0.,1.) if abs(axis[2])<.91 else (1.,0.,0.)
        uu=[axis[1]*other[2]-axis[2]*other[1],axis[2]*other[0]-axis[0]*other[2],axis[0]*other[1]-axis[1]*other[0]]
        uu_len=math.sqrt(sum(x*x for x in uu));uu=[x/uu_len for x in uu]
        vv=[axis[1]*uu[2]-axis[2]*uu[1],axis[2]*uu[0]-axis[0]*uu[2],axis[0]*uu[1]-axis[1]*uu[0]]
        row=[]
        for i in range(n):
            ang=2*math.pi*i/n+(.1 if q%2 else -.07)
            rr=radii[q]*(1+.025*math.sin(q+i*17))
            row.append(tuple(p[h]+rr*(uu[h]*math.cos(ang)+vv[h]*math.sin(ang)) for h in range(3)))
        rows.append(row)
    for q in range(len(rows)-1):
        for i in range(n):
            i2=(i+1)%n
            a,b,c,d=rows[q][i],rows[q][i2],rows[q+1][i2],rows[q+1][i]
            middle=tuple((points[q][h]+points[q+1][h])/2 for h in range(3))
            for vs in (((a,b,c),(a,c,d)) if (i+q)%2 else ((a,b,d),(b,c,d))):
                mid=tuple(sum(p[h] for p in vs)/3 for h in range(3))
                tri(*vs,j,palette,name,tuple(mid[h]-middle[h] for h in range(3)))
    # Caps oriented along segment vector; behind joints overlap with next segment.
    start=points[0];end=points[-1]
    forward=tuple(end[h]-start[h] for h in range(3))
    for i in range(n):
        ii=(i+1)%n
        tri(start,rows[0][i],rows[0][ii],j,palette,name,tuple(-x for x in forward))
        tri(end,rows[-1][i],rows[-1][ii],j,palette,name,forward)

for side in ('left','right'):
    sx=-.39 if side=='left' else .39
    for kind in ('front','hind'):
        fr=kind=='front'
        upper=f'{side}_{kind}_upper';lower=f'{side}_{kind}_lower';pastern=f'{side}_{kind}_pastern';hoof=f'{side}_{kind}_hoof'
        p0,p1,p2,p3=[absp(x) for x in (upper,lower,pastern,hoof)]
        def interp(a,b,t):return tuple(a[i]+(b[i]-a[i])*t for i in range(3))
        # Fur-covered upper legs, visible elbows/stifles, lower shanks and hard cloven hooves.
        joint_tube(f'{kind}_upper',upper,[interp(p0,p1,-.06),interp(p0,p1,.28),interp(p0,p1,.68),interp(p0,p1,1.16)],
                   [.21,.22 if not fr else .19,.15,.13],n=9,palette=color_cream)
        joint_tube(f'{kind}_lower',lower,[interp(p1,p2,-.15),interp(p1,p2,.24),interp(p1,p2,.69),interp(p1,p2,1.13)],
                   [.14,.13,.105,.092],n=8,palette=color_ivory)
        joint_tube(f'{kind}_pastern',pastern,[interp(p2,p3,-.1),interp(p2,p3,.43),interp(p2,p3,1.05)],
                   [.094,.087,.095],n=7,palette=color_warm)
        # A minimal angular cuff of long white winter coat around the front shins.
        if fr:
            for skirt_side in (-1,1):
                for q in range(2):
                    p=interp(p0,p1,.46+.16*q)
                    j=name_to_joint[upper]
                    x=p[0]+skirt_side*.14
                    tri((x,p[1]+.13,p[2]-.075),(x+skirt_side*.10,p[1]+.12,p[2]+.055),
                        (x+skirt_side*.035,p[1]-.20,p[2]+.005),j,color_ivory,'foreleg_chaps',(skirt_side,0,0))
        # Hoof is an oval dark low-poly block with a subtly split front tip.
        joint_tube('hoof',hoof,[p3,(p3[0],p3[1]-.043,p3[2]+.023),(p3[0],p3[1]-.095,p3[2]+.07)],
                   [.13,.155,.12],n=8,palette=color_hoof)
        j=name_to_joint[hoof]
        tri((p3[0]-.018,p3[1]-.09,p3[2]+.13), (p3[0]+.018,p3[1]-.09,p3[2]+.13),
            (p3[0],p3[1]-.068,p3[2]+.044),j,color_dark,'hoof_split',(0,1,0))

# Shorten the distal legs to obtain the compact, stocky North American form.
# Remap *mesh and the entire articulated skeleton together*; otherwise the
# skin bind matrices would shear the knee and lifted hoof. Feet stay at y=0.
def compact_height(y):
    y=y+.190
    if y<=.3:return y
    if y>=1.5:return y-.22
    return y-.22*(y-.3)/1.2
def compact_derivative(y):
    y=y+.190
    return .8166666666667 if .3<y<1.5 else 1.
original_bone_abs=[absp(i) for i in range(len(bones))]
for i,p in enumerate(verts):verts[i]=(p[0],compact_height(p[1]),p[2])
for i,n in enumerate(normals):
    # Proper inverse-transpose normal transformation for vertical compression.
    ny=n[1]/compact_derivative(original_bone_abs[joints[i][0]][1]);l=math.sqrt(n[0]**2+ny**2+n[2]**2)
    normals[i]=(n[0]/l,ny/l,n[2]/l)
new_abs=[(p[0],compact_height(p[1]),p[2]) for p in original_bone_abs]
for i,b in enumerate(bones):
    if b['parent'] is None:b['translation']=new_abs[i]
    else:
        parent=new_abs[name_to_joint[b['parent']]]
        b['translation']=tuple(new_abs[i][h]-parent[h] for h in range(3))
TORSO_LOCAL_HEIGHT=bones[name_to_joint["goat_torso"]]["translation"][1]
# Torso animation translation is relative to goat_root; world height would lift the hooves.
# Encode one mesh's shared binary buffers and all 21 skin matrices / animation channels.
# Use tightly packed bufferViews for GLTF 2 and embed directly in GLB.
blob=bytearray()
views=[];acc=[]
def pack_buffer(items, fmt, comp_type, dtype, target=None, normalized=False, calc_bounds=False):
    align=(4-len(blob)%4)%4
    blob.extend(b'\x00'*align)
    offset=len(blob)
    for item in items:
        if not isinstance(item,(tuple,list)):item=(item,)
        blob.extend(struct.pack('<'+fmt,item[0]) if len(item)==1 else struct.pack('<'+fmt,*item))
    view={'buffer':0,'byteOffset':offset,'byteLength':len(blob)-offset}
    if target:view['target']=target
    vi=len(views);views.append(view)
    accessor={'bufferView':vi,'componentType':comp_type,'count':len(items),'type':dtype}
    if normalized:accessor['normalized']=True
    if calc_bounds:
        dims=1 if isinstance(items[0],(float,int)) else len(items[0])
        accessor['min']=[min(p if dims==1 else p[i] for p in items) for i in range(dims)]
        accessor['max']=[max(p if dims==1 else p[i] for p in items) for i in range(dims)]
    ai=len(acc);acc.append(accessor)
    return ai
pos_accessor=pack_buffer(verts,'3f',5126,'VEC3',34962,calc_bounds=True)
norm_accessor=pack_buffer(normals,'3f',5126,'VEC3',34962)
color_accessor=pack_buffer(colors,'4f',5126,'VEC4',34962)
joint_accessor=pack_buffer(joints,'4H',5123,'VEC4',34962)
weight_accessor=pack_buffer(weights,'4f',5126,'VEC4',34962)
indices_accessor=pack_buffer(indices,'I',5125,'SCALAR',34963)

# Determine bind world translation for each node. Rest rotation is identity.
bind_locations=[absp(i) for i in range(len(bones))]
matrix=[]
for x,y,z in bind_locations: matrix.append((1.,0.,0.,0.,0.,1.,0.,0.,0.,0.,1.,0.,-x,-y,-z,1.))
inv_accessor=pack_buffer(matrix,'16f',5126,'MAT4')

nodes=[]
for b in bones:
    nd={'name':b['name'],'translation':list(b['translation'])}
    nodes.append(nd)
for idx,b in enumerate(bones):
    if b['parent'] is not None:
        nd=nodes[name_to_joint[b['parent']]]
        nd.setdefault('children',[]).append(idx)
mesh_node=len(nodes)
nodes.append({'name':'MountainGoat_Rigged','mesh':0,'skin':0})

def quat_euler(x=0.,y=0.,z=0.):
    # XYZ intrinsic, enough for all small goat motions.
    sx,cx=math.sin(x/2),math.cos(x/2)
    sy,cy=math.sin(y/2),math.cos(y/2)
    sz,cz=math.sin(z/2),math.cos(z/2)
    return (sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz)

def smoothstep(t):return t*t*(3-2*t)
def holdpulse(t,start,peak,end,done):
    if t<=start or t>=done:return 0.
    if t<peak:return smoothstep((t-start)/(peak-start))
    if t<=end:return 1.
    return 1-smoothstep((t-end)/(done-end))

def animation(name,duration,fps,pose):
    ticks=round(duration*fps)+1
    times=[i*duration/(ticks-1) for i in range(ticks)]
    time_accessor=pack_buffer(times,'f',5126,'SCALAR',calc_bounds=True)
    anim={'name':name,'samplers':[],'channels':[]}
    for b in bones:
        bid=name_to_joint[b['name']]
        samples=[pose(b['name'],t,duration) for t in times]
        if all(sample==samples[0] for sample in samples):continue
        if len(samples[0])==4:
            output=pack_buffer(samples,'4f',5126,'VEC4')
            path='rotation'
        else:
            output=pack_buffer(samples,'3f',5126,'VEC3')
            path='translation'
        sampler=len(anim['samplers']);anim['samplers'].append({'input':time_accessor,'output':output,'interpolation':'LINEAR'})
        anim['channels'].append({'sampler':sampler,'target':{'node':bid,'path':path}})
    return anim

base=dict((b['name'],b['translation']) for b in bones)
def idle_pose(n,t,d):
    if n=='goat_torso':return (0.024*math.sin(2*math.pi*t/d),TORSO_LOCAL_HEIGHT+.017*math.sin(4*math.pi*t/d),0)
    if n=='goat_neck':return quat_euler(.032*math.sin(math.tau*t/d),.06*math.sin(math.tau*t/d))
    if n=='goat_head':return quat_euler(-.075*math.sin(math.tau*t/d),.065*math.sin(math.tau*t/d+.9))
    if n=='left_front_upper':return quat_euler(-.33*holdpulse(t,2.1,2.65,3.1,3.65))
    if n=='left_front_lower':return quat_euler(.49*holdpulse(t,2.1,2.65,3.1,3.65))
    if n=='left_front_pastern':return quat_euler(-.13*holdpulse(t,2.1,2.65,3.1,3.65))
    return quat_euler()

def survey_pose(n,t,d):
    if n=='goat_torso':return (0,TORSO_LOCAL_HEIGHT+.012*math.sin(math.tau*t/d),0)
    if n=='goat_neck':return quat_euler(-.12*math.sin(math.pi*t/d),.16*math.sin(math.tau*t/d))
    if n=='goat_head':return quat_euler(-.14*math.sin(math.pi*t/d),-.20*math.sin(math.tau*t/d))
    return quat_euler()

def lift_pose(n,t,d):
    p=holdpulse(t,.24,.90,1.55,2.44)
    if n=='goat_torso':return (0.035*p,TORSO_LOCAL_HEIGHT+.015*p,-.012*p)
    if n=='goat_neck':return quat_euler(-.06*p,0.,0.)
    if n=='left_front_upper':return quat_euler(-.44*p)
    if n=='left_front_lower':return quat_euler(.67*p)
    if n=='left_front_pastern':return quat_euler(-.25*p)
    if n=='left_front_hoof':return quat_euler(.13*p)
    return quat_euler()

def walk_pose(n,t,d):
    wave=math.tau*t/d*2.0 # two deliberate step cycles in place
    if n=='goat_torso':return (0.018*math.sin(wave),TORSO_LOCAL_HEIGHT+.024*math.sin(wave*2-.3),0)
    if n=='goat_neck':return quat_euler(.045*math.sin(wave-.4))
    if n=='goat_head':return quat_euler(-.045*math.sin(wave-.4),.02*math.sin(wave*.5))
    for side in ('left','right'):
        for kind in ('front','hind'):
            prefix=f'{side}_{kind}_'
            if n.startswith(prefix):
                phase=0 if (side,kind) in (('left','front'),('right','hind')) else math.pi
                w=math.sin(wave+phase)
                p=max(0,-w) # forward swing is negative X and hoof clears stone
                segment=n.removeprefix(prefix)
                if segment=='upper':return quat_euler(.30*w)
                if segment=='lower':return quat_euler(.22*p-.035*max(0,w))
                if segment=='pastern':return quat_euler(-.16*p)
                if segment=='hoof':return quat_euler(-.13*w)
    return quat_euler()

animations=[animation('idle',6.,12,idle_pose),animation('survey',4.2,12,survey_pose),
            animation('lift_front',2.8,15,lift_pose),animation('walk',4.0,14,walk_pose)]

# Spatially compact: all colors are vertex colors, no texture PNG or alpha cards.
doc={
 'asset':{'version':'2.0','generator':'Home of Woods original procedural faceted mountain goat','copyright':'Home of Woods - original project asset'},
 'scene':0,'scenes':[{'nodes':[0,mesh_node]}],
 'nodes':nodes,
 'meshes':[{'name':'Oreamnos_Faceted_NonPhotorealistic','primitives':[{
     'attributes':{'POSITION':pos_accessor,'NORMAL':norm_accessor,'COLOR_0':color_accessor,'JOINTS_0':joint_accessor,'WEIGHTS_0':weight_accessor},
     'indices':indices_accessor,'material':0,'mode':4}]}],
 'skins':[{'name':'MountainGoat_21JointRig','inverseBindMatrices':inv_accessor,'joints':list(range(len(bones))),'skeleton':0}],
 'materials':[{'name':'Ivory_Faceted_Matte','doubleSided':False,'pbrMetallicRoughness':{
    'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.83}}],
 'animations':animations,'buffers':[{'byteLength':len(blob)}],
 'bufferViews':views,'accessors':acc,
 'extras':{'species':'Oreamnos americanus','regions':REGIONS,'license':'project original','workflow':'explicit irregular triangle geometry, rigid skin regions, 4 limited-scope actions'},
}
# align GLB chunks
binary=bytes(blob);binary+=b'\x00'*((-len(binary))%4)
json_bytes=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf8')
json_bytes+=b' '*((-len(json_bytes))%4)
whole=bytearray(12+8+len(json_bytes)+8+len(binary))
struct.pack_into('<4sII',whole,0,b'glTF',2,len(whole))
struct.pack_into('<II',whole,12,len(json_bytes),0x4E4F534A)
whole[20:20+len(json_bytes)]=json_bytes
start=20+len(json_bytes)
struct.pack_into('<II',whole,start,len(binary),0x004E4942)
whole[start+8:]=binary
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_bytes(whole)
sha=hashlib.sha256(whole).hexdigest()
print(json.dumps({'path':str(OUT.relative_to(ROOT)),'bytes':len(whole),'sha256':sha,'triangles':len(indices)//3,
                  'joints':len(bones),'animations':{x['name']:len(x['channels']) for x in animations},
                  'regions':REGIONS,'maxHeight':max(p[1] for p in verts),'bounds':{
                      'min':[min(p[i] for p in verts) for i in range(3)],'max':[max(p[i] for p in verts) for i in range(3)]}},indent=2))
