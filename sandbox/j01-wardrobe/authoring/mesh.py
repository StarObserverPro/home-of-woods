"""Tailoring primitives in the J01 bind frame: +X front, +Y left, +Z up (m)."""
from collections import defaultdict
from math import cos, pi, sin, sqrt

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


def clamp(x, low=0, high=1):
    return max(low, min(high, x))


def smooth(low, high, x):
    t = clamp((x - low) / (high - low))
    return t * t * (3 - 2 * t)


def weighted(*pairs):
    return {bone: value for bone, value in pairs if value > 1e-7}


def blend(a, b, t):
    return {k: (1-t)*a.get(k, 0) + t*b.get(k, 0) for k in a.keys() | b.keys()}


def srgb(value):
    value /= 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def rgba(hex_color):
    return tuple(srgb(int(hex_color[i:i+2], 16)) for i in (0, 2, 4)) + (1,)


class Surface:
    """An editable donor's positions, faces and real joint influences."""

    def __init__(self, obj=None, points=None, faces=None, weights=None, uv=None):
        if obj is not None:
            mesh = obj.data
            mesh.calc_loop_triangles()
            self.points = [obj.matrix_world @ v.co for v in mesh.vertices]
            self.faces = [tuple(t.vertices) for t in mesh.loop_triangles]
            self.indices = [t.material_index for t in mesh.loop_triangles]
            self.weights = [{obj.vertex_groups[g.group].name: g.weight for g in v.groups} for v in mesh.vertices]
            layer = mesh.uv_layers.active
            self.uv = [None]*len(mesh.vertices)
            if layer:
                for loop in mesh.loops:
                    self.uv[loop.vertex_index] = tuple(layer.uv[loop.index].vector)
        else:
            self.points, self.faces, self.weights = points, faces, weights
            self.indices = [0]*len(faces)
            self.uv = uv or [None]*len(points)
        self.tree = BVHTree.FromPolygons(self.points, self.faces, all_triangles=True)

    def mapped(self, transform):
        return Surface(points=[Vector(transform(p)) for p in self.points], faces=self.faces, weights=self.weights, uv=self.uv)

    def mix_weights(self, pt, index):
        ids = self.faces[index]
        a, b, c = (self.points[i] for i in ids)
        if (b - a).cross(c - a).length_squared < 1e-18:
            return self.weights[ids[0]]
        basis = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        coeffs = barycentric_transform(pt, a, b, c, *basis)
        result = defaultdict(float)
        for i, coef in zip(ids, coeffs):
            for joint, weight in self.weights[i].items():
                result[joint] += weight * clamp(coef)
        return result

    def at(self, pt):
        location, _, index, _ = self.tree.find_nearest(Vector(pt))
        return self.mix_weights(location, index)

    def project(self, side, lateral, height, offset=0, fallback=None):
        """Ray-fit seam, pocket or closure to the outside of a cloth panel."""
        start = Vector((side*.45, lateral, height))
        hit, normal, idx, _ = self.tree.ray_cast(start, Vector((-side, 0, 0)), .53)
        if hit is None:
            hit = Vector((side*.036 if fallback is None else fallback, lateral, height))
            return hit + Vector((side*offset, 0, 0)), self.at(hit)
        return hit + Vector((side*offset, 0, 0)), self.mix_weights(hit, idx)

    def section(self, angle, height, padding=0):
        radial = Vector((.073*cos(angle), .117*sin(angle), 0)).normalized()
        core = Vector((.006, 0, height))
        hit, _, idx, _ = self.tree.ray_cast(core, radial, .17)
        if hit is None:
            # Neck openings and pointed hems intentionally extend beyond the shirt.
            # Carry the adjacent fitted section into them to keep a smooth panel.
            inside = core.copy()
            for z in (clamp(height,.555,.762),.709,.65):
                inside.z=z
                hit, _, idx, _ = self.tree.ray_cast(inside, radial, .17)
                if hit is not None:
                    w=self.mix_weights(hit,idx)
                    hit.z=height
                    return hit+padding*radial,w
            raise RuntimeError(f'No garment section at angle {angle}, height {height}')
        return hit + padding*radial, self.mix_weights(hit, idx)


class Fabric:
    def __init__(self):
        self.materials = {}
        self.images = {}

    def image(self, kind):
        if kind in self.images:
            return self.images[kind]
        n = 64
        img = bpy.data.images.new('织纹 · ' + kind, width=n, height=n, alpha=False)
        pixels = []
        for y in range(n):
            for x in range(n):
                bias = ((x*197 + y*97 + x*y*11)%41 / 40 - .5)*.023
                if kind == 'wool':
                    weave = cos((x + 2*y* (-1 if x//16%2 else 1))*pi/8)*.040 + cos(y*pi/2)*.012
                elif kind == 'canvas':
                    weave = (cos(x*pi/3)*cos(y*pi/4) + .5*cos(y*pi/2))*.035
                else:
                    weave = cos((x - y)*pi/5)*.027 + cos(y*pi/2)*.023
                grey = .87 + weave*.76 + bias
                pixels.extend((grey, grey, grey, 1))
        img.pixels.foreach_set(pixels)
        img.pack()
        self.images[kind] = img
        return img

    def get(self, tag, hex_color, kind='solid', dye=False):
        name = ('Dye.' if dye else '') + tag
        if name in self.materials:
            return self.materials[name]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mat.diffuse_color = rgba(hex_color)
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = rgba(hex_color)
        bsdf.inputs['Roughness'].default_value = {'wax':.74, 'leather':.66, 'brass':.43, 'horn':.55}.get(kind,.91)
        bsdf.inputs['Metallic'].default_value = .38 if kind == 'brass' else 0
        if kind in ('wool', 'canvas', 'wax'):
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = self.image(kind)
            # Explicit bake in linear RGB for glTF color multiplier; no Blender-only noise.
            mix = mat.node_tree.nodes.new('ShaderNodeMixRGB')
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1
            mix.inputs[2].default_value = rgba(hex_color)
            mat.node_tree.links.new(tex.outputs['Color'], mix.inputs[1])
            mat.node_tree.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
        self.materials[name] = mat
        return mat


class Mesh:
    """Build one skinned object per variant and independently visible layer."""

    def __init__(self):
        self.points, self.faces, self.weights, self.uv = [], [], [], []
        self.materials, self.mat_ids, self.soft = [], [], []

    def vertex(self, point, weights, uv=None):
        p = Vector(point)
        self.points.append(p)
        self.weights.append(weights)
        self.uv.append(uv or ((p.y + p.x*.62)*9, p.z*9))
        return len(self.points)-1

    def face(self, indices, material, smooth_shading=True):
        if material not in self.materials:
            self.materials.append(material)
        self.faces.append(indices)
        self.mat_ids.append(self.materials.index(material))
        self.soft.append(smooth_shading)

    def donor(self, donor, material, keep=None, transform=None, uv_original=False):
        used = {}
        for i, face in enumerate(donor.faces):
            if keep and not keep([donor.points[v] for v in face]):
                continue
            for v in face:
                if v not in used:
                    p = donor.points[v]
                    used[v] = self.vertex(transform(p) if transform else p, donor.weights[v], donor.uv[v] if uv_original else None)
            self.face(tuple(used[v] for v in face), material(i) if callable(material) else material)

    def rings(self, rings, material, closed=True, caps=False):
        if len(rings)<2:
            return
        rows = [[self.vertex(p,w,uv) for p,w,*extra in row for uv in [extra[0] if extra else None]] for row in rings]
        length = len(rows[0])
        for layer, (a,b) in enumerate(zip(rows,rows[1:])):
            for j in range(length if closed else length-1):
                k = (j+1)%length
                mat = material(layer,j) if callable(material) else material
                self.face((a[j],a[k],b[k],b[j]),mat)
        if caps:
            self.face(tuple(reversed(rows[0])), material if not callable(material) else material(0,0),False)
            self.face(tuple(rows[-1]), material if not callable(material) else material(len(rows)-2,0),False)

    def tube(self, path, material, radius, sides=6):
        rows = []
        for i,(point,weights) in enumerate(path):
            p = Vector(point)
            tangent = (Vector(path[min(i+1,len(path)-1)][0])-Vector(path[max(i-1,0)][0])).normalized()
            if tangent.length_squared < 1e-12:
                continue
            side = tangent.cross(Vector((0, 0, 1)))
            if side.length_squared < .04:
                side = tangent.cross(Vector((0, 1, 0)))
            side.normalize()
            up = tangent.cross(side)
            rows.append([(p+radius*(cos(2*pi*j/sides)*side+sin(2*pi*j/sides)*up),weights) for j in range(sides)])
        self.rings(rows,material,caps=True)

    def stud(self, point, weights, material, radius, depth=None, normal=(1,0,0), sides=10):
        axis = Vector(normal).normalized()
        a = axis.cross(Vector((0,0,1)))
        if a.length_squared < .04:
            a = axis.cross(Vector((0,1,0)))
        a.normalize()
        b = axis.cross(a)
        point = Vector(point)
        depth = depth or radius*.5
        rings = []
        for distance, width in ((0,.78),(.17,1),(.69,1),(1,.68)):
            rings.append([(point+axis*depth*distance+radius*width*(a*cos(2*pi*j/sides)+b*sin(2*pi*j/sides)),weights) for j in range(sides)])
        self.rings(rings, material, caps=True)

    def ellipsoid(self, center, scale, weights, material, segments=16, levels=8):
        center = Vector(center)
        rings = []
        for i in range(levels+1):
            angle = pi*(i/levels-.5)*.989
            ring = []
            for j in range(segments):
                a = 2*pi*j/segments
                p = center + Vector((scale[0]*cos(angle)*cos(a),scale[1]*cos(angle)*sin(a),scale[2]*sin(angle)))
                ring.append((p,weights,(j/segments, i/levels)))
            rings.append(ring)
        self.rings(rings, material, caps=True)

    def patch(self, contour, side, surface, material, offset=.002):
        center_y = sum(y for y,_ in contour)/len(contour)
        center_z = sum(z for _,z in contour)/len(contour)
        rings = []
        for radial, shift in ((1,0),(.92,.001),(.48,.002),(.08,.0022)):
            rings.append([surface.project(side,center_y+(y-center_y)*radial,center_z+(z-center_z)*radial,offset+shift) for y,z in contour])
        self.rings(rings,material,caps=True)

    def object(self, name, collection, rig, **props):
        if not self.faces:
            return None
        mesh = bpy.data.meshes.new(name)
        into_rig = rig.matrix_world.inverted()
        mesh.from_pydata([into_rig @ p for p in self.points],[],self.faces)
        for mat in self.materials:
            mesh.materials.append(mat)
        layer = mesh.uv_layers.new(name='Cloth')
        for poly,index,soft in zip(mesh.polygons,self.mat_ids,self.soft):
            poly.material_index = index
            poly.use_smooth = soft
            for loop in poly.loop_indices:
                layer.uv[loop].vector = self.uv[mesh.loops[loop].vertex_index]
        mesh.update()
        obj = bpy.data.objects.new(name,mesh)
        collection.objects.link(obj)
        obj.parent = rig
        mod = obj.modifiers.new('J01 · bind', 'ARMATURE')
        mod.object = rig
        groups = {}
        valid = set(rig.data.bones.keys())
        for i,sample in enumerate(self.weights):
            active = sorted(((joint,w) for joint,w in sample.items() if joint in valid and w>1e-6),key=lambda pair:(-pair[1],pair[0]))[:4]
            if not active:
                raise RuntimeError(f'{name} 无权重顶点 {i}')
            total = sum(w for _,w in active)
            for joint,w in active:
                if joint not in groups:
                    groups[joint] = obj.vertex_groups.new(name=joint)
                groups[joint].add([i],w/total,'REPLACE')
        for key,value in props.items():
            obj[key] = value
        return obj


def oval_outline(y,z,half_width,half_height,corner=.006):
    centers = [(y+sy*(half_width-corner),z+sz*(half_height-corner)) for sy,sz in [(1,1),(-1,1),(-1,-1),(1,-1)]]
    return [(cy+corner*cos(pi*(i/2+j/8)),cz+corner*sin(pi*(i/2+j/8))) for i,(cy,cz) in enumerate(centers) for j in range(5)]


def seam(points, side, surface, height=.004):
    return [surface.project(side,y,z,height) for y,z in points]


def polar_section(x,z,depth,width,weights,side=0,n=32):
    return [(Vector((x+depth*cos(2*pi*j/n),side+width*sin(2*pi*j/n),z)),weights) for j in range(n)]
