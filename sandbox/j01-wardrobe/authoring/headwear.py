"""Headwear sized from a J01 scalp section, with independent fitted hair layers."""
from dataclasses import dataclass
from math import cos, hypot, pi, sin

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from mesh import Mesh, smooth


@dataclass(frozen=True)
class HeadLast:
    x: float
    y: float
    seat: float
    front: float
    rear: float
    side: float
    scalp: tuple

    def position(self, angle, extra=0, breadth=1, length=1, drift=(0, 0)):
        c,s=cos(angle),sin(angle)
        depth=self.front if c>=0 else self.rear
        return Vector((self.x+drift[0]+(depth+extra)*length*c,
                       self.y+drift[1]+(self.side+extra)*breadth*s,0))

    def radius(self, point):
        x,y=point.x-self.x,point.y-self.y
        return hypot(x/(self.front if x>=0 else self.rear),y/self.side)


@dataclass(frozen=True)
class Hat:
    seat_delta: float
    pitch: float
    roll: float
    profile: tuple

    def seat_at(self,last,p):
        return last.seat+self.seat_delta+self.pitch*(p.x-last.x)+self.roll*(p.y-last.y)


# Height above the band, width/depth factors, and hand-shaped offsets in the bind frame.
HATS={
    'yard':Hat(0,.047,-.012,((.000,1.00,1.00,0,0),(.010,1.023,1.005,0,0),(.025,1.034,1.025,.001,0),
        (.044,1.018,1.018,.001,0),(.057,.925,.934,.008,0),(.064,.700,.795,.015,0),
        (.070,.390,.536,.015,0),(.072,.035,.04,.016,0))),
    'town':Hat(.004,.012,.025,((.000,1.00,1.00,0,0),(.007,1.015,1.01,0,0),(.020,1.072,1.038,-.002,.005),
        (.037,1.082,1.032,-.003,.007),(.053,1.00,.954,.002,.005),(.064,.756,.817,.012,.006),
        (.071,.446,.556,.019,.008),(.073,.031,.043,.019,.008))),
    'trail':Hat(.001,.021,0,((.000,1.00,1.00,0,0),(.012,1.004,1.006,0,0),(.031,1.016,1.012,.001,0),
        (.047,1.011,1.01,.001,0),(.064,.882,.944,.006,0),(.079,.749,.822,.008,0),
        (.089,.477,.538,.011,0),(.091,.044,.043,.012,0))),
}
RIG={'head':1}
SEGMENTS=56


def head_last(face,head):
    scalp=tuple(p.copy() for p in face.points if p.z>.90)
    seat=max(p.z for p in scalp)-.061
    section=[]
    for tri in face.faces:
        a,b,c=(face.points[i] for i in tri)
        for p,q in ((a,b),(b,c),(c,a)):
            if (p.z<=seat)!=(q.z<=seat):
                section.append(p.lerp(q,(seat-p.z)/(q.z-p.z)))
    if len(section)<20:
        raise ValueError('J01 scalp section is unavailable')
    lower=min(p.y for p in section); upper=max(p.y for p in section)
    side=(upper-lower)*.5
    center=(upper+lower)*.5
    front=max(p.x for p in section)-head.x
    # The face mesh is open at the occiput. Close only the unobserved support arcs
    # using skull breadth and the head joint; hair volume never enters the last.
    rear=max(head.x-min(p.x for p in section),side*.935)
    return HeadLast(head.x,center,seat,front,rear,side,scalp)


def crown_point(last,hat,style,row,angle):
    height,width,length,x,y=row
    panels=1+.007*cos(8*angle)*smooth(.008,.040,height) if style=='yard' else 1
    p=last.position(angle,.006,width*panels,length*panels,(x,y))
    p.z=hat.seat_at(last,p)+height
    if style=='yard':
        # The sewn cap falls toward the nape. Keep the room over the high forehead.
        p.z-=.009*max(0,-cos(angle))**1.3*smooth(.015,.046,height)*smooth(.23,.74,width)
    if style=='town':
        p.z+=.004*sin(angle)*smooth(.012,.050,height)*width
    if style=='trail':
        p.z-=.006*cos(2*angle)*smooth(.063,.089,height)*width
    return p


def hat_row(last,hat,style,index):
    row=hat.profile[index]
    return [(crown_point(last,hat,style,row,2*pi*j/SEGMENTS),RIG,(j/12,row[0]*9)) for j in range(SEGMENTS)]


def inside_row(last,hat,height,allowance):
    row=[]
    for j in range(SEGMENTS):
        p=last.position(2*pi*j/SEGMENTS,allowance)
        p.z=hat.seat_at(last,p)+height
        row.append((p,RIG,(j/12,height*9)))
    return row


def make_brim(mesh,last,hat,material,style):
    count=32 if style=='yard' else SEGMENTS
    angles=[1.11-2.22*j/(count-1) for j in range(count)] if style=='yard' else [-2*pi*j/count for j in range(count)]
    rows=[]
    for reach,drop in ((0,0),(.56,0),(.94,0),(1,.0011),(1,.0028),(.93,.0036),(.54,.0036),(0,.0036)):
        row=[]
        for j,a in enumerate(angles):
            c=cos(a)
            if style=='yard':
                extension=.002+.030*max(0,cos(a/1.11*pi/2))**.8
                dip=.007*c
            else:
                extension=.026+.009*max(0,c)-.004*max(0,-c)
                dip=.004+.004*max(0,c)**2
            p=last.position(a,.003+extension*reach)
            p.z=hat.seat_at(last,p)+.004-dip*reach-drop
            row.append((p,RIG,(j/8,reach*.8)))
        rows.append(row)
    mesh.rings(rows,material,closed=style!='yard')
    return rows[2]


def crown_clearance(last,hat,rows):
    points=[p for row in rows for p,*_ in row]
    faces=[]
    for k in range(len(rows)-1):
        for j in range(SEGMENTS):
            a=k*SEGMENTS+j
            b=k*SEGMENTS+(j+1)%SEGMENTS
            faces.append((a,b,b+SEGMENTS,a+SEGMENTS))
    faces.append(tuple(range(len(points)-SEGMENTS,len(points))))
    hull=BVHTree.FromPolygons(points,faces,all_triangles=False)
    distances=[]
    untested=0
    for p in last.scalp:
        if p.z < hat.seat_at(last,p)+.002:
            continue
        center=Vector((last.x,last.y,p.z))
        radial=p-center
        depth=radial.length
        hit,_,_,distance=hull.ray_cast(center,radial.normalized(),.20)
        if hit is not None:
            distances.append((distance-depth,p))
        else:
            untested+=1
    return distances,untested


def fit_hair(obj,last,hat):
    """Keep the hairline and nape. Tuck the upper locks inside the new band."""
    world=obj.matrix_world.copy()
    local=world.inverted()
    graph=bmesh.new()
    graph.from_mesh(obj.data)
    for v in graph.verts:
        p=world@v.co
        h=p.z-hat.seat_at(last,p)
        tuck=smooth(-.026,.000,h)
        if tuck==0:
            continue
        radius=last.radius(p)
        if radius>.988:
            shift=(1-.988/radius)*tuck
            p.x+=(last.x-p.x)*shift
            p.y+=(last.y-p.y)*shift
        v.co=local@p
    plane=Vector((last.x,last.y,last.seat+hat.seat_delta+.009))
    normal=world.to_3x3().transposed()@Vector((-hat.pitch,-hat.roll,1))
    bmesh.ops.bisect_plane(graph,geom=list(graph.verts)+list(graph.edges)+list(graph.faces),
        plane_co=local@plane,plane_no=normal.normalized(),dist=.0001,clear_outer=True)
    graph.normal_update()
    graph.to_mesh(obj.data)
    graph.free()
    obj.data.update()
    obj.vertex_groups.clear()
    obj.vertex_groups.new(name='head').add(list(range(len(obj.data.vertices))),1,'REPLACE')
    coords=[world@v.co for v in obj.data.vertices]
    above=[last.radius(p) for p in coords if p.z>=hat.seat_at(last,p)+.002]
    return dict(triangles=sum(len(face.vertices)-2 for face in obj.data.polygons),
        maxRadialAtBand=max(above,default=0),maxHeightAboveBandMm=1000*max(p.z-hat.seat_at(last,p) for p in coords))


def make_hats(last,cloth,add):
    checks={}
    for style,main,edge in [('yard','6a6556','433e34'),('town','3e5051','292f33'),('trail','766652','493729')]:
        hat=HATS[style]
        base,tier,attach=Mesh(),Mesh(),Mesh()
        trim=cloth.get('帽子 · '+style+' 帽边',edge,'wool')
        dye=cloth.get('帽子 · '+style+' 帽冠',main,'wool',True)
        brass=cloth.get('五金 · 古铜','b1854d','brass')
        leather=cloth.get('皮边 · 栗棕','493629','leather')
        thread=cloth.get('帽子 · 黄麻镶边','b2a080')
        crown=[hat_row(last,hat,style,index) for index in range(len(hat.profile))]
        cuff=[inside_row(last,hat,.011,.003),inside_row(last,hat,0,.003)]
        base.rings(cuff+crown,lambda i,j: trim if i<3 else dye)
        base.face(tuple(range(len(base.points)-SEGMENTS,len(base.points))),dye)
        if style=='yard':
            make_brim(base,last,hat,trim,style)
            for j in range(0,SEGMENTS,7):
                tier.tube([(row[j][0]+Vector((0,0,.0009)),RIG) for row in crown[1:]],trim,.00085,5)
        if style in ('yard','town'):
            p,_,_=crown[-1][0]
            base.stud(p,RIG,trim,.0048,.0028 if style=='yard' else .0060,normal=(0,0,1))
        if style=='town':
            band=[(p,w) for p,w,_ in crown[1]]
            tier.tube(band+band[:1],thread,.0015,6)
        if style=='trail':
            brim=make_brim(base,last,hat,trim,style)
            wrap=[inside_row(last,hat,h,thickness) for h,thickness in ((.010,.007),(.014,.008),(.024,.008),(.026,.007))]
            base.rings(wrap,leather)
            welt=[(p+Vector((0,0,.0005)),w) for p,w,_ in brim]
            tier.tube(welt+welt[:1],thread,.0014,6)
        angle={'yard':.80,'town':1.05,'trail':.94}[style]
        p=crown_point(last,hat,style,hat.profile[2 if style=='town' else 1],angle)
        axis=Vector((cos(angle),sin(angle),.08)).normalized()
        p-=axis*.001
        attach.stud(p,RIG,brass,.009,.0026,normal=axis,sides=10)
        attach.stud(p+axis*.0025,RIG,trim,.0046,.0014,normal=axis,sides=8)
        for layer,mesh in (('base',base),('upgrade',tier),('attachment',attach)):
            add('head',style,layer,mesh)
        distances,untested=crown_clearance(last,hat,crown)
        min_distance,where=min(distances,key=lambda entry:entry[0])
        bounds=[max(p[i] for p in base.points)-min(p[i] for p in base.points) for i in range(3)]
        crown_width=max(p[1] for row in crown for p,*_ in row)-min(p[1] for row in crown for p,*_ in row)
        checks[style]=dict(wholeDimensionsMm=[round(v*1000,2) for v in bounds],crownWidthMm=round(crown_width*1000,2),
            skullSamples=len(distances),uncastSkullSamples=untested,minSkullClearanceMm=round(min_distance*1000,3),
            closestSkullPointMm=[round(v*1000,2) for v in where])
    return checks
