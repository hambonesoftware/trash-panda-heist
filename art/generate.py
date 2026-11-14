"""Build original Trash Panda Heist meshes with Blender 4.5.

Model coordinates use game units (Y up, +X toward the character's nose).
Collections of meshes are exported as named sockets in a single glTF library.
"""

import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Quaternion, Vector, noise

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fur import Groom, mix, smooth, vertex_paint

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


fur = material("Pepper gray fur", "a09b90")
silver = material("Silver guard hairs", "d2c9b7")
cream = material("Pale muzzle fur", "eee0c6")
mask = material("Charcoal markings", "303034")
stripe = material("Dark guard hairs", "4b4544")
nose = material("Nose leather", "3b3032", .34)
pink = material("Inner ear", "9a655b")
white = material("Warm eye sclera", "e7d9bb", .32)
iris = material("Copper iris", "bd753b", .28)
pupil = material("Eye pupil", "130e0e", .22)
glint = material("Catchlight", "ffefd7", .3, emission=.7)
pad = material("Dark paw pads", "554144", .83)
claw = material("Horn claws", "9b876d", .56)
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
groom = Groom(material)
fur_palette = (tuple(silver.diffuse_color), tuple(mask.diffuse_color))


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


def catmull(a, b, c, d, t):
    return b + .5 * t * (c-a + t * (2*a-5*b+4*c-d + t * (3*(b-c)+d-a)))


def ring_uv(mesh, sides, rings, repeats=(1, 1)):
    uv = mesh.uv_layers.new(name="Fur direction")
    for face in mesh.polygons:
        seam = any(mesh.loops[i].vertex_index % sides == sides - 1 for i in face.loop_indices)
        for i in face.loop_indices:
            row, col = divmod(mesh.loops[i].vertex_index, sides)
            u = 1 if seam and col == 0 else col / sides
            uv.data[i].uv = (u * repeats[0], row / (rings - 1) * repeats[1])


def recalculate(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def bone_attach(obj, rig, name, position):
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = "skin_" + name
    bone = rig.data.bones[obj.parent_bone]
    # Bone parenting uses the tail and the bone's local axes.
    frame = bone.matrix_local @ Matrix.Translation((0, bone.length, 0))
    obj.matrix_parent_inverse = frame.inverted()
    obj.location += position


def game_point(p):
    return p.x, p.z, -p.y


def color_of(mat):
    return tuple(mat.diffuse_color)


def face_color(x, y, z):
    side = abs(z)
    fleck = noise.noise(Vector((x * .53, y * .68, z * .68)))
    throat = 14 + 4 * math.cos((x + 9) * .105)
    cream_muzzle = max(1 - smooth(throat - 2.4, throat + 2, y),
                      smooth(22, 34, x) * (1 - smooth(18, 22, y)))
    c = mix(color_of(fur), color_of(cream), cream_muzzle * .95)
    # Diagonal patches angle toward the muzzle and taper at the temples.
    eye_line = 24 + .26 * (x - 22)
    eye_patch = ((x - 16.8) / 19.1) ** 2 + ((y - eye_line) / 8.9) ** 2
    patch = (1 - smooth(.78, 1.16, eye_patch + .09 * fleck)) * smooth(5, 12, side)
    c = mix(c, color_of(mask), patch)
    crown = (1 - smooth(10, 27, x)) * smooth(27, 41, y)
    c = mix(c, color_of(stripe), crown * .22)
    brow = ((x - 18) / 15.0) ** 2 + ((y - (33 + .15*(x-17))) / 3.4) ** 2
    c = mix(c, color_of(silver), (1 - smooth(.56, 1.2, brow + .18 * fleck)) * .87)
    return mix(c, color_of(silver if fleck > 0 else stripe), abs(fleck) * .16)


def shape_face(obj):
    """Move the sculpt and its attached details with the same expression field."""
    basis = obj.shape_key_add(name="Basis")
    lowered = obj.shape_key_add(name="browDown")
    raised = obj.shape_key_add(name="browUp")
    muzzle = obj.shape_key_add(name="muzzleTense")
    for i, vertex in enumerate(basis.data):
        x, y, z = game_point(vertex.co)
        brow = smooth(7, 16, abs(z)) * smooth(5, 16, x) * (1 - smooth(26, 35, x))
        brow *= smooth(25, 32, y) * (1 - smooth(34, 41, y))
        cheek = smooth(17, 29, x) * (1 - smooth(16, 23, y)) * smooth(5, 13, y)
        corner = cheek * smooth(4, 12, abs(z)) * (1 - smooth(27, 38, x))
        bridge = cheek * smooth(30, 41, x)
        lowered.data[i].co = vertex.co + Vector(xyz((1.15*brow, -1.85*brow, math.copysign(.55*brow, z))))
        raised.data[i].co = vertex.co + Vector(xyz((.2*brow, 2.5*brow, 0)))
        muzzle.data[i].co = vertex.co + Vector(xyz((-.95*bridge, 1.3*bridge + 2.05*corner,
                                                    math.copysign(1.0*corner, z))))


def raccoon_head():
    """Shape the skull, orbital hollows, jaw and muzzle as one surface."""
    # Forward position, height, vertical radius and skull width.
    profile = [(-23, 19, 1, 1), (-21, 21, 10, 13), (-17, 22, 16, 20),
               (-11, 21, 20, 24), (-4, 21, 22, 25), (4, 21, 22, 25),
               (11, 20, 20, 23.9), (17, 19, 18, 21.8), (22, 18, 15, 19.5),
               (26, 16.5, 12.1, 16.1), (29.5, 14.9, 9.6, 12.6),
               (33, 13.6, 8.0, 10.4), (37, 12.9, 5.3, 7), (40, 13, 2.6, 4)]
    sides, subdivisions = 72, 4
    rings = (len(profile) - 1) * subdivisions + 1
    verts, faces = [], []
    for row in range(rings):
        i = min(row // subdivisions, len(profile) - 2)
        t = row / subdivisions - i
        a, b = profile[i:i+2]
        before = profile[max(0, i-1)]
        after = profile[min(len(profile)-1, i+2)]
        x, cy, height, width = (catmull(q, u, v, r, t) for q, u, v, r in zip(before, a, b, after))
        for k in range(sides):
            angle = math.tau * k / sides
            dy, dz = math.cos(angle), math.sin(angle)
            y = cy + dy * height
            side = abs(dz) ** 4
            orbit = math.exp(-((x - 22.6) / 7.5) ** 2 - ((y - 24.5) / 5.9) ** 2) * side
            cheekbone = math.exp(-((x - 7) / 16) ** 2 - ((y - 15) / 6.7) ** 2) * side
            whisker_pad = math.exp(-((x - 32) / 7.2) ** 2 - ((y - 11) / 4.1) ** 2) * side
            z = dz * (width - 2.1 * orbit + 3.4 * cheekbone + 2.05 * whisker_pad)
            verts.append((x - 1.8 * cheekbone, y, z))
    faces.append(tuple(reversed(range(sides))))
    for row in range(rings - 1):
        for k in range(sides):
            a = row * sides + k
            b = row * sides + (k + 1) % sides
            faces.append((a, b, b+sides, a+sides))
    faces.append(tuple(range(len(verts)-sides, len(verts))))
    mat = material("Raccoon face underfur", "ffffff", .91)
    head = surface("Sculpted skull, muzzle and eye sockets", verts, faces, mat)
    recalculate(head.data)
    ring_uv(head.data, sides, rings, (3, 1.3))
    colors = [face_color(*p) for p in verts]
    groom.undercoat(head.data, mat, colors, .44)

    def comb(p, _normal):
        x, y, z = game_point(p)
        eye = ((x - 23.5) / 8.5) ** 2 + ((y - 24.8) / 6.8) ** 2
        clear_eye = smooth(.68, 1.54, eye) if abs(z) > 11 else 1
        cheek = math.exp(-((x + 4) / 17)**2 - ((y - 14) / 9)**2) * smooth(13, 23, abs(z))
        mane = (1 - smooth(-17, 9, x)) * (1 - smooth(12, 25, y))
        short = 1 - .74 * smooth(19, 40, x)
        clear_scarf = .55 + .45 * smooth(-4, 7, y)
        flow = xyz((-1 + 1.38 * smooth(20, 35, x), -.32 - .36 * mane, math.copysign(.38, z)))
        return (flow, short * (3.6 + 6.0 * cheek + 4.0 * mane), 1.85 + 1.35 * cheek,
                clear_scarf * clear_eye * (1 - smooth(39, 44, x)), .33 + .11*cheek)

    groom.cards(head, assets, "Combed face and cheek guard hairs", 1900, colors, comb, fur_palette, seed=64)


def tapered_strands(name, paths, mat, sides=5):
    """Make low-profile curves for whiskers and eyelid seams."""
    verts, faces = [], []
    for points in paths:
        base = len(verts)
        for i, (*point, radius) in enumerate(points):
            center = Vector(point)
            tangent = (Vector(points[min(i+1, len(points)-1)][:3]) -
                       Vector(points[max(i-1, 0)][:3])).normalized()
            side = tangent.cross(Vector((0, 1, 0))).normalized()
            if side.length_squared < .01:
                side = tangent.cross(Vector((0, 0, 1))).normalized()
            up = tangent.cross(side)
            for k in range(sides):
                angle = math.tau * k / sides
                verts.append(tuple(center + radius * (side * math.cos(angle) + up * math.sin(angle))))
        for i in range(len(points)-1):
            for k in range(sides):
                a = base + i*sides+k
                b = base + i*sides+(k+1)%sides
                faces.append((a, b, b+sides, a+sides))
    return surface(name, verts, faces, mat)


def raccoon_eyes():
    """Wrap independently posed eyelids around a fixed cornea and iris."""
    socket("raccoon.eyes")
    wet_eye = material("Raccoon eye", "ffffff", .27)
    wet_eye.node_tree.nodes.get("Principled BSDF").inputs["Coat Weight"].default_value = .22
    lid = material("Raccoon eyelid skin", "ffffff", .88)
    lid.node_tree.nodes.get("Principled BSDF").inputs["Specular IOR Level"].default_value = .20
    skull = next(obj for obj in bpy.data.objects["raccoon.head"].children
                 if "Raccoon face underfur" in obj.data.materials)
    attachment = Vector((24, 20, 0))
    poses = {"blink": (.10, .09, -.65), "focus": (.57, .83, -.12),
             "alert": (1.20, 1.12, .07)}
    sides = 48
    verts, faces, colors, materials = [], [], [], []
    targets = {name: [] for name in poses}

    def point(position, color, deformed=None):
        verts.append(tuple(position))
        colors.append(color)
        for name, coords in targets.items():
            coords.append(tuple(deformed[name] if deformed else position))

    def connect(offset, rows, count, sign, kind):
        for row in range(rows - 1):
            for k in range(count):
                a = offset + row * count + k
                b = offset + row * count + (k + 1) % count
                face = (a, a + count, b + count, b)
                faces.append(face if sign > 0 else tuple(reversed(face)))
                materials.append(kind)

    for sign in (-1, 1):
        center = Vector((-.85, 4.55, sign * 16.10))
        normal = Vector((.55, .05, sign * .833)).normalized()
        across = Vector((.834, 0, sign * -.55))

        def orbital_point(u, v, depth):
            return center + across * u + Vector((0, v + .09 * u, 0)) + normal * depth

        def cornea_depth(u, v):
            return -.63 + 2.68 * math.sqrt(max(0, 1 - (u / 6.35)**2 - (v / 4.45)**2))

        def skull_depth(u, v):
            start = orbital_point(u, v, 10) + attachment
            hit, location, _, _ = skull.ray_cast(Vector(xyz(start)), Vector(xyz(-normal)), distance=25)
            return 10 - (Vector(xyz(start)) - location).length if hit else -3.0

        offset = len(verts)
        eye_rows = 23
        for j in range(eye_rows):
            r = .001 + .999 * j / (eye_rows - 1)
            for k in range(sides):
                angle = math.tau * k / sides
                u, v = r * math.cos(angle) * 6.35, r * math.sin(angle) * 4.45
                x, y = (u - .85) / 3.50, (v + .04) / 3.25
                radius = math.hypot(x, y)
                spokes = math.atan2(y, x)
                fleck = .5 + .24 * math.cos(23 * spokes) + .18 * math.sin(39 * spokes + radius * 13)
                amber = mix(color_of(stripe), color_of(iris), .28 + .62 * fleck)
                sclera = mix(color_of(stripe), color_of(white), .12)
                color = mix(amber, sclera, smooth(.87, 1.1, radius))
                color = mix(color, color_of(stripe), .43 * smooth(.78, .98, radius))
                color = mix(color_of(pupil), color, smooth(.46, .56, radius))
                point(orbital_point(u, v, cornea_depth(u, v)), color)
        connect(offset, eye_rows, sides, sign, 0)

        offset = len(verts)
        lid_fractions = (0, .07, .18, .35, .55, .75, 1)
        for t in lid_fractions:
            for k in range(sides):
                angle = math.tau * k / sides
                cu, sv = math.cos(angle), math.sin(angle)
                u = (5.02 + 2.23 * t) * cu
                outer_v = (5.45 if sv >= 0 else 4.55) * sv
                outer_depth = skull_depth(7.25 * cu, outer_v) - .12
                aperture = sv * (2.48 if sv >= 0 else 2.03) * (1 - .23 * abs(cu))
                fade = smooth(.28, 1, t)

                def lid_point(upper, lower, crease):
                    opening = aperture * (upper if sv >= 0 else lower) + crease * sv**2
                    v = opening * (1 - t) + outer_v * t
                    rolled_edge = .18 * math.sin(math.pi * min(t * 2.55, 1))
                    cornea = cornea_depth(u, v) + .15 + rolled_edge
                    depth = cornea * (1 - fade) + outer_depth * fade
                    if t < .75:
                        depth = max(depth, cornea_depth(u, v) + .09, skull_depth(u, v) + .08)
                    return orbital_point(u, v, depth)

                position = lid_point(1, 1, 0)
                skin = face_color(*(position + attachment))
                rim = mix(color_of(pupil), color_of(stripe), .31 if sv >= 0 else .56)
                color = mix(rim, skin, smooth(.03, .6, t))
                point(position, color, {name: lid_point(*values) for name, values in poses.items()})
        connect(offset, len(lid_fractions), sides, sign, 1)

        # Paint the catchlight on a tiny cornea-conforming surface so the lid can cover it.
        offset = len(verts)
        glint_sides = 16
        for radius in (.001, 1):
            for k in range(glint_sides):
                angle = math.tau * k / glint_sides
                u = 1.08 + .49 * radius * math.cos(angle)
                v = 1.17 + .41 * radius * math.sin(angle)
                point(orbital_point(u, v, cornea_depth(u, v) + .055), color_of(white))
        connect(offset, 2, glint_sides, sign, 2)

    eye = surface("Corneas and sculpted eyelids", verts, faces, wet_eye)
    eye.data.materials.append(lid)
    eye.data.materials.append(glint)
    for polygon, kind in zip(eye.data.polygons, materials):
        polygon.material_index = kind
    attr = vertex_paint(eye.data, "Eye and eyelid color", colors)
    for mat in (wet_eye, lid):
        shader = mat.node_tree
        tint = shader.nodes.new("ShaderNodeVertexColor")
        tint.layer_name = attr.name
        shader.links.new(tint.outputs["Color"], shader.nodes.get("Principled BSDF").inputs["Base Color"])
    eye.shape_key_add(name="Basis")
    for name, positions in targets.items():
        key = eye.shape_key_add(name=name)
        key.data.foreach_set("co", [value for p in positions for value in xyz(p)])
    finish()


def raccoon_ear(name, sign):
    socket("raccoon." + name)
    sides, rings = 32, 8
    verts, faces, colors = [], [], []
    for front in (True, False):
        for j in range(rings):
            r = .006 + .994 * j/(rings-1)
            for i in range(sides):
                a = math.tau * i/sides
                y = 7.8 + math.cos(a)*9.4*r
                z = math.sin(a) * (9.2 - 1.25 * math.cos(a)) * r
                fold = 5.7*r**1.45 if front else -3.8 * (1-r*r) + 5.7*r
                verts.append((fold - .20*y - .31 * sign * z, y, z + sign * (4.1 + .20*y)))
                c = color_of(fur)
                if front:
                    c = mix(color_of(stripe), color_of(pink), (1 - smooth(.43, .87, r)) * .83)
                    c = mix(c, color_of(cream), smooth(.72, .96, r) * smooth(1, 10, y))
                else:
                    c = mix(c, color_of(silver), smooth(.68, 1, r) * smooth(2, 10, y) * .65)
                colors.append(c)
    offset = sides*rings
    for front in (0, 1):
        for j in range(rings-1):
            for i in range(sides):
                a = front*offset+j*sides+i
                b = front*offset+j*sides+(i+1)%sides
                face = (a, b, b+sides, a+sides)
                faces.append(face if front else tuple(reversed(face)))
    for i in range(sides):
        a = offset-sides+i
        b = offset-sides+(i+1)%sides
        faces.append((a, a+offset, b+offset, b))
    mat = material("Raccoon ear underfur " + name, "ffffff", .88)
    ear = surface("Rounded ear with sculpted inner cup", verts, faces, mat)
    recalculate(ear.data)
    uv = ear.data.uv_layers.new(name="Fur direction")
    for loop in ear.data.loops:
        _, y, z = verts[loop.vertex_index]
        uv.data[loop.index].uv = (z / 19, y / 19)
    groom.undercoat(ear.data, mat, colors, .25)

    def profile(p, n):
        _, y, z = game_point(p)
        front, _, _ = game_point(n)
        coverage = .4 + .6 * smooth(.7, 9.0, abs(z - sign * 4))
        return (xyz((-.38, .9, sign*.25)), 2.1 + 1.5 * smooth(0, 13, y), 1.6,
                coverage * (1 - .64 * smooth(.35, 1, front)), .37)

    groom.cards(ear, assets, "Soft ear fringe", 175, colors, profile, fur_palette, seed=50+sign)
    finish()


def raccoon():
    socket("raccoon.head")
    raccoon_head()
    oval((39.5, 13.5, 0), (4.0, 3.67, 6.5), nose, -.19, sides=32, rows=16, taper=-.34)
    nostril = material("Recessed nostril", "1c1416", .55)
    whisker = material("Warm translucent whisker color", "c6b598", .57)
    for side in (-1, 1):
        oval((42.4, 13.2, side*3.25), (1.14, .84, 1.23), nostril, .19, sides=16)
        tapered_strands("Inset mouth line", [[(38.3, 10.5, side*5.1, .28),
                        (36.5, 9.4, side*7.6, .34), (32.6, 8.6, side*9.1, .37),
                        (29.1, 8.5, side*10.9, .37), (26.4, 9.6, side*13.4, .36),
                        (24, 11.4, side*14.2, .12)]], stripe)
        paths = []
        for i, (x, y, z) in enumerate(((34.3, 12.7, 10.3), (32.5, 11.1, 11.6), (30.6, 12.6, 12.55),
                                      (32.6, 13.8, 11.9), (35.6, 11.1, 9.2))):
            oval((x, y, side*z), (.43, .35, .31), stripe, sides=8, rows=5)
            drop = (i-2)*.76
            reach = 8 + (i % 3)*2.1
            paths.append([(x, y, side*z, .22), (x-2.4, y + drop*.25, side*(z+reach*.36), .16),
                          (x-7, y + drop, side*(z+reach*.75), .105),
                          (x-12.2, y + drop*1.8-.6, side*(z+reach), .018)])
        tapered_strands("Five swept muzzle whiskers", paths, whisker)
    finish()

    raccoon_eyes()
    raccoon_ear("earL", -1)
    raccoon_ear("earR", 1)

    socket("raccoon.hips")
    oval((-1, 2, 0), (15.5, 15, 15.7), fur, -.15)
    finish()
    socket("raccoon.spine")
    loft([(0, -4, 0, 13, 14), (0, 2, 0, 15.2, 15.5), (1, 10, 0, 16, 17.5),
          (2, 18, 0, 16.7, 19.2), (2, 25, 0, 13, 15)], fur, 24)
    finish()
    socket("raccoon.chest")
    loft([(0, -5, 0, 11, 13), (1, 0, 0, 15.8, 18.9), (3, 8, 0, 17.2, 21.1),
          (4, 14, 0, 16.2, 20.1), (4, 19, 0, 12.8, 15.4), (4, 24, 0, 10, 11)], fur, 24)
    loft([(2, 15, 0, 13, 15), (2.5, 17, 0, 17, 18.6), (3, 20, 0, 16.8, 18.3),
          (3, 22, 0, 16, 16.9), (4, 24, 0, 12.7, 13.7)], scarf, 32, folds=.038)
    oval((-13, 17, 4), (6, 4.5, 6), scarf)
    for z, roll in ((2, -1.1), (8, -.7)):
        oval((-21, 13, z), (3.2, 11, 2.6), scarf, roll)
    for z in (-11, -7, -3, 1, 5, 9, 12):
        oval((3 + math.sqrt(1 - (z / 17) ** 2) * 17, 17, z),
             (.65, .6, 1.1), stitch, sides=8, rows=5)
    finish()

    for side in "RL":
        for name, length, width, mat in (
                ("uarm", 22, 7.8, fur), ("farm", 21, 6.3, stripe),
                ("thigh", 21, 8.8, fur), ("shin", 20, 6.4, mask)):
            socket("raccoon." + name + side)
            loft([(0, -length - 2, 0, width * .45, width * .55),
                  (0, -length + 2, 0, width * .75, width * .8),
                  (0, -length * .56, 0, width * .96, width * .88),
                  (0, -5, 0, width, width * .90),
                  (0, 0, 0, width * .87, width * .86),
                  (0, 4, 0, width * .62, width * .59)], mat, 18)
            finish()
        paw(side, True)
        paw(side, False)


def paw(side, hand):
    socket("raccoon." + ("hand" if hand else "foot") + side)
    if hand:
        loft([(1.7, -8.2, 0, 3.9, 4.7), (1.5, -5.8, 0, 5.3, 5.7),
              (1.0, -2.2, 0, 5.5, 5.45), (.2, 2.3, 0, 4.9, 4.3)], mask, 18)
    else:
        loft([(-5, 2.8, 0, 1.8, 3.1), (0, 3.2, 0, 4.25, 5.3), (6, 2.9, 0, 3.5, 6.3),
              (11.5, 1.9, 0, 2.6, 6.6), (13.6, 1.5, 0, 1.65, 5.9)], mask, 20, "x")
    span = 2.25 if hand else 2.58
    for i in range(5):
        z = (i - 2) * span
        reach = (2.15, 3.65, 4.25, 3.5, 2.3)[i]
        if hand:
            x = 3.5 + .27 * (i - 2)
            y = -7 - .24 * (i - 2) ** 2
            oval((x, y-reach*.51, z), (1.85, reach*.83, 1.62), mask, -.22, sides=12, rows=8)
            oval((x+1.07, y-reach*.54, z), (.82, reach*.41, 1.05), pad, -.28, sides=10, rows=6)
            tapered_strands("Curved claw", [[(x+.15, y-reach*.91, z, .55),
                                             (x+.72, y-reach*1.23, z, .35),
                                             (x+1.18, y-reach*1.39, z, .02)]], claw)
        else:
            x = 11.5 + reach * .67
            oval((x, 1.65, z), (reach*.89, 1.85, 1.62), mask, -.14, sides=12, rows=8)
            tapered_strands("Curved claw", [[(x+reach*.61, 1.8, z, .53),
                                             (x+reach*.94, 1.35, z, .34),
                                             (x+reach*1.21, 1.1, z, .02)]], claw)
    finish()


def build_tail(rig, pivots):
    """Sweep one continuous profile and skin it along the five tail joints."""
    points = [pivots[f"tail{i}"] for i in range(5)]
    points.append(points[-1] + Vector(xyz((-19, 7, 4))))
    widths = [6.8, 11.5, 13.6, 14.1, 11.8, .55]
    sides, steps = 36, 14
    vertices, faces, colors = [], [], []
    for ring in range(steps * 5 + 1):
        segment = min(ring // steps, 4)
        t = ring / steps - segment
        a, b = points[segment:segment + 2]
        p0, p3 = points[max(0, segment - 1)], points[min(segment + 2, 5)]
        center = catmull(p0, a, b, p3, t)
        tangent = (catmull(p0, a, b, p3, t+.004) - catmull(p0, a, b, p3, t-.004)).normalized()
        up = tangent.cross(Vector((0, 1, 0))).normalized()
        lateral = up.cross(tangent)
        radius = catmull(widths[max(0, segment - 1)], widths[segment], widths[segment+1],
                         widths[min(segment+2, 5)], t)
        for i in range(sides):
            angle = math.tau * i / sides
            wave = 1 + .026*math.sin(angle*6 + ring*.34) + .017*math.cos(angle*9-ring*.28)
            v = center + radius * wave * (lateral * math.cos(angle) + up * math.sin(angle) * .9)
            vertices.append(tuple(v))
            u = ring / (steps * 5)
            grizzle = noise.noise(v * .47)
            ring_phase = 4.55 * u + .048*math.sin(3*angle + u*17) + grizzle*.025
            band = smooth(-.19, .19, math.cos(math.tau * (ring_phase - .58)))
            band = max(band, smooth(.88, .94, u))
            light = mix(color_of(fur), color_of(silver), .30 + grizzle*.26)
            dark = mix(color_of(mask), color_of(stripe), .47 + grizzle*.43)
            colors.append(mix(light, dark, band))
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
    recalculate(mesh)
    mat = material("Raccoon tail underfur", "ffffff", .93)
    mesh.materials.append(mat)
    ring_uv(mesh, sides, steps*5+1, (2, 2.5))
    groom.undercoat(mesh, mat, colors, .56)
    for face in mesh.polygons:
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
    groom.cards(tail, assets, "Combed tail guard hairs", 940, colors,
                lambda p, n: (xyz((-1, -.04 + .16 * smooth(-50, -91, p.x), .06)), 6.3, 3.7, .97, .42),
                fur_palette, seed=79)


def skin_raccoon():
    """Sculpt and weight in an A-pose, then return to the game's bind pose."""
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
    for i, offset in enumerate(((-15, 0, 0), (-15, 9, 1), (-18, 7, 2), (-18, 4, 3), (-15, 5, 3))):
        name = f"tail{i}"
        joint_layout[name] = (parent, offset)
        parent = name
    joint_layout.update({
        "neck": ("chest", (3, 19, 0)), "head": ("neck", (1, 5, 0)),
        "earL": ("head", (-2, 33, -14)), "earR": ("head", (-2, 33, 14)),
    })
    pivots = {}
    for name, (parent, offset) in joint_layout.items():
        pivots[name] = pivots.get(parent, Vector()) + Vector(xyz(offset))

    identity = Matrix.Identity(4)
    zero_matrix = identity * 0
    arm_joints = {name for name in body_joints if name.startswith(("uarm", "farm", "hand"))}
    sculpt_pose = {name: identity for name in body_joints}
    # With the arms hanging straight down the forearms intersect the rib cage.
    # Open them before the voxel union so skin only connects at the shoulders.
    for side, sign in (("L", 1), ("R", -1)):
        shoulder = pivots["uarm" + side]
        spread = Matrix.Rotation(math.radians(39 * sign), 4, "X")
        spread = Matrix.Translation(shoulder) @ spread @ Matrix.Translation(-shoulder)
        for name in arm_joints:
            if name.endswith(side):
                sculpt_pose[name] = spread

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
            transform = part.matrix_basis.copy()
            transform.translation += pivot
            part.parent = root
            part.matrix_basis = sculpt_pose[name] @ transform
            shells.append(part)
    bpy.ops.object.select_all(action="DESELECT")
    for shell in shells:
        shell.select_set(True)
    body = shells[0]
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    body.name = "Continuous raccoon body"
    recalculate(body.data)
    body.data.remesh_voxel_size = 1.18
    bpy.ops.object.voxel_remesh()
    smoothing = body.modifiers.new("Blend shoulders and limb transitions", "SMOOTH")
    smoothing.factor = .8
    smoothing.iterations = 6
    bpy.ops.object.modifier_apply(modifier=smoothing.name)
    decimate = body.modifiers.new("Mobile silhouette budget", "DECIMATE")
    decimate.ratio = .48
    bpy.ops.object.modifier_apply(modifier=decimate.name)

    # Short centerline samples keep the weights local across close-set limbs.
    endpoints = {
        "hips": (0, 5, 0), "spine": (2, 16, 0), "chest": (2, 15, 0),
        "uarm": (0, -20, 0), "farm": (0, -19, 0), "hand": (5, -5, 0),
        "thigh": (0, -18, 0), "shin": (0, -18, 0), "foot": (12, 4, 0),
    }
    segments = {}
    for name in body_joints:
        key = name if name in endpoints else name[:-1]
        transform = sculpt_pose[name]
        direction = transform.to_3x3() @ Vector(xyz(endpoints[key]))
        segments[name] = (transform @ pivots[name], direction)

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
    def skin_penalty(point, name):
        lateral = -point.y
        if name in ("hips", "spine", "chest"):
            return 15 * smooth(16, 25, abs(lateral)) * (1 - smooth(67, 83, point.z))
        across = max(0, -lateral if name.endswith("R") else lateral)
        if name in arm_joints:
            return across*2.8 + 18*(1-smooth(14, 22, abs(lateral))) * (1 - smooth(65, 82, point.z))
        return across*2.8 + 14*smooth(45, 57, point.z)

    groups = {name: body.vertex_groups.new(name="skin_" + name) for name in body_joints}
    body.data.materials.clear()
    coat = material("Painted raccoon coat", "ffffff", .83)
    body.data.materials.append(coat)
    coat_colors = []
    for vertex in body.data.vertices:
        point = vertex.co.copy()
        scores = sorted((distance(point, name) + skin_penalty(point, name), name) for name in body_joints)[:3]
        weights = {name: math.exp(-(d - scores[0][0]) / 1.58) for d, name in scores}
        # The fingertips and claws move rigidly together. Blend from there back
        # through the wrist instead of letting torso weights pull at the pads.
        hand = "handR" if point.y < 0 else "handL"
        hand_origin, hand_axis = segments[hand]
        along_hand = (point - hand_origin).dot(hand_axis.normalized())
        hand_mask = smooth(26, 33, abs(point.y)) * smooth(-1, 7, along_hand)
        if hand_mask > 0:
            total = sum(weights.values())
            weights = {name: weight / total * (1 - hand_mask) for name, weight in weights.items()}
            weights[hand] = weights.get(hand, 0) + hand_mask
        total = sum(weights.values())
        weights = {name: weight / total for name, weight in weights.items() if weight > 0}
        pose = sum((sculpt_pose[name] * weight for name, weight in weights.items()), zero_matrix)
        vertex.co = pose.inverted() @ point
        for name, weight in weights.items():
            groups[name].add([vertex.index], weight, "REPLACE")
        x, y, z = game_point(point)
        grizzle = noise.noise(point * .41)
        dark = sum(weight for name, weight in weights.items() if name.startswith(("hand", "foot", "shin")))
        forearm = sum(weight for name, weight in weights.items() if name.startswith("farm"))
        belly_width = 11 - .09 * abs(y-70)
        chest = smooth(8, 17, x) * (1 - smooth(belly_width-3, belly_width+4, abs(z)))
        chest *= smooth(49, 69, y)
        c = mix(color_of(fur), color_of(cream), chest*.66)
        c = mix(c, color_of(stripe), dark*.75 + forearm*.35)
        coat_colors.append(mix(c, color_of(silver if grizzle > 0 else mask), abs(grizzle)*.24))
    uv = body.data.uv_layers.new(name="Coat direction")
    for loop in body.data.loops:
        x, y, z = game_point(body.data.vertices[loop.vertex_index].co)
        uv.data[loop.index].uv = (math.atan2(z, x) / math.tau * 3 + 2, y / 36)
    groom.undercoat(body.data, coat, coat_colors, .37)
    for face in body.data.polygons:
        face.use_smooth = True
    modifier = body.modifiers.new("Raccoon skin deformation", "ARMATURE")
    modifier.object = rig

    def comb(p, _normal):
        x, y, z = game_point(p)
        neck = smooth(68, 87, y) * (1 - smooth(5, 15, x))
        long = smooth(36, 62, y)
        under_scarf = smooth(82, 88, y)
        return (xyz((-.34 - .52*neck, -1, math.copysign(.14, z))),
                2.2 + 2.3*long + 1.75*neck, 1.85 + .95*long,
                (.38 + .58*long) * (1 - .7*under_scarf), .35 + .13*neck)

    groom.cards(body, assets, "Combed shoulder, chest and body guard hairs", 1150, coat_colors, comb, fur_palette, seed=98)
    build_tail(rig, pivots)
    return rig, pivots


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


def review_scene(rig, pivots):
    """Assemble the same skin and attachments in a lit, editable Blender scene."""
    review = bpy.data.scenes.new("Raccoon · studio")
    review.world = bpy.data.worlds.new("Charcoal studio")
    review.world.use_nodes = True
    ambient = review.world.node_tree.nodes.get("Background")
    ambient.inputs["Color"].default_value = (.18, .22, .28, 1)
    ambient.inputs["Strength"].default_value = .36
    review.render.engine = "CYCLES"
    review.cycles.samples = 36
    review.cycles.use_denoising = True
    review.render.resolution_x = 1050
    review.render.resolution_y = 920
    review.view_settings.view_transform = "AgX"
    model = bpy.data.collections.new("Raccoon rig and groom")
    review.collection.children.link(model)

    # The game uses centimeters for layout. Use a human-scale studio for light falloff.
    display = bpy.data.objects.new("Raccoon · display scale", None)
    model.objects.link(display)
    display.scale = (.01, .01, .01)
    posed = rig.copy()
    posed.data = rig.data.copy()
    model.objects.link(posed)
    posed.parent = display
    posed.show_in_front = True
    posed.data.display_type = "STICK"

    for source in rig.children:
        if source.get("raccoonGroom"):
            continue
        obj = source.copy()
        model.objects.link(obj)
        obj.parent = posed
        for modifier in obj.modifiers:
            if modifier.type == "ARMATURE":
                modifier.object = posed
    source_joints = {name: (name, (0, 0, 0)) for name in pivots}
    source_joints["eyes"] = ("head", (24, 20, 0))
    for name, (joint, offset) in source_joints.items():
        attachment = bpy.data.objects.get("raccoon." + name)
        if not attachment:
            continue
        for source in attachment.children:
            if source.get("raccoonGroom"):
                continue
            obj = source.copy()
            model.objects.link(obj)
            bone_attach(obj, posed, joint, pivots[joint] + Vector(xyz(offset)))

    def pose(name, angle, axis):
        bone = posed.pose.bones["skin_" + name]
        local_axis = bone.bone.matrix_local.to_3x3().inverted() @ Vector(xyz(axis))
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion(local_axis, math.radians(angle))

    pose("spine", -5, (0, 0, 1))
    pose("chest", -3, (0, 0, 1))
    pose("head", -9, (0, 1, 0))
    pose("earL", -11, (1, 0, 0))
    pose("earR", 13, (1, 0, 0))
    pose("uarmL", 19, (1, 0, 0))
    pose("uarmR", -21, (1, 0, 0))
    pose("farmL", 38, (0, 0, 1))
    pose("farmR", 15, (0, 0, 1))
    for side, bend in (("L", 23), ("R", 29)):
        pose("thigh" + side, bend, (0, 0, 1))
        pose("shin" + side, -2*bend, (0, 0, 1))
        pose("foot" + side, bend, (0, 0, 1))
    posed.pose.bones["skin_hips"].location.y = -4
    pose("tail0", -13, (0, 0, 1))
    pose("tail1", 11, (0, 0, 1))
    pose("tail2", 14, (0, 0, 1))
    pose("tail3", 10, (0, 0, 1))
    bpy.context.window.scene = review
    bpy.context.view_layer.update()
    for source in groom.sources:
        surface = source.surface
        if surface.parent == rig:
            matrices = {}
            for group in surface.vertex_groups:
                bone = posed.pose.bones[group.name]
                matrices[group.index] = bone.matrix @ bone.bone.matrix_local.inverted()
            obj = groom.studio_strands(source, posed, model, matrices)
            obj["Studio pose"] = "Strands are evaluated in the displayed pose. The export scene keeps the game groom skinned."
        else:
            joint = surface.parent.name.removeprefix("raccoon.")
            obj = groom.studio_strands(source, posed, model)
            bone_attach(obj, posed, joint, pivots[joint])

    studio = bpy.data.collections.new("Studio lighting")
    review.collection.children.link(studio)
    ground = bpy.data.meshes.new("Studio floor")
    ground.from_pydata([(-200,-200,0), (200,-200,0), (200,200,0), (-200,200,0)], [], [(0,1,2,3)])
    ground.materials.append(material("Studio charcoal", "373440", .92))
    studio.objects.link(bpy.data.objects.new("Studio floor", ground))

    def aim(obj, location, target):
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

    camera = bpy.data.objects.new("Character three-quarter camera", bpy.data.cameras.new("Character camera"))
    studio.objects.link(camera)
    aim(camera, (4.75, -5.65, 2.3), (-.21, 0, .82))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.26
    camera.data.clip_end = 250
    review.camera = camera

    def area(name, location, energy, size, color):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size, light.color = energy, size, color
        obj = bpy.data.objects.new(name, light)
        studio.objects.link(obj)
        aim(obj, location, (0, 0, 1))

    area("Warm softbox", (2.8, -3.9, 4.3), 470, 3, (1, .83, .66))
    area("Cool fill", (-2.9, -1.5, 2.9), 230, 3.1, (.63, .78, 1))
    area("Warm rim", (-.25, 3.5, 3.3), 540, 2.2, (1, .76, .47))
    area("Eye light", (4, -1, 2.2), 64, 1.5, (.94, .95, 1))
    return review


raccoon()
raccoon_rig, raccoon_pivots = skin_raccoon()
worker()
scenery()
props()

# Export one mesh per socket with material primitives. Copies of the glTF
# sockets in Three.js can share both geometry and materials.
for asset in [obj for obj in assets.objects if obj.type == "EMPTY"]:
    if asset.name == "raccoon.body" or not asset.children:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    solid = [child for child in asset.children if not child.get("raccoonGroom")]
    for child in solid:
        child.select_set(True)
    primary = next((child for child in solid if child.data.uv_layers), solid[0])
    bpy.context.view_layer.objects.active = primary
    has_fur_uv = any(child.data.uv_layers for child in solid)
    if len(solid) > 1:
        bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = asset.name + ".mesh"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    if not has_fur_uv:
        bpy.ops.uv.cube_project()
    bpy.ops.object.mode_set(mode="OBJECT")
    if asset.name == "raccoon.head":
        shape_face(mesh)
        for child in asset.children:
            if child.get("raccoonGroom"):
                shape_face(child)

target = ROOT / "assets"
target.mkdir(exist_ok=True)
# Keep editable UVs in Blender and omit unused streams from the browser export.
if "--glb-only" not in sys.argv:
    game = bpy.context.scene
    game.name = "Midnight Snack · export"
    review = review_scene(raccoon_rig, raccoon_pivots)
    bpy.context.window.scene = review
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.overlay.show_overlays = False
                area.spaces.active.shading.color_type = "VERTEX"
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "art" / "midnight.blend"), compress=True)
    bpy.context.window.scene = game
for mesh in bpy.data.meshes:
    if not any(mat and any(node.type == "TEX_IMAGE" for node in mat.node_tree.nodes)
               for mat in mesh.materials if mat and mat.use_nodes):
        for layer in list(mesh.uv_layers):
            mesh.uv_layers.remove(layer)
bpy.ops.export_scene.gltf(filepath=str(target / "midnight.glb"), export_format="GLB",
                          export_texcoords=True, export_vertex_color="MATERIAL", export_extras=True,
                          export_cameras=False, export_lights=False, use_active_scene=True)
