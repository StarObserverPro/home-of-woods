"""Bag, gloves, belt and neck pieces for the three style families."""
from math import cos, pi, sin

from mathutils import Vector

from mesh import Mesh, blend, clamp, polar_section, smooth


STYLES=('yard','town','trail')


def hardware(cloth):
    return cloth.get('五金 · 古铜','b1854d','brass'),cloth.get('皮边 · 栗棕','493629','leather')


def belt_buckle(mesh,center,weight,metal,half=.017,r=.002):
    x,y,z=center
    path=[(x+.002,y+dy,z+dz) for dy,dz in ((-half,-.009),(-half,.009),(half,.009),(half,-.009),(-half,-.009))]
    mesh.tube([(p,weight) for p in path],metal,r,6)
    mesh.tube([((x+.002,y-half,z),weight),((x+.004,y+.007,z),weight)],metal,r*.7,6)


def make_belts(cloth,add,fittings):
    for style,main,width in [('yard','63442f',.024),('town','4c3128',.017),('trail','827751',.032)]:
        body=cloth.get('腰带 · '+style,main,'canvas' if style=='trail' else 'leather',True)
        brass,leather=hardware(cloth)
        thread=cloth.get('腰带 · 马具线','c5a37c')
        for fit_id,fit in fittings.items():
            base,tier,attach=Mesh(),Mesh(),Mesh()
            z={'yard':.552,'town':.554,'trail':.607}[fit_id]
            rows=[]
            for delta,offset in ((-width*.51,.001),(-width*.5,.0035),(-width*.38,.006),(width*.38,.006),(width*.5,.0035),(width*.51,.001)):
                rows.append([fit.section(a*2*pi/48,z+delta,offset) for a in range(48)])
            base.rings(rows,lambda i,j: body if 1<=i<=3 else leather)
            center,w=fit.section(0,z,.010)
            belt_buckle(base,center,w,brass,.019 if style=='trail' else .015)
            for row in (rows[2],rows[3]):
                tier.tube(row+row[:1],thread,.00088,5)
            p,w=fit.section(.98,z-.003,.009)
            ring=[(p+Vector((.003,.008*cos(a*pi/6),.010*sin(a*pi/6)-.009)),w) for a in range(13)]
            attach.tube(ring,brass,.0017,6)
            for length,c in ((.030,-.003),(.024,.003)):
                attach.tube([(p+Vector((.004,c,-.016)),w),(p+Vector((.004,c-.001,-length)),w),
                             (p+Vector((.004,c+.003,-length)),w)],brass,.0015,6)
            for variant,mesh in (('base',base),('upgrade',tier),('attachment',attach)):
                add('waist',style,variant,mesh,fit=fit_id)


def neck_ring(x,z,d,w,style):
    ring=[]
    for j in range(36):
        a=2*pi*j/36
        c=cos(a)
        front=max(0,c)
        fall={'yard':.034,'town':.012,'trail':.023}[style]*front**2.4
        p=Vector((x+d*c,w*sin(a),z-fall+.003*sin(3*a)))
        joint=clamp((p.z-.790)*9,0,.30)
        ring.append((p,{'spine_02':1-joint,'neck_01':joint}))
    return ring


def make_neckwear(cloth,add,fittings):
    for style,main,edge in [('yard','a35443','64392d'),('town','465e6b','303e48'),('trail','bd8c49','786145')]:
        dye=cloth.get('领巾 · '+style,main,'canvas' if style=='yard' else 'wool',True)
        trim=cloth.get('领巾 · '+style+' 反折',edge,'wool')
        brass,leather=hardware(cloth)
        for fit_id,fit in fittings.items():
            base,tier,attach=Mesh(),Mesh(),Mesh()
            rows=[neck_ring(-.008,z,d,w,style) for z,d,w in ((.801,.041,.044),(.807,.046,.048),(.821,.044,.046),(.823,.040,.041),(.815,.040,.041))]
            base.rings(rows,lambda i,j: dye if i<3 else trim)
            if style=='yard':
                outline=[(-.043,.778),(-.014,.781),(.038,.779),(.047,.769),(.034,.745),(.006,.711),(-.012,.715),(-.032,.751)]
                z=.742;y=.017
            elif style=='town':
                outline=[(-.017,.796),(-.008,.803),(.018,.799),(.016,.777),(.009,.759),(-.012,.770)]
                z=.784;y=.003
            else:
                outline=[(-.047,.776),(-.021,.793),(.028,.790),(.038,.782),(.015,.760),(-.005,.740),(-.031,.748)]
                z=.770;y=-.014
            fx=fit.project(1,0,.77,.010)[0].x
            # The point and knot follow the selected top. The collar can turn with the neck.
            if style=='yard':
                # Fold the two tips into the front of the actual neck band.
                panels=[]
                for height,left,right,lift in ((.715,.001,.010,.004),(.731,-.014,.023,.005),(.752,-.028,.037,.005),
                                                (.771,-.044,.049,.006),(.779,-.041,.043,.006),(.790,-.032,.035,.005)):
                    row=[]
                    for j in range(13):
                        t=j/12
                        y=left+(right-left)*t
                        upper=min(height,.770)
                        p,drape_w=fit.project(1,y,upper,lift+.004*sin(pi*t))
                        if height>.770:
                            a=smooth(.770,.790,height)
                            band_x=.040-.011*abs(y)/.035
                            p.x=(1-a)*p.x+a*band_x
                            drape_w=blend(drape_w,{'spine_02':.84,'neck_01':.16},a)
                        p.z=height
                        row.append((p,drape_w))
                    panels.append(row)
                base.rings(panels,dye,closed=False)
                lining=[[(p-Vector((.001,0,0)),w) for p,w in row] for row in reversed(panels)]
                base.rings(lining,trim,closed=False)
                p,jointed=panels[-2][6]
                base.ellipsoid(p,(.008,.018,.010),jointed,dye,16,7)
            else:
                base.patch(outline,1,fit,dye,.011)
            knot,wt=fit.project(1,y,z,.014, fallback=fx)
            if style!='yard':
                base.ellipsoid(knot,(.009,.013,.010),wt,trim,12,5)
            span=.025 if style!='town' else .012
            tier.tube([fit.project(1,y-span,z-.011,.015),fit.project(1,y,z-.020,.016),fit.project(1,y+span,z+.006,.015)],trim,.00155,6)
            attach.stud(knot+Vector((.009,0,0)),wt,brass,.0068,.0034,sides=10)
            for variant,mesh in (('base',base),('upgrade',tier),('attachment',attach)):
                add('neck',style,variant,mesh,fit=fit_id)


def round_pack(mesh, center, size, weight, dye, lining):
    cx,cy,cz=center
    depth,width,height=size
    rings=[]
    # A gusseted bag, softly squared in plan, swollen through the middle.
    for i,(z,t) in enumerate(((-1,.74),(-.92,.94),(-.72,1),(.50,1),(.83,.95),(1,.76))):
        row=[]
        for j in range(24):
            a=j*pi/12
            cx_a=cos(a);cy_a=sin(a)
            x=cx+depth*t*(1 if cx_a>=0 else -1)*abs(cx_a)**.68
            y=cy+width*t*(1 if cy_a>=0 else -1)*abs(cy_a)**.68
            row.append(((x,y,cz+height*z),weight,(j/12,i/5)))
        rings.append(row)
    mesh.rings(rings,lambda i,j:lining if i in (0,4) else dye,caps=True)


def strap_path(mesh,points,material,half_width):
    rows=[]
    for i,(point,w) in enumerate(points):
        tangent=Vector(points[min(len(points)-1,i+1)][0])-Vector(points[max(0,i-1)][0])
        tangent.normalize()
        cross=Vector((0,1,0))-tangent*tangent.y
        cross.normalize()
        normal=cross.cross(tangent).normalized()
        rows.append([(point+cross*t*half_width+normal*depth,w) for t,depth in ((-.79,-.0005),(-1,0),(-.8,.0013),(.8,.0013),(1,0),(.79,-.0005))])
    mesh.rings(rows,material,caps=True)


def shoulder_curve(fit,y):
    origin=Vector((.005,y,.703))
    path=[]
    for i in range(24):
        angle=.51+(pi-1.02)*i/23
        aim=Vector((cos(angle),0,sin(angle)))
        hit,_,idx,_=fit.tree.ray_cast(origin,aim,.16)
        if hit is None:
            p=origin+aim*.083
            path.append((p,fit.at(p)))
        else:
            # Join both sewn ends over the actual shoulder rather than cutting
            # a straight chord through its curvature on bent arms.
            path.append((hit+aim*.008,fit.mix_weights(hit,idx)))
    return path


def make_bags(cloth,add,fittings):
    variants=[('yard',(-.126,0,.670),(.037,.075,.093),'82734d'),
              ('town',(-.061,-.132,.518),(.040,.049,.059),'805742'),
              ('trail',(-.143,0,.673),(.053,.079,.099),'555a42')]
    for style,center,size,color in variants:
        dye=cloth.get('背负 · '+style,color,'leather' if style=='town' else 'canvas',True)
        flap=cloth.get('背负 · '+style+' 袋盖',{'yard':'665439','town':'563826','trail':'716449'}[style],'leather')
        brass,leather=hardware(cloth)
        fabric=cloth.get('背负 · 羊毛卷','989c83','wool')
        base,tier,attach=Mesh(),Mesh(),Mesh()
        w={'spine_02':1} if style!='town' else {'spine_01':.56,'Pelvis':.44}
        if style!='town':
            back=min(fit.project(-1,0,center[2])[0].x for fit in fittings.values())
            center=(back-.86*size[0],0,center[2])
        round_pack(base,center,size,w,dye,flap)
        x,y,z=center;d,b,h=size
        if style!='town':
            for side in (-1,1):
                round_pack(base,(x+d*.88,side*b*.42,z-.004),(.012,.019,h*.62),w,flap,leather)
        round_pack(base,(x-d*.17,y,z+h*.65),(d*.88,b*1.013,h*.36),w,flap,leather)
        for sy in ((0,) if style=='town' else (-1,1)):
            lat=y+sy*b*.53
            path=[(Vector((x-d*.80,lat,z+h*.71)),w),(Vector((x-d*1.02,lat,z+h*.38)),w),(Vector((x-d*1.04,lat,z+h*.01)),w)]
            strap_path(base,path,leather,.008)
            base.stud((x-d*1.05,lat,z+h*.07),w,brass,.005,.0025,normal=(-1,0,0))
        if style=='trail':
            # A short roll held under two backpack straps.
            a=Vector((x-.003,-.086,z+h+.020)); bpt=Vector((x-.003,.086,z+h+.020))
            base.tube([(a,w),(a.lerp(bpt,.1),w),(a.lerp(bpt,.9),w),(bpt,w)],fabric,.022,18)
            for s in (-1,1):
                loop=[(Vector((x-.003+.0225*cos(j*pi/12),s*.060,z+h+.02+.0225*sin(j*pi/12))),w) for j in range(25)]
                base.tube(loop,leather,.003,8)
        for s in (-1,1):
            tier.tube([((x-d*.94,y+s*b*.64,z+h*.40),w),((x-d*1.015,y+s*b*.67,z),w),
                       ((x-d*.94,y+s*b*.65,z-h*.62),w)],brass,.00155,6)
        # A tool case, rolled map, or canvas canteen on the pack's physical side loop.
        anchor=(x-d*.36,y+(b+.012)*(1 if style!='town' else -1),z+h*.16)
        attach.tube([(Vector(anchor)+Vector((0,0,.013)),w),(Vector(anchor),w),(Vector(anchor)-Vector((0,0,.016)),w)],brass,.003,8)
        if style=='town':
            attach.tube([(Vector(anchor)+Vector((0,0,.008)),w),(Vector(anchor)-Vector((0,0,.075)),w)],fabric,.014,12)
        else:
            attach.ellipsoid(Vector(anchor)-Vector((0,0,.041)),(.021,.017,.027),w,flap,14,7)
        for part,mesh in (('base',base),('upgrade',tier),('attachment',attach)):
            add('back',style,part,mesh)
        for fit_id,fit in fittings.items():
            straps=Mesh()
            for sign in ((1,) if style=='town' else (-1,1)):
                shoulder=sign*.066
                across=style=='town'
                front=[(shoulder,.727),(sign*(.045 if across else .065),.708),(sign*(.012 if across else .071),.653),
                       (sign*(-.035 if across else .080),.599),(sign*(-.080 if across else .085),.554)]
                path=[fit.project(1,lat,hgt,.011) for lat,hgt in reversed(front)]
                path.extend(shoulder_curve(fit,shoulder))
                back_path=[(.055,.731),(.040,.703),(.007,.669),(-.034,.628),(-.073,.587)] if across else [(sign*.066,.728),(sign*.066,.706)]
                path.extend(fit.project(-1,lat,hgt,.010) for lat,hgt in back_path)
                far=Vector((center[0]+.014,(-.094 if across else sign*.061),center[2]+size[2]*.34))
                path.append((far,w))
                if not across:
                    tail=[(Vector((center[0]+.020,sign*.076,.614)),w)]
                    tail.extend(fit.section(sign*a,z,.009) for a,z in [(2.63,.602),(2.18,.587),(1.73,.576),(1.38,.568),(1.01,.559)])
                    path=tail+path
                else:
                    path.insert(0,(Vector((center[0]+.012,-.111,.546)),w))
                strap_path(straps,path,leather,.010 if style=='trail' else .0073)
            add('back',style,'straps',straps,fit=fit_id)


def hand_face(points):
    return all(abs(p.y)>.165 and .385<p.z<.596 for p in points)


def make_gloves(donor,rig,cloth,add):
    brass,leather=hardware(cloth)
    for style,color in [('yard','a3825c'),('town','85674f'),('trail','535346')]:
        base,tier,attach=Mesh(),Mesh(),Mesh()
        dye=cloth.get('手套 · '+style,color,'canvas' if style=='yard' else 'leather',True)
        edge=cloth.get('手套 · '+style+' 护腕',{'yard':'6a4e36','town':'714b3c','trail':'8a6c48'}[style],'leather')
        for sign,side in ((-1,'r'),(1,'l')):
            root,mid=(rig.matrix_world @ rig.data.bones[f'{name}_{side}'].head_local for name in ('hand','middle_01'))
            axis=(mid-root).normalized()
            across=axis.cross(Vector((1,0,0))).normalized()
            normal=across.cross(axis)
            def cover(points):
                if not hand_face(points) or any(sign*p.y<0 for p in points):
                    return False
                return style!='yard' or max((p-root).dot(axis) for p in points)<.055
            def puff(p):
                t=(p-root).dot(axis)
                center=root+axis*t
                v=p-center
                return p+v.normalized()*.0027
            base.donor(donor,dye,keep=cover,transform=puff)
            cuff_length={'yard':.015,'town':.011,'trail':.024}[style]
            fit_base=root-axis*cuff_length
            def cuff_ring(ax,dy,dx):
                return [(fit_base+axis*ax+across*dy*cos(j*2*pi/24)+normal*dx*sin(j*2*pi/24),{'hand_'+side:.72,'lowerarm_'+side:.28}) for j in range(24)]
            cuff_width={'yard':1,'town':.92,'trail':1.08}[style]
            cuff_curve=((-cuff_length*.26,.022,.025),(0,.024,.027),(.010,.025,.027),(cuff_length+.002,.023,.024))
            rings=[cuff_ring(ax,dy*cuff_width,dx*cuff_width) for ax,dy,dx in cuff_curve]
            base.rings(rings,edge)
            tier.tube(rings[2]+rings[2][:1],brass,.00128,6)
            p=fit_base+axis*.005+normal*.029
            attach.stud(p,{'hand_'+side:.72,'lowerarm_'+side:.28},brass,.0046,.0024,normal=normal,sides=8)
        for variant,mesh in (('base',base),('upgrade',tier),('attachment',attach)):
            add('hands',style,variant,mesh)
