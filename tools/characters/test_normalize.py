"""Targeted Blender-only regression tests; create disposable original meshes.

blender --background --factory-startup --python-exit-code 1 \
  --python tools/characters/test_normalize.py

No downloads, private source files, installed test libraries or CI registration.
"""
import importlib.util
from pathlib import Path
import unittest

import bpy


SPEC = importlib.util.spec_from_file_location('character_normalize', Path(__file__).with_name('normalize.py'))
NORMALIZE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NORMALIZE)


def sphere(name):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def vertex_record(obj, index):
    """Inspect the actual coordinates, group names and all UV values at a vertex."""
    vertex = obj.data.vertices[index]
    weights = {obj.vertex_groups[item.group].name: item.weight for item in vertex.groups}
    uv = []
    for layer in obj.data.uv_layers:
        values = {tuple(round(component, 6) for component in layer.data[loop.index].uv)
                  for loop in obj.data.loops if loop.vertex_index == index}
        uv.append((layer.name, sorted(values)))
    return {'position': tuple(vertex.co), 'weights': weights, 'uv': uv}


class NormalizeRegression(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)

    def test_selected_instance_does_not_change_shared_mesh_neighbor(self):
        selected = sphere('Selected')
        other = selected.copy()
        other.name = 'Unselected'
        other.data = selected.data
        other.location.x = 3
        bpy.context.scene.collection.objects.link(other)
        original_triangles = NORMALIZE.triangles(other)
        original_positions = [tuple(vertex.co) for vertex in other.data.vertices]
        self.assertIs(selected.data, other.data)

        report = NORMALIZE.reduce_mesh(selected, .5)

        self.assertLess(NORMALIZE.triangles(selected), original_triangles,
                        'the selected instance must actually be reduced in this fixture')
        self.assertEqual(NORMALIZE.triangles(other), original_triangles)
        self.assertEqual([tuple(vertex.co) for vertex in other.data.vertices], original_positions)
        self.assertIsNot(selected.data, other.data)
        self.assertEqual(report['result'], 'reduced')

    def test_protected_coordinates_uvs_and_weights_survive_real_reduction(self):
        obj = sphere('ProtectedCharacter')
        # A continuous projection makes UV values easy to compare independently
        # of the normalizer's own fingerprint implementation.
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[0])
        atlas = obj.data.uv_layers.new(name='Atlas')
        for loop in obj.data.loops:
            point = obj.data.vertices[loop.vertex_index].co
            atlas.data[loop.index].uv = ((point.x + 1) / 2, (point.z + 1) / 2)
        root = obj.vertex_groups.new(name='root')
        root.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        anchors = {
            'head': max(obj.data.vertices, key=lambda vertex: vertex.co.z).index,
            'hand.l': max(obj.data.vertices, key=lambda vertex: vertex.co.x).index,
            'spine': min(obj.data.vertices, key=lambda vertex: vertex.co.z).index,
            'HOW_Preserve': min(obj.data.vertices, key=lambda vertex: vertex.co.x).index,
        }
        self.assertEqual(len(set(anchors.values())), 4)
        for name, index in anchors.items():
            group = obj.vertex_groups.new(name=name)
            weight = .3 if name == 'spine' else 1
            group.add([index], weight, 'REPLACE')
            root.add([index], 1 - weight, 'REPLACE')
        expected = {name: vertex_record(obj, index) for name, index in anchors.items()}
        original_triangles = NORMALIZE.triangles(obj)

        report = NORMALIZE.reduce_mesh(obj, .65)

        self.assertLess(NORMALIZE.triangles(obj), original_triangles,
                        'unprotected regions must change so preservation is a meaningful test')
        self.assertEqual(report['result'], 'reduced')
        for name, original in expected.items():
            matches = [vertex for vertex in obj.data.vertices
                       if all(abs(actual - prior) < 1e-6 for actual, prior in zip(vertex.co, original['position']))]
            self.assertEqual(len(matches), 1, f'{name}: protected position lost or duplicated')
            actual = vertex_record(obj, matches[0].index)
            self.assertEqual(actual['uv'], original['uv'], f'{name}: UV changed')
            self.assertEqual(actual['weights'], original['weights'], f'{name}: skin weights changed')

    def test_morph_mesh_keeps_topology_and_shape_key_data(self):
        obj = sphere('BlinkMorphCharacter')
        obj.shape_key_add(name='Basis')
        blink = obj.shape_key_add(name='blink')
        blink.value = .35
        for vertex in blink.data:
            if vertex.co.z > .5:
                vertex.co.z -= .1
        before_triangles = NORMALIZE.triangles(obj)
        before_faces = [tuple(face.vertices) for face in obj.data.polygons]
        before_keys = {key.name: [tuple(vertex.co) for vertex in key.data]
                       for key in obj.data.shape_keys.key_blocks}

        report = NORMALIZE.reduce_mesh(obj, .2)

        self.assertEqual(report['result'], 'kept-morph-topology')
        self.assertEqual(NORMALIZE.triangles(obj), before_triangles)
        self.assertEqual([tuple(face.vertices) for face in obj.data.polygons], before_faces)
        self.assertEqual({key.name: [tuple(vertex.co) for vertex in key.data]
                          for key in obj.data.shape_keys.key_blocks}, before_keys)
        self.assertAlmostEqual(obj.data.shape_keys.key_blocks['blink'].value, .35)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(NormalizeRegression))
    if not result.wasSuccessful():
        raise RuntimeError('Character normalization regression failed')
