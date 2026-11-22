"""Grounded NP120 movement adapted from the approved J01 gait."""

from math import atan2, cos, degrees, floor, pi, radians, sin, sqrt, tan, tau

import bpy
from mathutils import Matrix, Quaternion, Vector



PERIOD, FPS = 36, 31
STRIDE = .480
STANCE = .61
HEEL_FLAT_END = .31
SIDES = [('l', 1, 0.0), ('r', -1, .5)]


def smoothstep(start, end, value):
    t=max(0,min(1,(value-start)/(end-start)))
    return t*t*(3-2*t)


def boot_contacts(person):
    posed=person.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=posed.to_mesh()
    try:
        points=[posed.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        posed.to_mesh_clear()
    soles = {}
    for side, sign, _ in SIDES:
        ids = [i for i, p in enumerate(points) if p.z < .031 and sign*p.y > .040]
        flat = [i for i in ids if points[i].z < .011]
        if not flat:
            raise ValueError('靴底没有找到可触地的顶点')
        heel = min(flat, key=lambda i: points[i].x)
        toe = max(flat, key=lambda i: points[i].x)
        soles[side] = (ids, heel, toe)
    return points, soles


def swing_motion(phase):
    if phase <= .14:
        return -.16*(1-smoothstep(0,.14,phase)), 0.0, 0.0
    if phase < STANCE:
        return .50*smoothstep(HEEL_FLAT_END,STANCE,phase), 0.0, 0.0
    travel=(phase-STANCE)/(1-STANCE)
    pitch=.50-.66*smoothstep(0,.84,travel)
    lift=.042*max(sin(pi*travel),0)**1.5
    return pitch, lift, smoothstep(0,.96,travel**.85)


def foot_targets(t, rest, sole_points, soles, standing=False):
    feet={}
    for side, sign, offset in SIDES:
        step = t-offset
        phase = step-floor(step)
        pitch,lift,advance=(0,0,0) if standing else swing_motion(phase)
        turn=Quaternion((0,0,1),sign*.045) @ Quaternion((0,1,0),pitch)
        indices,heel,toe=soles[side]
        pivot=sole_points[toe if pitch>0 else heel]
        # Flatten the lowest point of the actual boot after the heel/toe roll.
        push=Vector((0 if standing else STRIDE*(STANCE/2-phase+advance),-.044*sign,lift))
        shift=pivot-turn@pivot+push
        low=min((turn@sole_points[i]+shift).z for i in indices)
        shift.z+=lift-low
        ankle=turn@rest['foot_'+side].translation+shift
        feet[side]=(ankle,turn,phase)
    return feet


def placed(rest, rotation, location):
    matrix=(rotation.to_matrix()@rest.to_3x3()).to_4x4()
    matrix.translation=location
    return matrix


def aligned(rest, old_axis, new_axis, location):
    return placed(rest, old_axis.rotation_difference(new_axis), location)


def leg_bend(hip, ankle, thigh, calf, sign):
    direction=ankle-hip
    distance=direction.length
    if not abs(thigh-calf)<distance<thigh+calf:
        raise ValueError('髋到踝的距离超出骨链可达范围')
    axis=direction.normalized()
    ahead=Vector((1,.08*sign,0))
    pole=(ahead-axis*ahead.dot(axis)).normalized()
    along=(thigh**2-calf**2+distance**2)/(2*distance)
    return hip+along*axis+sqrt(max(0,thigh**2-along**2))*pole


def chest_pitch(inherited, rest, pelvis, wanted):
    shoulder=(rest['upperarm_l'].translation+rest['upperarm_r'].translation)*.5
    shoulder=inherited@(rest['spine_02'].inverted()@shoulder)
    base=inherited.translation
    height=shoulder-base
    slope=tan(radians(wanted))
    lo,hi=-.35,.35
    for _ in range(16):
        at=(lo+hi)*.5
        projected=base+Quaternion((0,1,0),at)@height-pelvis
        if projected.x<projected.z*slope:
            lo=at
        else:
            hi=at
    return placed(inherited,Quaternion((0,1,0),(lo+hi)*.5),base)


def pose_at(t, rig, rest, sole_points, soles, standing=False):
    ankle=foot_targets(t,rest,sole_points,soles,standing)
    root_base=rest['Pelvis'].translation
    yaw=0 if standing else .075*cos(tau*t)
    lateral=0 if standing else sin(tau*t)
    turn=Quaternion((0,0,1),yaw)@Quaternion((1,0,0),-.035*lateral)
    pelvis=root_base+Vector((0 if standing else .008,.026*lateral,-.003 if standing else -.008+.014*lateral**2))
    chains=[]
    for side, sign, _ in SIDES:
        names=[bone+'_'+side for bone in ('thigh','calf','foot')]
        top,knee,foot=[rest[name].translation for name in names]
        upper,lower=knee-top,foot-knee
        hip_offset=turn@(top-root_base)
        goal=ankle[side][0]
        delta=goal-(pelvis+hip_offset)
        reach=(upper.length+lower.length-.0017)**2-delta.x**2-delta.y**2
        if reach <= 0:
            raise ValueError('步幅超出 J01 骨长')
        pelvis.z=min(pelvis.z,goal.z+sqrt(reach)-hip_offset.z)
        chains.append((side,sign,names,upper,lower,hip_offset))

    fixed={'Pelvis':placed(rest['Pelvis'],turn,pelvis)}
    for side,sign,names,upper,lower,offset in chains:
        goal,boot_turn,_=ankle[side]
        hip=pelvis+offset
        knee=leg_bend(hip,goal,upper.length,lower.length,sign)
        a,b,c=names
        fixed[a]=aligned(rest[a],upper,knee-hip,hip)
        fixed[b]=aligned(rest[b],lower,goal-knee,knee)
        fixed[c]=placed(rest[c],boot_turn,goal)

    posed={}
    for bone in rig.pose.bones:
        name=bone.name
        parent=bone.parent.name if bone.parent else None
        inherited=posed[parent] @ rest[parent].inverted() @ rest[name] if parent else rest[name]
        if name == 'spine_01':
            lean=4.9 if standing else 5.8+.35*cos(2*tau*t)
            waist=Quaternion((0,0,1),-.48*yaw)@Quaternion((0,1,0),radians(lean))
            inherited=placed(inherited,waist,inherited.translation)
        if name == 'spine_02':
            counter=Quaternion((0,0,1),-1.02*yaw)@Quaternion((1,0,0),.020*lateral)
            inherited=placed(inherited,counter,inherited.translation)
            inherited=chest_pitch(inherited,rest,pelvis,1.2 if standing else 3.6+.7*cos(2*tau*t))
        if name == 'head':
            facing=inherited.to_3x3() @ (rest[name].to_3x3().inverted() @ Vector((1,0,0)))
            nod=atan2(facing.z,sqrt(facing.x**2+facing.y**2))
            inherited=placed(inherited,Quaternion((0,1,0),nod+radians(1.6)),inherited.translation)
        if name.startswith('upperarm_'):
            side=name[-1]
            sign=1 if side=='l' else -1
            phase=ankle[side][2]
            swing=.025 if standing else -.20*cos(tau*phase)
            arm=Vector((swing,sign*(.20 if standing else .30),-.95)).normalized()
            lower_name,hand_name='lowerarm_'+side,'hand_'+side
            start=inherited.translation
            a=rest[lower_name].translation-rest[name].translation
            b=rest[hand_name].translation-rest[lower_name].translation
            elbow=start+a.length*arm
            curl=-.19 if standing else -.14-.05*(1-cos(tau*phase))
            fore=Quaternion((0,1,0),curl)@arm
            fixed[name]=aligned(rest[name],a,arm,start)
            fixed[lower_name]=aligned(rest[lower_name],b,fore,elbow)
        posed[name]=fixed.get(name,inherited)
    return posed


def key_pose(rig, bones, frame, key_bone):
    inverse=rig.matrix_world.inverted()
    matrices={name:inverse@value for name,value in bones.items()}
    for b in rig.pose.bones:
        parent={'parent_matrix':matrices[b.parent.name], 'parent_matrix_local':b.parent.bone.matrix_local} if b.parent else {}
        b.matrix_basis=b.bone.convert_local_to_pose(matrices[b.name],b.bone.matrix_local,invert=True,**parent)
        key_bone(b,frame)
