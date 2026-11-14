"""Build original Trash Panda Heist meshes with Blender 4.5.

Model coordinates use game units (Y up, +X toward the character's nose).
Collections of meshes are exported as named sockets in a single glTF library.
"""

import math
import random
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
random.seed(61)
bpy.ops.wm.read_factory_settings(use_empty=True)
assets = bpy.data.collections.new("Midnight Snack")
bpy.context.scene.collection.children.link(assets)


def xyz(point):
    x, y, z = point
    return x, -z, y


def linear(v):
    return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4


def material(name, color, rough=.74, metal=0, emission=0):
    rgb = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Emission Color"].default_value = (*rgb, 1)
    p.inputs["Emission Strength"].default_value = emission
    return m


fur = material("Blue smoke fur", "8596aa")
silver = material("Silver guard hairs", "b5c3cc")
cream = material("Oatmeal muzzle", "f1dec0")
mask = material("Charcoal markings", "28313f")
stripe = material("Tail charcoal", "424956")
nose = material("Nose and pupil", "211c28", .31)
pink = material("Inner ear", "c1817f")
white = material("Eye enamel", "fff2d3", .38)
iris = material("Amber iris", "a55b31", .34)
glint = material("Catchlight", "ffefd7", .3, emission=.7)
scarf = material("Vermilion scarf", "d1473d")
stitch = material("Golden thread", "f3aa64")
skin = material("Warm ochre skin", "cc8a60")
skin_light = material("Skin highlights", "e6a67e")
hair = material("Espresso hair", "41292a")
shirt = material("Uniform shirt", "a94c40")
apron = material("Uniform apron", "246875")
cap = material("Uniform cap", "2a596a")
pants = material("Uniform trousers", "3c4b64")
boots = material("Boot leather", "292634", .57)
sole = material("Boot soles", "423637")
gold = material("Brushed brass", "da9b50", .43, .26)
iron = material("Painted iron", "313948", .57, .23)
edge = material("Worn iron edges", "596879", .54, .23)
rust = material("Oxidized steel", "855346")
green = material("Dumpster enamel", "377c70", .55, .18)
green_dark = material("Dumpster recesses", "214b4e")
green_light = material("Worn enamel", "629586", .59, .14)
rubber = material("Recycled rubber", "252933")
walnut = material("Slingshot walnut", "a75832")
grain = material("End grain", "df9151")
wrap = material("Indigo handle wrap", "333d60")
wood = [material("Crate plank " + str(i), c) for i, c in enumerate(
    ("a16b42", "b67d4d", "9f6239", "c48d59"))]
wood_dark = material("Crate end grain", "60412e")
card = material("Kraft paper", "c6925f")
card_edge = material("Corrugated seams", "9e6c45")
tape = material("Packing tape", "ead1a4", .63)
aluminum = material("Brushed aluminum", "a7b6c2", .4, .4)
label = material("Crimson soda label", "b52f40", .49)
glass = material("Bottle glass", "39775e", .25, .18)
glass_light = material("Bottle shoulders", "5b9b6e", .29, .12)
bag = material("Charcoal refuse sack", "464c63", .64)
bag_fold = material("Sack folds", "33384a")
stone = material("Sandstone lintels", "8d7471")
mortar = material("Recessed mortar", "433946")
brick = [material("Glazed brick " + str(i), c) for i, c in enumerate(
    ("765664", "865e66", "72525b", "8e6369", "674b5a"))]
glass_warm = material("Amber window glass", "f9ac64", .64, emission=.76)
glass_dim = material("Unlit window glass", "334459", .43)
blind = material("Window blinds", "a66e51")


def socket(name):
    global root, parts
    root = bpy.data.objects.new(name, None)
    assets.objects.link(root)
    parts = {}


def add(obj, mat, smooth=False):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    assets.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(mat)
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    parts.setdefault(mat.name, []).append(obj)
    return obj


def box(center, dims, radius, mat, roll=0):
    mesh = bpy.data.meshes.new("Beveled panel")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    scales = tuple(abs(v) for v in xyz(dims))
    for vertex in bm.verts:
        for axis, scale in enumerate(scales):
            vertex.co[axis] *= scale
    if radius:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=radius, segments=2,
                        affect="EDGES", clamp_overlap=True)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new("Beveled panel", mesh)
    o.location = xyz(center)
    o.rotation_euler.y = -roll
    return add(o, mat)


def surface(name, vertices, faces, mat, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([xyz(v) for v in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    return add(obj, mat, smooth)


def loft(rings, mat, sides=16, axis="y", folds=0, phase=0):
    """Elliptical cross sections with optional art-directed pleats."""
    verts = []
    for j, (x, y, z, a, b) in enumerate(rings):
        for i in range(sides):
            t = 2 * math.pi * i / sides
            ripple = 1 + folds * math.cos(5 * t + phase + j * .38)
            u, v = a * math.cos(t) * ripple, b * math.sin(t) * ripple
            verts.append((x + u, y, z - v) if axis == "y" else (x, y + u, z + v))
    faces = [tuple(reversed(range(sides)))]
    for j in range(len(rings) - 1):
        for i in range(sides):
            a = j * sides + i
            b = j * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(len(verts) - sides, len(verts))))
    return surface("Sculpted profile", verts, faces, mat)


def oval(center, radii, mat, roll=0, sides=16, rows=10, taper=0):
    x, y, z = center
    a, b, c = radii
    s, co = math.sin(roll), math.cos(roll)
    verts = []
    for row in range(rows + 1):
        t = math.pi * (row + .005) / (rows + .01)
        for i in range(sides):
            u = 2 * math.pi * i / sides
            px = a * math.sin(t) * math.cos(u) * (1 + taper * math.cos(t))
            py = -b * math.cos(t)
            pz = -c * math.sin(t) * math.sin(u)
            verts.append((x + px * co - py * s, y + px * s + py * co, z + pz))
    faces = [tuple(reversed(range(sides)))]
    for j in range(rows):
        for i in range(sides):
            a = j * sides + i
            b = j * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(len(verts) - sides, len(verts))))
    return surface("Contoured volume", verts, faces, mat)


def rod(a, b, ra, rb, mat, sides=10):
    p, q = Vector(xyz(a)), Vector(xyz(b))
    d = q - p
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=ra, radius2=rb,
                                   depth=d.length, location=(p + q) / 2)
    obj = bpy.context.object
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return add(obj, mat, True)


def path(points, radius, mat):
    for a, b in zip(points, points[1:]):
        rod(a, b, radius, radius, mat, 6)


def finish():
    bpy.ops.object.select_all(action="DESELECT")
    for name, objects in parts.items():
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = root.name + " · " + name
        bpy.context.object.select_set(False)


def raccoon_head():
    """A single sculpted head surface with fur markings painted on its vertices."""
    # x, center height, vertical radius, cheek width
    profile = [(-22, 18, .7, 1), (-20, 19, 9, 12), (-16, 20, 15, 20),
               (-10, 20, 19, 25), (-3, 20, 21, 27), (5, 20, 22, 27),
               (13, 19, 21, 25), (20, 17, 18, 22), (25, 15, 14, 17),
               (30, 13, 9, 12), (34, 12, 5, 7), (36, 12, .6, 1)]
    sides = 64
    verts, faces = [], []
    for j in range((len(profile) - 1) * 4 + 1):
        i = min(j // 4, len(profile) - 2)
        t = j / 4 - i
        a, b = profile[i:i+2]
        before = profile[max(0, i-1)]
        after = profile[min(len(profile)-1, i+2)]
        x, cy, h, w = (
            (2*t**3-3*t*t+1)*u + (t**3-2*t*t+t)*(v-q)*.5
            + (-2*t**3+3*t*t)*v + (t**3-t*t)*(r-u)*.5
            for q, u, v, r in zip(before, a, b, after)
        )
        for k in range(sides):
            angle = math.tau * k / sides
            dy, dz = math.cos(angle), math.sin(angle)
            cheek = math.exp(-((x + 8) / 13)**2) * abs(dz)**6
            tuft = cheek * (3.2 + 2.1 * math.cos((dy+.24)*14))
            verts.append((x - tuft, cy + dy*h, dz*(w+tuft)))
    for row in range(len(verts)//sides-1):
        for k in range(sides):
            a = row*sides+k
            b = row*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts)-sides,len(verts)))])
    obj = surface("Sculpted head and cheek silhouette", verts, faces,
                  material("Painted raccoon fur", "ffffff", .86))
    colors = obj.data.color_attributes.new(name="Fur markings", type="FLOAT_COLOR", domain="POINT")
    base, light, dark, brow = [tuple(m.diffuse_color) for m in (fur, cream, mask, silver)]

    def blend(a, b, t):
        t = max(0, min(1, t))
        t = t*t*(3-2*t)
        return tuple(u+(v-u)*t for u,v in zip(a,b))

    for i, (x,y,z) in enumerate(verts):
        cheek_line = 16.5 + 2.3*math.sin((x+9)*.16)
        c = blend(base, light, (cheek_line-y)/2.6)
        eye_center = 22.5 - .24*(x-17)
        mask_shape = ((x-16)/19)**2 + ((y-eye_center)/8.1)**2
        c = blend(c, dark, (1.12-mask_shape)*5)
        eyebrow = ((x-16)/9.4)**2 + ((y-(31+.14*(x-16)))/2.4)**2
        c = blend(c, brow, (1.04-eyebrow)*4)
        colors.data[i].color = c
    shader = obj.data.materials[0].node_tree
    vertex_color = shader.nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = colors.name
    shader.links.new(vertex_color.outputs["Color"], shader.nodes.get("Principled BSDF").inputs["Base Color"])


def raccoon():
    socket("raccoon.head")
    raccoon_head()
    oval((28, 10.7, 0), (10.7, 6.4, 11.1), cream, -.12, sides=24)
    oval((37, 12.5, 0), (4.4, 3.4, 5.9), nose, -.17, sides=24, taper=.45)
    oval((39, 14.6, 2.7), (1.45, .58, 1.27), glint)
    for side in (-1, 1):
        path([(35, 8.5, side * 7), (32, 7.4, side * 9),
              (28, 7.9, side * 10.6), (25, 9.3, side * 10.6)], .55, stripe)
        for x, y, z in ((32, 11.2, 9.4), (29.8, 12.5, 10.7), (31.7, 9.7, 10)):
            oval((x, y, z * side), (.5, .49, .5), stripe, sides=8, rows=5)
    finish()

    socket("raccoon.eyes")
    for side in (-1, 1):
        oval((1.5, 1.2, side * 21.0), (6.1, 5.9, 5.4), white)
        oval((3.7, 1.1, side * 24.7), (2.6, 4.25, 2.8), iris)
        oval((4.7, 1.2, side * 26.0), (1.9, 3, 1.6), nose)
        oval((5.3, 2.9, side * 27.15), (.82, .95, .65), glint, sides=8)
    finish()

    for name in ("earL", "earR"):
        socket("raccoon." + name)
        loft([(0, 0, 0, 7, 8), (0, 6, 0, 6, 9), (-1, 13, 0, 4, 7),
              (-3, 19, 0, 2, 3.6), (-4, 21, 0, .4, .8)], mask)
        loft([(5, 3, 0, 1.7, 6), (5.5, 8, 0, 1.8, 6),
              (3.5, 14, 0, 1, 4), (0, 18, 0, .3, 1)], pink, 12)
        finish()

    socket("raccoon.hips")
    oval((0, 2, 0), (17.5, 15, 16), fur, -.15)
    finish()
    socket("raccoon.spine")
    loft([(0, -3, 0, 13, 14), (1, 2, 0, 17, 16), (3, 10, 0, 18, 17),
          (3, 19, 0, 16, 15), (3, 25, 0, 11, 10)], fur)
    oval((13, 9, 0), (7.6, 14, 11), cream, -.13)
    finish()
    socket("raccoon.chest")
    oval((2, 8, 0), (17, 15, 16), fur, -.18)
    loft([(2, 12, 0, 14, 13), (2, 15, 0, 17, 16),
          (3, 20, 0, 17, 16), (3, 23, 0, 13, 12)], scarf, 20, folds=.045)
    oval((-13, 17, 4), (6, 4.5, 6), scarf)
    for z, roll in ((2, -1.1), (8, -.7)):
        oval((-21, 13, z), (3.2, 11, 2.6), scarf, roll)
    for z in (-11, -7, -3, 1, 5, 9, 12):
        oval((3 + math.sqrt(1 - (z / 17) ** 2) * 17, 17, z),
             (.65, .6, 1.1), stitch, sides=8, rows=5)
    finish()

    for side in "RL":
        for name, length, width, mat in (
                ("uarm", 22, 6.1, fur), ("farm", 21, 5.6, stripe),
                ("thigh", 21, 8.1, fur), ("shin", 20, 6.1, mask)):
            socket("raccoon." + name + side)
            loft([(0, -length - 2, 0, width * .45, width * .55),
                  (0, -length + 2, 0, width * .75, width * .8),
                  (0, -length * .54, 0, width, width * .88),
                  (0, -2, 0, width * .87, width * .86),
                  (0, 3, 0, width * .52, width * .48)], mat, 14)
            finish()
        for name, y, length, width in (("hand", -4, 6.5, 5.8), ("foot", 3.5, 11, 7)):
            socket("raccoon." + name + side)
            x = 2 if name == "hand" else 6
            oval((x, y, 0), (length, 5.1, width), mask, -.14)
            for z in (-3.6, 0, 3.6):
                oval((x + length * .63, y - 1, z), (3.6, 2.4, 2.2), stripe)
                oval((x + length * .9, y - .55, z), (1.4, .95, .75), silver, sides=8)
            finish()
def build_tail(rig, pivots):
    """Sweep one continuous profile and skin it along the five tail joints."""
    points = [pivots[f"tail{i}"] for i in range(5)]
    # Pull the silhouette behind the hips so the stripes read in the side camera.
    points = [point + Vector(xyz(offset)) for point, offset in zip(points,
              [(0,0,0),(-4,-3,0),(-10,-8,0),(-17,-13,0),(-24,-16,0)])]
    points.append(points[-1] + Vector(xyz((-14, 9, 0))))
    widths = [7, 11.8, 15.2, 15.6, 12.8, .55]
    bands = [fur, stripe, silver, stripe, mask]
    sides, steps = 20, 5
    vertices, faces = [], []
    for ring in range(steps * 5 + 1):
        segment = min(ring // steps, 4)
        t = ring / steps - segment
        a, b = points[segment:segment + 2]
        p0, p3 = points[max(0, segment - 1)], points[min(segment + 2, 5)]
        m0, m1 = (b - p0) * .5, (p3 - a) * .5
        center = (2*t**3 - 3*t*t + 1)*a + (t**3 - 2*t*t + t)*m0
        center += (-2*t**3 + 3*t*t)*b + (t**3 - t*t)*m1
        tangent = ((6*t*t - 6*t)*(a-b) + (3*t*t - 4*t + 1)*m0 + (3*t*t - 2*t)*m1).normalized()
        lateral = Vector((0, 1, 0))
        up = tangent.cross(lateral)
        radius = widths[segment] + (widths[segment + 1] - widths[segment]) * t*t*(3-2*t)
        for i in range(sides):
            angle = math.tau * i / sides
            v = center + radius * (lateral * math.cos(angle) + up * math.sin(angle) * .88)
            vertices.append(tuple(v))
    faces.append(tuple(reversed(range(sides))))
    for ring in range(steps * 5):
        for i in range(sides):
            a = ring * sides + i
            b = ring * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(len(vertices)-sides, len(vertices))))
    mesh = bpy.data.meshes.new("Swept striped tail")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    tail = bpy.data.objects.new("Continuous striped tail", mesh)
    assets.objects.link(tail)
    tail.parent = rig
    for mat in bands:
        mesh.materials.append(mat)
    for face in mesh.polygons:
        face.material_index = min(4, max(0, (face.index-1)//(sides*steps)))
        face.use_smooth = True
    groups = [tail.vertex_groups.new(name=f"skin_tail{i}") for i in range(5)]
    for ring in range(steps * 5 + 1):
        i = min(ring // steps, 4)
        t = ring / steps - i if i < 4 else 0
        ids = list(range(ring * sides, (ring + 1) * sides))
        groups[i].add(ids, 1-t, "REPLACE")
        if t:
            groups[i+1].add(ids, t, "REPLACE")
    modifier = tail.modifiers.new("Tail deformation", "ARMATURE")
    modifier.object = rig


def skin_raccoon():
    """Fuse body volumes, then weight the continuous surface to the game joints."""
    joint_layout = {
        "hips": (None, (0, 44, 0)), "spine": ("hips", (0, 9, 0)),
        "chest": ("spine", (1, 19, 0)),
    }
    for side, z in (("R", 15), ("L", -15)):
        joint_layout.update({
            "uarm"+side: ("chest", (2, 13, z)),
            "farm"+side: ("uarm"+side, (0, -22, 0)),
            "hand"+side: ("farm"+side, (0, -21, 0)),
            "thigh"+side: ("hips", (2, -3, z * .67)),
            "shin"+side: ("thigh"+side, (0, -21, 0)),
            "foot"+side: ("shin"+side, (0, -20, 0)),
        })
    body_joints = tuple(joint_layout)
    parent = "hips"
    for i, offset in enumerate(((-15,-2,0),(-11,7,0),(-8,10,0),(-3,11,0),(2,10,0))):
        name = f"tail{i}"
        joint_layout[name] = (parent, offset)
        parent = name
    pivots = {}
    for name, (parent, offset) in joint_layout.items():
        pivots[name] = pivots.get(parent, Vector()) + Vector(xyz(offset))

    socket("raccoon.body")
    shells = []
    for name in body_joints:
        pivot = pivots[name]
        attachment = bpy.data.objects["raccoon." + name]
        for part in list(attachment.children):
            mat = part.data.materials[0]
            if mat not in (fur, stripe, mask):
                continue
            # Keep the small knuckle accents as overlays. Fuse the main paw volume.
            if name.startswith(("hand", "foot")) and mat != mask:
                continue
            part.parent = root
            part.location += pivot
            shells.append(part)
    bpy.ops.object.select_all(action="DESELECT")
    for shell in shells:
        shell.select_set(True)
    body = shells[0]
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    body.name = "Continuous raccoon body"
    body.data.remesh_voxel_size = 1.65
    bpy.ops.object.voxel_remesh()
    smooth = body.modifiers.new("Blend shoulders and limb transitions", "SMOOTH")
    smooth.factor = .8
    smooth.iterations = 6
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate = body.modifiers.new("Mobile silhouette budget", "DECIMATE")
    decimate.ratio = .46
    bpy.ops.object.modifier_apply(modifier=decimate.name)

    # Short centerline samples keep the weights local across close-set limbs.
    endpoints = {
        "hips": (0, 5, 0), "spine": (2, 16, 0), "chest": (2, 15, 0),
        "uarm": (0, -20, 0), "farm": (0, -19, 0), "hand": (5, -5, 0),
        "thigh": (0, -18, 0), "shin": (0, -18, 0), "foot": (12, 4, 0),
    }
    segments = {}
    for name in body_joints:
        point = pivots[name]
        key = name if name in endpoints else name[:-1]
        segments[name] = (point, Vector(xyz(endpoints[key])))

    def distance(point, name):
        origin, direction = segments[name]
        t = max(0, min(1, (point - origin).dot(direction) / direction.length_squared))
        return (point - origin - t * direction).length

    armature = bpy.data.armatures.new("Raccoon deformation skeleton")
    rig = bpy.data.objects.new("Raccoon deformation skeleton", armature)
    assets.objects.link(rig)
    rig.parent = root
    body.parent = rig
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (parent, _) in joint_layout.items():
        bone = armature.edit_bones.new("skin_" + name)
        bone.head = pivots[name]
        bone.tail = bone.head + Vector((0, 0, 8))
        if parent:
            bone.parent = armature.edit_bones["skin_" + parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    groups = {name: body.vertex_groups.new(name="skin_" + name) for name in body_joints}
    body.data.materials.clear()
    coat = material("Painted raccoon coat", "ffffff", .83)
    body.data.materials.append(coat)
    coat_colors = []
    shader = coat.node_tree
    color_node = shader.nodes.new("ShaderNodeVertexColor")
    color_node.layer_name = "Coat markings"
    shader.links.new(color_node.outputs["Color"], shader.nodes.get("Principled BSDF").inputs["Base Color"])
    for vertex in body.data.vertices:
        ranked = sorted((distance(vertex.co, name), name) for name in body_joints)[:3]
        weights = [math.exp(-(d - ranked[0][0]) / 2.3) for d, _ in ranked]
        for weight, (_, name) in zip(weights, ranked):
            groups[name].add([vertex.index], weight / sum(weights), "REPLACE")
        # Blend dark paws and forearms by normalized joint influence.
        dark = sum(weight for weight, (_, name) in zip(weights, ranked)
                   if name.startswith(("hand", "foot", "shin"))) / sum(weights)
        warm = max(0, min(1, (vertex.co.x - 6) / 12)) * (1-dark)
        coat_colors.append(tuple(
            f * (1-dark-warm*.22) + d * dark + c * warm*.22
            for f, d, c in zip(fur.diffuse_color, mask.diffuse_color, cream.diffuse_color)
        ))
    colors = body.data.color_attributes.new(name="Coat markings", type="FLOAT_COLOR", domain="POINT")
    colors.data.foreach_set("color", [channel for color in coat_colors for channel in color])
    for face in body.data.polygons:
        face.use_smooth = True
    modifier = body.modifiers.new("Raccoon skin deformation", "ARMATURE")
    modifier.object = rig
    build_tail(rig, pivots)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project()
    bpy.ops.object.mode_set(mode="OBJECT")


def worker():
    socket("worker.head")
    loft([(3, 0, 0, 11, 11), (6, 4, 0, 15, 15), (5, 10, 0, 18, 18),
          (3, 22, 0, 19, 19), (2, 32, 0, 17, 17), (2, 37, 0, 11, 12)], skin, 22)
    oval((24, 15, 0), (8, 6.3, 6.8), skin_light, -.15)
    oval((21, 6.4, 0), (4.8, 2.5, 8.5), hair)
    for side in (-1, 1):
        oval((1, 15, side * 18), (5.4, 7.2, 4.6), skin)
        oval((1, 15, side * 21.2), (2.7, 4, 1.6), skin_light)
        oval((19, 22.1, side * 8.7), (4.2, 4.4, 4.4), white)
        oval((22.4, 22.2, side * 10), (2.1, 3.1, 2.7), nose)
        oval((23.7, 23.4, side * 11), (.9, 1, .7), glint, sides=8)
        oval((20, 27.6, side * 9.2), (4, 2.25, 5.4), hair, -.21)
        oval((16, 10.4, side * 13), (7.2, 3.8, 4), skin_light)
        oval((-9, 22, side * 14), (7, 10, 5), hair, -.2)
    loft([(1, 28, 0, 21, 20), (0, 33, 0, 22, 21), (-2, 41, 0, 20, 19),
          (-3, 47, 0, 15, 15), (-1, 49, 0, 8, 8)], cap, 22)
    oval((22, 29, 0), (17, 2.6, 17), cap, -.13)
    oval((17.5, 39, 0), (1.7, 4.7, 5.8), gold)
    finish()
    socket("worker.neck")
    oval((0, 1, 0), (11, 9, 11), skin)
    finish()
    socket("worker.hips")
    box((0, 0, 0), (43, 29, 48), 9, pants)
    box((0, 12, 0), (46, 7, 50), 3, boots)
    box((23, 12, 0), (4, 8, 10), 1.7, gold)
    finish()
    socket("worker.spine")
    loft([(0, -6, 0, 19, 22), (2, 3, 0, 25, 27), (5, 14, 0, 28, 31),
          (4, 29, 0, 26, 32), (3, 38, 0, 21, 26)], shirt, 20)
    box((31, 12, 0), (7, 42, 43), 3, apron)
    box((35, 8, 3), (4, 17, 28), 2, cap)
    finish()
    socket("worker.chest")
    loft([(1, -7, 0, 23, 29), (2, 10, 0, 28, 34),
          (1, 23, 0, 24, 37), (0, 30, 0, 15, 25)], shirt, 20)
    box((28, 6, 0), (5, 30, 43), 2, apron)
    for z in (-15, 15):
        rod((29, 8, z), (9, 29, z), 2.7, 3, apron)
        box((31, 14, z), (3, 4, 5), .7, gold)
    box((30, 5, 11), (3, 7, 13), 1.2, gold)
    finish()
    for side in "RL":
        for name, length, width, mat in (
                ("uarm", 31, 10, shirt), ("farm", 29, 8.3, skin),
                ("thigh", 42, 12, pants), ("shin", 42, 9.4, pants)):
            socket("worker." + name + side)
            loft([(0, -length - 2, 0, width * .67, width * .72),
                  (0, -length + 5, 0, width * .85, width * .8),
                  (1, -length * .4, 0, width, width * .92),
                  (0, 0, 0, width * .89, width * .85),
                  (0, 4, 0, width * .54, width * .54)], mat)
            if name == "uarm":
                rod((0, -30, 0), (0, -25, 0), 9.4, 10, apron, 14)
            finish()
        socket("worker.hand" + side)
        oval((2, -6, 0), (10, 10.5, 8.3), skin, -.18)
        oval((8, -7, 5), (4.5, 6, 4.2), skin_light, -.33)
        finish()
        socket("worker.foot" + side)
        box((9, 2, 0), (37, 6, 23), 2.5, sole)
        box((8, 9, 0), (36, 12, 22), 5, boots)
        box((-1, 15, 0), (16, 13, 20), 4, boots)
        for x in (9, 13, 17):
            rod((x, 15, -4), (x + 2, 15, 4), .7, .7, gold)
        finish()


def scenery():
    socket("facade")
    box((0, 400, -26), (1500, 800, 48), 6, mortar)
    courses = {mat: ([], []) for mat in brick}
    for row in range(34):
        for col in range(29):
            x = -744 + col * 53 + (row % 2) * 26.5
            left, right = max(-750, x - 25), min(750, x + 25)
            if right - left < 3:
                continue
            vertices, faces = courses[random.choice(brick)]
            low, high = .75 + row * 23, 21.25 + row * 23
            base = len(vertices)
            vertices.extend([(left, low, 1), (right, low, 1), (right, high, 1), (left, high, 1),
                             (left, low, -2), (right, low, -2), (right, high, -2), (left, high, -2)])
            for face in ((0, 1, 2, 3), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
                faces.append(tuple(base + i for i in face))
    for mat, (vertices, faces) in courses.items():
        surface("Brick courses", vertices, faces, mat, smooth=False)
    for y, w, h, d in ((10, 1508, 19, 24), (790, 1514, 15, 26),
                       (809, 1540, 23, 68), (782, 1520, 10, 38)):
        box((0, y, 0), (w, h, d), 3, stone)
    for j, y in enumerate((153, 413, 673)):
        for i, x in enumerate(range(-660, 680, 165)):
            lit = (i * 7 + j * 3) % 5 in (0, 2)
            box((x, y, 5), (87, 113, 14), 3, iron)
            box((x, y, 13), (70, 93, 3), 1.1, glass_warm if lit else glass_dim)
            for dx in (-37, 37):
                box((x + dx, y, 14), (6, 106, 10), 1.3, stone)
            box((x, y + 55, 15), (94, 12, 21), 2.2, stone)
            box((x, y - 55, 19), (94, 10, 28), 2.2, stone)
            box((x, y, 16), (72, 5, 4), .8, iron)
            box((x, y, 16), (5, 95, 4), .8, iron)
            if lit:
                for dy in (18, 26, 34, 42):
                    box((x, y + dy, 15), (68, 3, 2), .5, blind)
    rod((733, 18, 11), (733, 787, 11), 7, 7, edge)
    for y in range(60, 780, 95):
        rod((733, y, 11), (733, y + 7, 11), 8.5, 8.5, iron)
    finish()

    socket("fire-escape")
    # One section tiles across the collision floor. Its deck top is exactly y=0.
    for z in (-61, 47):
        box((0, -6, z), (100, 12, 7), 1.6, edge)
    for x in range(-45, 50, 10):
        box((x, -2, -7), (6, 4, 105), .75, iron)
    for z in (-37, -8, 22):
        box((0, -6, z), (100, 7, 5), 1.2, iron)
    for y in (51, 96):
        box((0, y, -61), (100, 5, 5), 1.2, edge)
    for x in (-46, 0, 46):
        box((x, 48, -61), (5, 97, 5), .9, iron)
    rod((0, -63, -60), (0, -8, 34), 3.5, 3.5, rust)
    box((0, -59, -62), (18, 14, 4), 1, edge)
    finish()

    socket("dumpster")
    # Straight folded panels and the dark recessed opening.
    box((0, 90, 0), (271, 137, 195), 10, green)
    box((0, 157, 0), (294, 13, 211), 4, green_light)
    box((0, 164, 0), (269, 3, 184), 1, green_dark)
    for x in (-112, -62, 62, 112):
        box((x, 85, 99), (11, 113, 10), 2.2, green_dark)
        box((x, 88, 105), (5, 102, 3), 1, green_light)
    box((0, 47, 99), (244, 9, 7), 2.2, green_light)
    box((0, 114, 100), (102, 44, 7), 3, green_dark)
    for x in (-31, -15, 1, 17, 33):
        box((x, 114, 105), (7, 21, 2.5), .7, gold, -.48)
    for x in (-113, 113):
        for z in (-78, 78):
            rod((x, 13, z - 10), (x, 13, z + 10), 13, 13, rubber, 16)
            rod((x, 13, z - 11), (x, 13, z + 11), 5.7, 5.7, edge)
    finish()
    socket("dumpster-lid")
    box((0, 0, 100), (290, 10, 199), 4, iron)
    for x in range(-120, 130, 30):
        box((x, 5, 101), (9, 5, 176), 1.5, edge)
    finish()


def props():
    socket("slingshot")
    rod((0, -25, 0), (0, 1, 0), 3.2, 3.1, walnut)
    for sign in (-1, 1):
        rod((0, -2, 0), (sign * 2, 7, sign * -2.8), 3.2, 2.7, walnut)
        rod((sign * 2, 7, sign * -2.8), (sign * 4, 18, sign * -5), 2.7, 2.3, walnut)
        oval((sign * 4, 18, sign * -5), (2.6, 2.2, 2.6), grain)
    for y in range(-22, -6, 2):
        rod((0, y, 0), (0, y + 1.8, 0), 3.9, 3.9, wrap)
    finish()
    socket("crate")
    box((0, 0, 0), (58, 58, 54), 1.2, wood_dark)
    for side in (-1, 1):
        for i, x in enumerate((-22, -11, 0, 11, 22)):
            box((x, 0, side * 27), (10.5, 57, 2), .62, wood[i % len(wood)])
            box((side * 29, 0, x * .91), (2, 57, 9.5), .62, wood[(i + 1) % len(wood)])
        for y in (-24, 24):
            box((0, y, side * 28), (60, 8, 3), .8, wood[0])
            for x in (-23, 23):
                box((x, y, side * 30), (2, 2, 1), .3, iron)
        box((0, 0, side * 28.5), (63, 6.5, 3), .85, wood[3], .67)
    finish()
    socket("carton")
    box((0, 0, 0), (59, 60, 55), 3, card)
    for z in (-27.7, 27.7):
        box((0, 0, z), (13, 59, 1.2), .5, tape)
        box((0, -24, z), (56, 1.2, 1.1), .35, card_edge)
    for y in (-29.8, 29.8):
        box((0, y, 0), (13, 1.2, 55), .5, tape)
        box((20, y, 0), (17, 1.1, 1.2), .3, card_edge)
        box((-20, y, 0), (17, 1.1, 1.2), .3, card_edge)
    finish()
    socket("ammo-can")
    loft([(0, -14, 0, 10, 10), (0, -11, 0, 12, 12),
          (0, 10, 0, 12, 12), (0, 14, 0, 10, 10)], label, 20, folds=.026)
    for y in (-13.6, 13.6):
        rod((0, y - .7, 0), (0, y + .7, 0), 10.8, 10.8, aluminum, 20)
    rod((0, 2, 0), (0, 4.5, 0), 12.35, 12.35, cream, 20)
    box((1, 14.6, 2.4), (5, 1.3, 8), .6, iron)
    finish()
    socket("ammo-bottle")
    loft([(0, -16, 0, 5, 5), (0, -14, 0, 7, 7), (0, 1, 0, 7, 7),
          (0, 4, 0, 5.8, 5.8), (0, 9, 0, 3, 3), (0, 16, 0, 2.8, 2.8)], glass, 16)
    rod((0, -9, 0), (0, -2, 0), 7.2, 7.2, glass_light, 16)
    rod((0, 15, 0), (0, 17, 0), 3.6, 3.6, gold, 12)
    finish()
    socket("ammo-bag")
    loft([(0, -19, 0, 8, 8), (0, -15, 0, 20, 17), (1, -5, 0, 24, 23),
          (-2, 9, 0, 21, 19), (0, 19, 0, 13, 12),
          (2, 25, 0, 4, 5)], bag, 22, folds=.12)
    oval((2, 25, 0), (6, 3, 5), bag_fold)
    oval((1, 29, 3), (4, 6, 3), bag, -.52)
    oval((4, 29, -4), (4, 6, 3), bag, .67)
    finish()


raccoon()
skin_raccoon()
worker()
scenery()
props()

# Export one mesh per socket with material primitives. Copies of the glTF
# sockets in Three.js can share both geometry and materials.
for asset in [obj for obj in assets.objects if obj.type == "EMPTY"]:
    if asset.name == "raccoon.body" or not asset.children:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for child in asset.children:
        child.select_set(True)
    bpy.context.view_layer.objects.active = asset.children[0]
    if len(asset.children) > 1:
        bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = asset.name + ".mesh"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.uv.cube_project()
    bpy.ops.object.mode_set(mode="OBJECT")

target = ROOT / "assets"
target.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "art" / "midnight.blend"), compress=True)
bpy.ops.export_scene.gltf(filepath=str(target / "midnight.glb"), export_format="GLB",
                          export_texcoords=False, export_vertex_color="MATERIAL", export_cameras=False, export_lights=False)
