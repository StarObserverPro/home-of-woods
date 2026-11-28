"""Footwear is lofted around the existing J01 toe, heel and ankle centers."""
from math import cos, pi, sin

from mesh import Mesh, clamp, smooth


PROFILE = {
    # Height, back and front from the ankle frame, half width.
    'yard': [(0,-.068,.101,.037),(.012,-.071,.102,.039),(.020,-.069,.1,.039),(.031,-.068,.101,.037),
             (.048,-.066,.090,.035),(.059,-.063,.061,.033),(.078,-.057,.037,.031),(.108,-.049,.026,.030),(.122,-.045,.025,.032)],
    'town': [(0,-.067,.106,.033),(.009,-.069,.107,.035),(.015,-.068,.104,.034),(.027,-.066,.102,.033),
             (.040,-.063,.095,.031),(.050,-.059,.063,.029),(.065,-.050,.031,.027),(.086,-.048,.021,.027),(.093,-.045,.020,.028)],
    'trail': [(0,-.068,.103,.038),(.012,-.071,.105,.041),(.021,-.070,.103,.041),(.033,-.070,.101,.038),
              (.050,-.067,.089,.036),(.063,-.063,.055,.034),(.084,-.057,.033,.031),(.119,-.049,.029,.031),
              (.150,-.050,.037,.035),(.191,-.049,.044,.036),(.224,-.051,.050,.040),(.235,-.052,.051,.041)],
}


def shoe_point(style, sign, i, angle):
    z,back,front,width=PROFILE[style][i]
    c,s=cos(angle),sin(angle)
    toe_shape=.83 if i<5 else .92
    t=(1+(1 if c>=0 else -1)*abs(c)**toe_shape)*.5
    x=back+(front-back)*t
    narrowing=(.94+.07*c) if i<5 else 1
    y=sign*(.096+.12*x-.052*max(0,z-.077))+width*s*narrowing
    return (x,y,z)


def bind_foot(p,side):
    x,y,z=p
    calf=smooth(.066,.113,z)
    toe=smooth(.035,.094,x)*(1-calf)*.93
    return {f'foot_{side}':1-calf-toe,f'calf_{side}':calf,f'ball_{side}':toe}


def front_lace_point(style,sign,side,row,offset):
    angle=offset
    p=shoe_point(style,sign,row,angle)
    point=(p[0]+.0017,p[1],p[2])
    return point,bind_foot(point,side)


def make_shoes(cloth,add):
    mats={
        'yard':('圆头短工靴','704931','382c27','c1a079'),
        'town':('搭襻便鞋','3c2b28','211e20','9b7657'),
        'trail':('系带高靴','614b36','322b24','b29970'),
    }
    for style in PROFILE:
        label,base_color,sole_color,lace_color=mats[style]
        body=cloth.get('鞋靴 · '+label,base_color,'leather',True)
        sole=cloth.get('鞋靴 · '+label+'皮底',sole_color,'leather')
        lace=cloth.get('鞋靴 · '+label+'鞋带',lace_color,'canvas')
        welt=cloth.get('鞋靴 · 缝沿','a47955','leather')
        brass=cloth.get('五金 · 古铜','b1854d','brass')
        horn=cloth.get('五金 · 角扣','4c3529','horn')
        base,upgrade,attach=Mesh(),Mesh(),Mesh()
        for sign,side in ((-1,'r'),(1,'l')):
            levels=PROFILE[style]
            rings=[]
            for k,_ in enumerate(levels):
                pts=[shoe_point(style,sign,k,2*pi*j/32) for j in range(32)]
                rings.append([(p,bind_foot(p,side),(j/32,k/len(levels))) for j,p in enumerate(pts)])
            # Turn the ankle opening back into the shaft. The calf layer disappears inside it.
            for ratio,drop in ((.89,.0007),(.87,.009),(.84,.024)):
                z,back,front,_=levels[-1]
                cx=(front+back)*.5
                cy=sign*(.096+.12*cx-.052*max(0,z-.077))
                row=[]
                for p,w,_ in rings[len(levels)-1]:
                    q=(cx+(p[0]-cx)*ratio,cy+(p[1]-cy)*ratio,p[2]-drop)
                    row.append((q,bind_foot(q,side)))
                rings.append(row)
            base.rings(rings,lambda i,j: sole if i<2 else (welt if i==2 else body if i<len(levels)-1 else sole))
            base.face(tuple(reversed(range(len(base.points)-len(rings)*32,len(base.points)-(len(rings)-1)*32))),sole,False)
            lace_rows={'yard':range(4,8),'town':range(4,7),'trail':range(4,11)}[style]
            left=[];right=[]
            for row in lace_rows:
                left.append(front_lace_point(style,sign,side,row,.42))
                right.append(front_lace_point(style,sign,side,row,-.42))
            hardware=horn if style=='town' else brass
            for (point,w),(other,wt) in zip(left,right):
                base.stud(point,w,hardware,.0023,.0008,sides=8)
                base.stud(other,wt,hardware,.0023,.0008,sides=8)
            for i in range(len(left)-1):
                for a,b in ((left[i],right[i+1]),(right[i],left[i+1])):
                    midpoint=[(c+d)*.5 for c,d in zip(a[0],b[0])];midpoint[0]+=.006
                    base.tube([a,(midpoint,bind_foot(midpoint,side)),b],lace,.00135,5)
            upgrade.tube([(p,w) for p,w,_ in rings[2]]+[(rings[2][0][0],rings[2][0][1])],lace,.0014,6)
            # A visible toe-cap seam rather than a flat ornament on the vamp.
            toe_seam=[]
            for k,a in ((2,-.98),(3,-.85),(4,-.61),(5,-.30),(5,0),(5,.30),(4,.61),(3,.85),(2,.98)):
                p=shoe_point(style,sign,k,a)
                p=(p[0]+.002,p[1],p[2]+.001)
                toe_seam.append((p,bind_foot(p,side)))
            upgrade.tube(toe_seam,welt,.0013,6)
            p,w=front_lace_point(style,sign,side,lace_rows[-1],0)
            attach.stud((p[0]+.003,p[1],p[2]),w,brass,.0048,.0023,sides=8)
        add('feet',style,'base',base)
        add('feet',style,'upgrade',upgrade)
        add('feet',style,'attachment',attach)
