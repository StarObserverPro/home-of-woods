"""Three continuous top patterns and three continuous trouser silhouettes."""
from collections import defaultdict
from math import cos, pi, sin

from mathutils import Vector

from mesh import Mesh, Surface, blend, clamp, oval_outline, polar_section, seam, smooth


def taper(values, t):
    for (a,x),(b,y) in zip(values,values[1:]):
        if t <= b:
            return x+(y-x)*clamp((t-a)/(b-a))
    return values[-1][1]


def top_shape(style, p):
    x,y,z = p
    center = .006
    torso = 1-smooth(.088,.16,abs(y))
    if style == 'yard':
        return x+(x-center)*.022*torso, y, z
    if style == 'town':
        return x-(x-center)*.025*torso, y, z
    hem = 1-smooth(.525,.637,z)
    return x+(x-center)*(.15*torso+.12*hem*torso), y*(1+.07*torso), z-hem*.037*torso


def collar(mesh, surface, dye, lining, shape='band'):
    rings = []
    for width, depth, h in ((.044,.042,0),(.045,.043,.009),(.043,.041,.024),(.039,.037,.022),(.040,.038,.005)):
        row = []
        for i in range(32):
            a = 2*pi*i/32
            lower_front = .026*max(0,cos(a))**2
            lower_side = .013*abs(sin(a))
            z = .793 - lower_front - lower_side + h
            p = Vector((-.010+depth*cos(a),width*sin(a),z))
            row.append((p,surface.at(p)))
        rings.append(row)
    mesh.rings(rings,lambda i,j: dye if i<2 else lining)
    if shape == 'fall':
        for sign in (-1,1):
            coords = [(sign*.012,.784),(sign*.033,.798),(sign*.051,.773),(sign*.036,.749),(sign*.025,.757)]
            if sign<0:
                coords.reverse()
            mesh.patch(coords,1,surface,dye,.006)


def pocket(mesh, surface, y, z, w, h, body, edge, closure, flap=False):
    mesh.patch(oval_outline(y,z,w,h),1,surface,body,.0026)
    mesh.tube(seam([(y-w*.82,z+h),(y,z+h+.001),(y+w*.82,z+h)],1,surface,.007),edge,.00145)
    if flap:
        contour=[(y-w,z+h+.003),(y-w*.93,z+h-.005),(y,z+h-.013),(y+w*.93,z+h-.005),(y+w,z+h+.003)]
        mesh.patch(contour,1,surface,edge,.0052)
        p,wt = surface.project(1,y,z+h-.007,.010)
        mesh.stud(p,wt,closure,.0034)


def button_row(mesh, surface, levels, material, offset=.005, radius=.0042):
    for z in levels:
        p,w=surface.project(1,0,z,offset)
        mesh.stud(p,w,material,radius)


def vest_edges(p):
    y=abs(p.y)
    front=smooth(-.031,.034,p.x)
    notch=sin(pi*clamp(y/.091))
    hem=.544-front*(.013+.008*notch)
    v_front=taper([(0,.674),(.013,.679),(.024,.708),(.037,.746),(.047,.782),(.058,.808)],y)
    rear=.763+.045*smooth(.023,.064,y)
    neckline=rear*(1-front)+v_front*front
    return hem,neckline


def vest_lining(p):
    hem,top=vest_edges(p)
    overlap=smooth(-.003,.012,min(p.z-hem,top-p.z))
    tuck=1-smooth(.533,.562,p.z)
    ease=max(overlap,tuck)*(1-smooth(.095,.125,abs(p.y)))
    return .006+(p.x-.006)*(1-.17*ease),p.y*(1-.19*ease),p.z


def vest_field(p):
    hem,neckline=vest_edges(p)
    armhole=taper([(.53,.110),(.680,.114),(.713,.106),(.742,.091),(.774,.085),(.802,.084)],p.z)
    return min(p.z-hem,neckline-p.z,armhole-abs(p.y))


def cut_shirt(shirt,field,transform,rolled_edge=False):
    """Clip along the donor surface and interpolate source weights at the seam."""
    points,weights,faces = [],[],[]
    values=[field(p) for p in shirt.points]
    fwd={}
    boundary=set()

    def push(p,w):
        points.append(Vector(transform(p)))
        weights.append(w)
        return len(points)-1

    for face in shirt.faces:
        polygon=[]
        trim=[]
        for a,b in zip(face,face[1:]+face[:1]):
            da,db=values[a],values[b]
            if da>=0:
                if a not in fwd:
                    fwd[a]=push(shirt.points[a],shirt.weights[a])
                polygon.append(fwd[a])
            if (da>=0)!=(db>=0):
                key=tuple(sorted((a,b)))
                if key not in fwd:
                    t=da/(da-db)
                    fwd[key]=push(shirt.points[a].lerp(shirt.points[b],t),blend(shirt.weights[a],shirt.weights[b],t))
                polygon.append(fwd[key]);trim.append(fwd[key])
        if len(trim)==2:
            boundary.add(tuple(trim))
        faces.extend((polygon[0],polygon[i],polygon[i+1]) for i in range(1,len(polygon)-1))

    surface=Surface(points=points,faces=faces,weights=weights)
    if not rolled_edge:
        return surface,[]

    # Join the cut along duplicate UV vertices so the rolled facing is continuous.
    ids={}
    graph=defaultdict(set)
    for a,b in boundary:
        ka,kb=[tuple(round(v,5) for v in points[i]) for i in (a,b)]
        if ka==kb:
            continue
        ids[ka]=a;ids[kb]=b
        graph[ka].add(kb);graph[kb].add(ka)
    paths=[]
    while any(graph.values()):
        start=next(k for k,v in graph.items() if len(v)==1) if any(len(v)==1 for v in graph.values()) else next(k for k,v in graph.items() if v)
        path=[start]
        at=start
        while graph[at]:
            nxt=min(graph[at])
            graph[at].remove(nxt);graph[nxt].remove(at)
            path.append(nxt);at=nxt
            if at==start:
                break
        if len(path)>=3:
            paths.append([(points[ids[k]],weights[ids[k]]) for k in path])
    return surface,paths


def vest_allowance(p):
    return p+Vector((p.x-.006,p.y*.69,max(0,p.z-.741)*1.35)).normalized()*.0053


def pocket_chain(mesh,surface,metal):
    path=[]
    for i in range(17):
        t=i/16
        y=.003+.057*t
        z=.586+.025*t-.022*sin(pi*t)
        point,weight=surface.project(1,y,z,.006)
        path.append((point,weight))
    mesh.tube(path,metal,.00155,6)
    p,w=path[0]
    mesh.stud(p,w,metal,.0038,.0019)


def badge(mesh, surface, y, z, metal, dark, fern=False):
    p,w=surface.project(1,y,z,.0047)
    mesh.stud(p,w,dark,.011,.0032,sides=12)
    if fern:
        mesh.tube(seam([(y-.004,z-.006),(y,z),(y+.004,z+.007)],1,surface,.009),metal,.0013)
        for j in range(3):
            yy=y-.003+j*.003; zz=z-.004+j*.004
            for s in (-1,1):
                mesh.tube(seam([(yy,zz),(yy+s*.005,zz+.004)],1,surface,.009),metal,.00135,5)
    else:
        mesh.stud(p+Vector((.003,0,0)),w,metal,.006,.002,sides=8)


def make_tops(donor, cloth, add):
    fittings={}
    for style in ('yard','town','trail'):
        fit=donor.mapped(lambda p: top_shape(style,p))
        base,tier,attachment = Mesh(),Mesh(),Mesh()
        brass=cloth.get('五金 · 古铜','b1854d','brass')
        horn=cloth.get('五金 · 角扣','4c3529','horn')
        cream=cloth.get('布面 · 羊毛衬衣','ddc5a1','canvas')
        if style == 'yard':
            body=cloth.get('上衣 · 粗帆布','b99061','canvas',True)
            edge=cloth.get('上衣 · 工衫门襟','785941','canvas')
            thread=cloth.get('上衣 · 麻线','d7b486')
            base.donor(fit,body)
            collar(base,fit,edge,body)
            base.patch(oval_outline(0,.723,.012,.057,.004),1,fit,edge,.0035)
            button_row(base,fit,[.76,.733,.705,.68],horn,.008,.004)
            pocket(base,fit,.056,.661,.022,.022,body,edge,horn,True)
            pocket(tier,fit,-.056,.656,.023,.021,edge,edge,horn,True)
            for sign in (-1,1):
                pts=[(sign*.044,.729),(sign*.05,.732),(sign*.082,.749),(sign*.099,.751)]
                tier.tube(seam(pts,-1,fit,.0015),thread,.0013)
            badge(attachment,fit,.057,.706,brass,edge)
        elif style == 'town':
            body=cloth.get('上衣 · 双尖粗呢背心','87463a','wool',True)
            edge=cloth.get('上衣 · 背心滚边','482b28','wool')
            shirtsleeve,_=cut_shirt(fit,lambda p:.0035-vest_field(p),vest_lining)
            base.donor(shirtsleeve,cream)
            collar(base,fit,cream,cream)
            vest,facings=cut_shirt(fit,vest_field,vest_allowance,rolled_edge=True)
            base.donor(vest,body)
            for facing in facings:
                base.tube(facing,edge,.0016)
            button_row(base,vest,[.648,.619,.587,.554],horn,.0024,.0044)
            for sign in (-1,1):
                base.tube(seam([(sign*.027,.575),(sign*.043,.579),(sign*.059,.581)],1,vest,.0026),edge,.0022)
                tier.tube(seam([(sign*.029,.586),(sign*.046,.59),(sign*.063,.592)],1,vest,.0027),brass,.00145)
            tier.tube(seam([(0,.646),(0,.611),(0,.574),(0,.545)],1,vest,.0024),edge,.0017)
            pocket_chain(attachment,vest,brass)
            # Fit straps and belts to the outermost cloth where present.
            fittings[style]=combined(fit,vest)
        else:
            body=cloth.get('上衣 · 诺福克式束腰外套','65775a','wax',True)
            edge=cloth.get('上衣 · 外套翻领','415449','wool')
            border=cloth.get('上衣 · 干蜡接缝','a4a57b')
            base.donor(fit,body)
            collar(base,fit,edge,edge,'fall')
            for sign in (-1,1):
                contour=[(sign*.012,.699),(sign*.029,.786),(sign*.059,.776),(sign*.071,.747),(sign*.059,.748),(sign*.061,.734)]
                if sign<0:
                    contour.reverse()
                base.patch(contour,1,fit,edge,.007)
                pocket(base,fit,sign*.052,.544,.029,.028,body,edge,brass,True)
                pleat=[(sign*.061,.75),(sign*.062,.703),(sign*.056,.65),(sign*.049,.608)]
                base.tube(seam(pleat,1,fit,.0029),body,.003,7)
                base.tube(seam(pleat,-1,fit,.0029),edge,.003,7)
                tier.tube(seam(pleat,-1,fit,.005),border,.0013)
                tier.tube(seam([(sign*.020,.525),(sign*.041,.522),(sign*.067,.512)],1,fit,.007),border,.0012)
            button_row(base,fit,[.688,.653,.621,.532],horn,.0037,.0048)
            badge(attachment,fit,.054,.713,brass,edge,True)
        add('top',style,'base',base)
        add('top',style,'upgrade',tier)
        add('top',style,'attachment',attachment)
        if style not in fittings:
            fittings[style]=fit
    return fittings


def combined(a,b):
    return Surface(points=a.points+b.points,weights=a.weights+b.weights,faces=a.faces+[tuple(i+len(a.points) for i in f) for f in b.faces])


def trouser_shape(style,p):
    x,y,z=p
    h=1-smooth(.395,.52,z)
    side=1 if y>=0 else -1
    center_y=side*taper([(.148,.090),(.28,.079),(.46,.061)],z)
    center_x=taper([(.149,-.007),(.28,.001),(.48,-.002)],z)
    if style=='yard':
        ease=1+.13*h
    elif style=='town':
        ease=taper([(.14,.73),(.214,.74),(.239,.82),(.264,1.27),(.309,1.23),(.41,1.09),(.5,1)],z)
    else:
        ease=taper([(.145,.82),(.28,.91),(.38,1.12),(.48,1.02)],z)
    cuff=smooth(.16,.242,z)
    # All three cuts tuck inside the high boot, while the ankle extension
    # reaches the low shoe when it is worn with the same pair of trousers.
    ease *= .79+.21*cuff
    return center_x+(x-center_x)*ease,center_y+(y-center_y)*ease,z


def leggings(mesh, fit, style, dye, sock, hem):
    for sign, side in ((-1,'r'),(1,'l')):
        rings=[]
        end=.159
        top_center=Vector((-.010,sign*.088,end))
        for z,depth,width in ((.053,.028,.024),(.077,.031,.025),(.103,.026,.024),(.128,.026,.024),(.153,.029,.029),(.162,.032,.031)):
            ankle=1-smooth(.058,.116,z)
            w={f'foot_{side}':ankle,f'calf_{side}':1-ankle}
            row = polar_section(-.012+z*.03,z,depth,width,w,sign*(.094-(z-.06)*.05),n=24)
            # Calf-ring weights converge to the original trouser cuff above this stitch.
            stitched=[]
            for j,(p,skin) in enumerate(row):
                range_top=smooth(.13,.162,z)
                if range_top>0:
                    # Sample the exact end ring angle from the continuous trouser circumference.
                    angle=2*pi*j/24
                    radial=Vector((cos(angle),sin(angle),0))
                    origin=top_center.copy(); origin.z=.155
                    point,_,idx,_=fit.tree.ray_cast(origin,radial,.06)
                    if point is not None:
                        p.x+=(point.x-p.x)*range_top*.88
                        p.y+=(point.y-p.y)*range_top*.88
                        skin=blend(skin,fit.mix_weights(point,idx),range_top)
                stitched.append((p,skin))
            rings.append(stitched)
        mesh.rings(rings,lambda i,j: sock if style=='town' else (hem if i==4 else dye))


def make_trousers(donor, cloth, add):
    for style in ('yard','town','trail'):
        shell=donor.mapped(lambda p:trouser_shape(style,p))
        base,tier,attach=Mesh(),Mesh(),Mesh()
        palette={'yard':('靛蓝工裤','394d57','27353c'),'town':('及膝裤','74584e','57433e'),
                 'trail':('收口巡游裤','77704d','4f4a37')}
        label,main,trim=palette[style]
        dye=cloth.get('裤装 · '+label,main,'wool' if style=='town' else 'canvas',True)
        dark=cloth.get('裤装 · '+label+'腰头',trim,'canvas')
        sock=cloth.get('裤装 · 橡果色长袜','9b896c','wool')
        thread=cloth.get('裤装 · 缝线','ac906d')
        metal=cloth.get('五金 · 古铜','b1854d','brass')
        def pants_material(i):
            z=sum(shell.points[index].z for index in shell.faces[i])/3
            if style=='town' and z<.226:
                return sock
            if z>.547 or style=='town' and z<.250:
                return dark
            return dye
        base.donor(shell,pants_material)
        leggings(base,shell,style,dye,sock,dark)
        for sign in (-1,1):
            pts=[(sign*.056,.532),(sign*.073,.501),(sign*.093,.478)]
            base.tube(seam(pts,1,shell,.002),dark,.00175)
            if style=='yard':
                tier.patch(oval_outline(sign*.079,.32,.024,.033,.005),1,shell,dark,.0024)
                for z in (.293,.345):
                    tier.tube(seam([(sign*.06,z),(sign*.077,z+.001),(sign*.096,z)],1,shell,.006),thread,.0012)
            elif style=='town':
                p,w=shell.project(1,sign*.102,.246,.005)
                tier.stud(p,w,metal,.0043,.0023)
                tier.tube(seam([(sign*.058,.49),(sign*.06,.44),(sign*.078,.376),(sign*.08,.301)],1,shell,.0024),thread,.00135)
            else:
                tier.patch(oval_outline(sign*.078,.265,.028,.037,.010),1,shell,dark,.0025)
                tier.tube(seam([(sign*.056,.287),(sign*.077,.277),(sign*.102,.282)],1,shell,.006),thread,.0016)
        p,w=shell.project(1,.083,.448,.006)
        attach.stud(p,w,metal,.0075,.003,normal=(.92,.38,0),sides=8)
        add('legs',style,'base',base)
        add('legs',style,'upgrade',tier)
        add('legs',style,'attachment',attach)
