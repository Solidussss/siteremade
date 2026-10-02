# TRUE 3D -- the Blender step. Run headless by lib/three-d/blender.js, never by hand and never with a window:
#
#   blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python prepare_asset.py -- <job.json>
#
# It takes ONE model file a provider (or an owner) supplied and makes it a model a website can show:
#   import -> drop cameras and lights -> stand it upright -> centre it -> bring it to one size -> (where safe) reduce
#   geometry, bake the transforms into the mesh and scale down oversized textures -> drop unused data -> export one GLB.
# Materials and textures are kept. Parts keep their names. Animated or rigged models keep their hierarchy and motion: their
# normalisation is carried by one root node instead of being baked in.
#
# The job file is written by the server (never by a customer): { input, output, report, options }. Everything this script
# reads or writes is inside the job file's own folder -- checked here again -- and it reports as JSON, not as prose:
#   report: { ok, blender, static, applied_transforms, scale, center, triangles_before, triangles_after, decimated,
#             textures: [{ name, from, to }], parts, animations, warnings }   or   { ok: false, code, reason }
#
# A model file is DATA. Nothing in it is executed: only self-contained formats are imported (no .blend, whose drivers and
# scripts could run), auto-execution is off, and the factory start-up loads no user add-ons or start-up scripts.
import json
import math
import os
import sys
import traceback

import bpy
from mathutils import Matrix, Vector

IMPORTERS = {
    '.glb': lambda p: bpy.ops.import_scene.gltf(filepath=p),
    '.stl': lambda p: bpy.ops.wm.stl_import(filepath=p),
    '.ply': lambda p: bpy.ops.wm.ply_import(filepath=p),
}
# the model's own "up", as its source declares it, in glTF axes (glTF itself says +Y)
UP_AXES = {'Y': (0, 1, 0), 'Z': (0, 0, 1), 'X': (1, 0, 0), '-Y': (0, -1, 0), '-Z': (0, 0, -1), '-X': (-1, 0, 0)}


class JobError(Exception):
    def __init__(self, code, reason):
        super().__init__(reason)
        self.code = code
        self.reason = reason


def num(v, lo, hi, d):
    return max(lo, min(hi, float(v))) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else d


def inside(folder, p):
    return os.path.commonpath([os.path.realpath(folder), os.path.realpath(p)]) == os.path.realpath(folder)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data and len(o.data.polygons)]


def triangle_count(objs):
    n = 0
    for o in objs:
        o.data.calc_loop_triangles()
        n += len(o.data.loop_triangles)
    return n


def world_bounds(objs):
    lo = Vector((math.inf, math.inf, math.inf))
    hi = Vector((-math.inf, -math.inf, -math.inf))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def is_static():
    # motion or rigging anywhere: the hierarchy is left exactly as it is
    for o in bpy.context.scene.objects:
        if o.type == 'ARMATURE' or o.animation_data is not None:
            return False
        if o.type == 'MESH' and (o.data.shape_keys is not None or any(m.type == 'ARMATURE' for m in o.modifiers)):
            return False
    return len(bpy.data.actions) == 0


def run(job_path):
    folder = os.path.dirname(os.path.realpath(job_path))
    with open(job_path, 'r', encoding='utf-8') as f:
        job = json.load(f)
    src, dst = job.get('input', ''), job.get('output', '')
    if not (isinstance(src, str) and isinstance(dst, str) and inside(folder, src) and inside(folder, dst)):
        raise JobError('unsafe_path', 'the job points outside its own folder')
    ext = os.path.splitext(src)[1].lower()
    if ext not in IMPORTERS or not os.path.isfile(src):
        raise JobError('unsupported_format', 'this kind of model file is not accepted')
    opt = job.get('options') if isinstance(job.get('options'), dict) else {}
    target = num(opt.get('target_size'), 0.05, 100.0, 1.0)
    max_tris = int(num(opt.get('max_triangles'), 100, 5000000, 100000))
    max_tex = int(num(opt.get('max_texture'), 64, 8192, 2048))
    origin = opt.get('origin') if opt.get('origin') in ('center', 'base') else 'center'
    up = UP_AXES.get(opt.get('up_axis'), UP_AXES['Y'])
    yaw = math.radians(num(opt.get('yaw_deg'), -360.0, 360.0, 0.0))
    want_apply = opt.get('apply_transforms') is not False
    warnings = []

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    try:
        IMPORTERS[ext](src)
    except Exception as e:  # an unreadable file is an answer, not a crash
        raise JobError('malformed', 'the model file could not be read (%s)' % str(e).strip().splitlines()[-1][:160])

    scene = bpy.context.scene
    for o in [o for o in scene.objects if o.type in ('CAMERA', 'LIGHT', 'SPEAKER', 'LIGHT_PROBE')]:
        bpy.data.objects.remove(o, do_unlink=True)
    meshes = mesh_objects()
    if not meshes:
        raise JobError('empty', 'the model has nothing to draw')
    static = is_static()
    tris_before = triangle_count(meshes)

    # one root carries the whole normalisation: upright, centred, one size
    root = bpy.data.objects.new('SR_Model', None)
    scene.collection.objects.link(root)
    for o in [o for o in scene.objects if o.parent is None and o is not root]:
        o.parent = root
    # (a glTF axis as Blender sees it after import: x -> x, y -> z, z -> -y)
    up_bl = Vector((up[0], -up[2], up[1]))
    turn = up_bl.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    spin = Matrix.Rotation(yaw, 4, 'Z')
    root.matrix_world = spin @ turn
    bpy.context.view_layer.update()
    lo, hi = world_bounds(meshes)
    dim = hi - lo
    longest = max(dim.x, dim.y, dim.z)
    if not math.isfinite(longest) or longest <= 1e-9:
        raise JobError('empty', 'the model has no size')
    k = target / longest
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z if origin == 'base' else (lo.z + hi.z) / 2))
    root.matrix_world = Matrix.Scale(k, 4) @ Matrix.Translation(-centre) @ spin @ turn
    bpy.context.view_layer.update()

    # geometry, where it is safe to touch: a still model over the triangle target is reduced, part by part
    decimated = False
    if tris_before > max_tris:
        if static:
            ratio = max(0.02, max_tris / float(tris_before))
            for o in meshes:
                if o.data.users > 1:
                    o.data = o.data.copy()
                bpy.context.view_layer.objects.active = o
                m = o.modifiers.new('sr_reduce', 'DECIMATE')
                m.decimate_type = 'COLLAPSE'
                m.ratio = ratio
                m.use_collapse_triangulate = True
                bpy.ops.object.modifier_apply(modifier=m.name)
            decimated = True
        else:
            warnings.append('over the triangle target, and animated: geometry left as it is')

    # transforms baked into the mesh (a still model only): every part then sits at the model's own centre, unrotated, at
    # scale 1 -- what a website's code can turn and move without surprises
    applied = False
    if static and want_apply:
        bpy.context.view_layer.update()
        placed = [(o, o.matrix_world.copy()) for o in mesh_objects()]
        for o, w in placed:
            if o.data.users > 1:
                o.data = o.data.copy()
            o.parent = None
            o.data.transform(w)
            if w.determinant() < 0:  # (a mirrored part: its faces would otherwise turn inside out)
                o.data.flip_normals()
            o.matrix_world = Matrix.Identity(4)
            o.data.update()
        for o in [o for o in scene.objects if o.type != 'MESH']:
            bpy.data.objects.remove(o, do_unlink=True)
        applied = True

    # textures: none larger than the limit
    scaled = []
    for img in bpy.data.images:
        w, h = img.size[0], img.size[1]
        if max(w, h) > max_tex and w > 0 and h > 0:
            f = max_tex / float(max(w, h))
            nw, nh = max(1, int(round(w * f))), max(1, int(round(h * f)))
            img.scale(nw, nh)
            if img.packed_file is not None:
                img.pack()
            scaled.append({'name': img.name[:60], 'from': [w, h], 'to': [nw, nh]})

    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    meshes = mesh_objects()
    tris_after = triangle_count(meshes)

    wanted = dict(filepath=dst, export_format='GLB', export_yup=True, export_apply=False, export_animations=not static,
                  export_cameras=False, export_lights=False, export_extras=False, export_image_format='AUTO',
                  export_draco_mesh_compression_enable=False, use_selection=False)
    known = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    bpy.ops.export_scene.gltf(**{key: v for key, v in wanted.items() if key in known})
    if not os.path.isfile(dst) or os.path.getsize(dst) < 20:
        raise JobError('export_failed', 'no model was written')

    return {
        'ok': True, 'blender': bpy.app.version_string, 'static': static, 'applied_transforms': applied, 'scale': k,
        # (where the model's centre was, in its own glTF axes, before it was moved to the origin)
        'center': [centre.x, centre.z, -centre.y], 'origin': origin, 'up_axis': opt.get('up_axis') if opt.get('up_axis') in UP_AXES else 'Y',
        'triangles_before': tris_before, 'triangles_after': tris_after, 'decimated': decimated, 'textures': scaled,
        'parts': [o.name[:60] for o in meshes][:64], 'animations': [a.name[:60] for a in bpy.data.actions][:16], 'warnings': warnings,
    }


def main():
    argv = sys.argv
    if '--' not in argv or len(argv) <= argv.index('--') + 1:
        sys.exit(2)
    job_path = argv[argv.index('--') + 1]
    report_path = os.path.join(os.path.dirname(os.path.realpath(job_path)), 'report.json')
    try:
        report = run(job_path)
        code = 0
    except JobError as e:
        report = {'ok': False, 'code': e.code, 'reason': e.reason}
        code = 1
    except Exception as e:
        report = {'ok': False, 'code': 'blender_error', 'reason': str(e)[:300], 'trace': traceback.format_exc()[-1500:]}
        code = 1
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f)
    sys.exit(code)


main()
