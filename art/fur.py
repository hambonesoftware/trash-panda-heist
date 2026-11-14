"""Build a directional groom as UV-mapped strips with a shared strand atlas."""

import math
import random
from bisect import bisect_left
from typing import NamedTuple

import bpy
from mathutils import Vector, noise


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def smooth(a, b, value):
    t = max(0.0, min(1.0, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def vertex_paint(mesh, name, colors):
    attribute = mesh.color_attributes.new(name=name, type="BYTE_COLOR", domain="POINT")
    attribute.data.foreach_set("color", [channel for color in colors for channel in color])
    return attribute


def texture(name, width, height, pixels, data=False):
    image = bpy.data.images.new(name, width, height, alpha=True)
    if data:
        image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels)
    image.pack()
    return image


def strand_atlas():
    """Eight silhouettes with offset roots, taper and individual guard hairs."""
    rng = random.Random(52)
    cell_width, height, cells = 64, 128, 8
    variants = []
    for _ in range(cells):
        variants.append([
            (rng.uniform(-.43, .43), rng.uniform(-.15, .15), rng.uniform(.59, .99),
             rng.uniform(.008, .026), rng.uniform(.65, 1))
            for _ in range(26)
        ])
    pixels = []
    for y in range(height):
        t = (y + .5) / height
        for hairs in variants:
            for x in range(cell_width):
                u = (x + .5) / cell_width - .5
                alpha, color = 0.0, 0.0
                for start, bend, length, width, value in hairs:
                    if t >= length:
                        continue
                    along = t / length
                    center = start * (1 - .44 * along) + bend * along ** 1.8
                    radius = width * (1 - .72 * along) + .007
                    weight = 1 - smooth(.65, 1.22, abs(u - center) / radius)
                    weight *= 1 - smooth(.88, 1, along)
                    alpha = max(alpha, weight)
                    color = max(color, weight * value)
                alpha *= smooth(.11, .38, t)
                shade = .91 + .09 * color
                pixels.extend((shade, shade, shade, alpha))
    return texture("Raccoon guard hairs · eight clump profiles", cells * cell_width, height, pixels)


def height_texture():
    """A tileable tangent-space map for the dense, short undercoat."""
    size = 128
    tau = math.tau

    def height(u, v):
        a = math.sin(tau * (u * 37 + v * 2 + .23 * math.sin(tau * v * 3)))
        b = math.sin(tau * (u * 23 - v * 5 + .31 * math.cos(tau * v * 2)))
        c = math.sin(tau * (u * 12 + v * 4 + .38 * math.sin(tau * u * 2)))
        return .0030 * a + .0021 * b + .0014 * c

    pixels = []
    delta = .5 / size
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            du = (height(u + delta, v) - height(u - delta, v)) / (2 * delta)
            dv = (height(u, v + delta) - height(u, v - delta)) / (2 * delta)
            n = Vector((-du, -dv, 2.8)).normalized()
            pixels.extend((.5 + n.x * .5, .5 + n.y * .5, .5 + n.z * .5, 1))
    return texture("Raccoon directional underfur normal", size, size, pixels, data=True)


class Groom:
    def __init__(self, material):
        self.make_material = material
        self.sources = []
        self.atlas = strand_atlas()
        self.normal = height_texture()
        self.material = material("Raccoon guard hair", "ffffff", .91)
        self.color_name = "Guard hair colors"
        self.material.use_backface_culling = False
        nodes = self.material.node_tree.nodes
        links = self.material.node_tree.links
        shader = nodes.get("Principled BSDF")
        shader.inputs["Specular IOR Level"].default_value = .24
        strands = nodes.new("ShaderNodeTexImage")
        strands.image = self.atlas
        pigment = nodes.new("ShaderNodeVertexColor")
        pigment.layer_name = self.color_name
        tint = nodes.new("ShaderNodeMix")
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1
        links.new(strands.outputs["Color"], tint.inputs[6])
        links.new(pigment.outputs["Color"], tint.inputs[7])
        links.new(tint.outputs["Result"], shader.inputs["Base Color"])
        cutoff = nodes.new("ShaderNodeMath")
        cutoff.operation = "GREATER_THAN"
        cutoff.inputs[1].default_value = .38
        links.new(strands.outputs["Alpha"], cutoff.inputs[0])
        links.new(cutoff.outputs[0], shader.inputs["Alpha"])

    def undercoat(self, mesh, material, colors, strength=.42):
        attribute = vertex_paint(mesh, "Underfur color", colors)
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        shader = nodes.get("Principled BSDF")
        shader.inputs["Specular IOR Level"].default_value = .22
        tint = nodes.new("ShaderNodeVertexColor")
        tint.layer_name = attribute.name
        links.new(tint.outputs["Color"], shader.inputs["Base Color"])
        image = nodes.new("ShaderNodeTexImage")
        image.image = self.normal
        bump = nodes.new("ShaderNodeNormalMap")
        bump.inputs["Strength"].default_value = strength
        links.new(image.outputs["Color"], bump.inputs["Color"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
        return attribute

    def sample_tufts(self, source, count, seed):
        """Use the same guide field for the Blender strands and browser cards."""
        mesh = source.mesh
        mesh.calc_loop_triangles()
        triangles, areas, total = [], [], 0
        for triangle in mesh.loop_triangles:
            if triangle.area > .002:
                total += triangle.area
                triangles.append(triangle)
                areas.append(total)
        rng = random.Random(seed)
        pale, dark = source.palette
        for _ in range(count):
            tri = triangles[bisect_left(areas, rng.random() * total)]
            a, b = rng.random(), rng.random()
            if a + b > 1:
                a, b = 1 - a, 1 - b
            weights = (1 - a - b, a, b)
            corners = [mesh.vertices[i] for i in tri.vertices]
            p = sum((v.co * w for v, w in zip(corners, weights)), Vector())
            normal = sum((v.normal * w for v, w in zip(corners, weights)), Vector()).normalized()
            direction, length, span, coverage, rise = source.profile(p, normal)
            if rng.random() >= coverage:
                continue
            length *= rng.uniform(.72, 1.23)
            span *= rng.uniform(.62, 1.15)
            direction = Vector(direction)
            direction -= normal * direction.dot(normal)
            if direction.length_squared < .0001:
                continue
            direction.normalize()
            tangent = normal.cross(direction).normalized()
            tilt = .15 * noise.noise(p * .24) + rng.uniform(-.14, .14)
            color = tuple(sum(source.colors[v.index][i] * w for v, w in zip(corners, weights)) for i in range(4))
            tone = noise.noise(p * .21) * .052 + rng.uniform(-.035, .067)
            color = mix(color, pale if tone > 0 else dark, abs(tone))
            influences = {}
            for v, w in zip(corners, weights):
                for g in v.groups:
                    influences[g.group] = influences.get(g.group, 0) + g.weight * w
            top = sorted(influences, key=influences.get, reverse=True)[:4]
            top = [index for index in top if influences[index] > .0001]
            total_weight = sum(influences[index] for index in top)
            skin = {index: influences[index] / total_weight for index in top}
            yield Tuft(p, normal, direction, tangent, tilt, length, span, rise, color, skin, rng.randrange(8))

    def cards(self, surface, collection, name, count, colors, profile, palette, *, seed):
        """Build cutout strips that carry their roots' skin weights."""
        verts, uvs, faces, tints, skin, normals = [], [], [], [], [], []
        skinned = bool(surface.vertex_groups)
        # The export consolidates the skull and its details after grooming.
        guide = surface.data if skinned else surface.data.copy()
        source = GroomSource(surface, guide, name, count, colors, profile, palette, seed)
        for tuft in self.sample_tufts(source, count, seed):
            skin.append(tuft.weights)
            first = len(verts)
            sideways = (tuft.tangent + tuft.normal * tuft.tilt).normalized()
            for t, spread in ((0, .78), (.44, 1), (1, .71)):
                center = tuft.center(t, -.09, 1)
                tint = mix(tuft.color, palette[0], .033 * t)
                for s in (-1, 1):
                    verts.append(tuple(center + sideways * tuft.width * .5 * s * spread))
                    uvs.append(((tuft.variant + (.025 if s < 0 else .975)) / 8, .004 + .992 * t))
                    tints.append(tint)
                    normals.append(tuple((tuft.normal + .25 * tuft.direction * t + .12 * tuft.tangent * s).normalized()))
            faces.extend(((first, first + 2, first + 3, first + 1),
                          (first + 2, first + 4, first + 5, first + 3)))

        data = bpy.data.meshes.new(name)
        data.from_pydata(verts, [], faces)
        data.materials.append(self.material)
        data.update()
        uv = data.uv_layers.new(name="Strand atlas")
        uv.data.foreach_set("uv", [value for loop in data.loops for value in uvs[loop.vertex_index]])
        vertex_paint(data, self.color_name, tints)
        for face in data.polygons:
            face.use_smooth = True
        data.normals_split_custom_set_from_vertices(normals)
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.parent = surface.parent
        if skinned:
            groups = [obj.vertex_groups.new(name=group.name) for group in surface.vertex_groups]
            for i, influences in enumerate(skin):
                ids = list(range(i * 6, i * 6 + 6))
                for index, weight in influences.items():
                    groups[index].add(ids, weight, "REPLACE")
            modifier = obj.modifiers.new("Follow the raccoon skin", "ARMATURE")
            modifier.object = surface.parent
        obj["raccoonGroom"] = True
        self.sources.append(source)
        return obj

    def studio_strands(self, source, parent, collection, skin_matrices=None):
        """Make tapered editable curve strands for the Cycles review scene."""
        material = bpy.data.materials.get("Studio fur")
        if material is None:
            material = self.make_material("Studio fur", "9d9486", .8)
            nodes, links = material.node_tree.nodes, material.node_tree.links
            pigment = nodes.new("ShaderNodeAttribute")
            pigment.attribute_name = "Strand pigment"
            shader = nodes.new("ShaderNodeBsdfHairPrincipled")
            shader.parametrization = "COLOR"
            shader.inputs["Roughness"].default_value = .46
            shader.inputs["Radial Roughness"].default_value = .56
            shader.inputs["Random Roughness"].default_value = .17
            links.new(pigment.outputs["Color"], shader.inputs["Color"])
            links.new(shader.outputs["BSDF"], nodes.get("Material Output").inputs["Surface"])
            nodes.remove(nodes.get("Principled BSDF"))
        coordinates, radii, colors = [], [], []
        for tuft in self.sample_tufts(source, source.count * 3, source.seed + 108):
            for offset, length in ((-.34, .91), (0, 1.12), (.34, .98)):
                for i in range(4):
                    t = i/3
                    center = tuft.center(t * length, -.035, 1.22)
                    center += tuft.tangent * offset * tuft.width * (1-.7*t)
                    if skin_matrices:
                        center = sum(((skin_matrices[index] @ center) * w for index, w in tuft.weights.items()), Vector())
                    coordinates.extend(center)
                    radii.append(.043 * (1 - .96*t**1.8) * (.76 + .09*tuft.variant))
                    colors.extend(mix(tuft.color, source.palette[0], .08*t))
        hair = bpy.data.hair_curves.new(source.name)
        hair.add_curves([4] * (len(radii) // 4))
        hair.attributes["position"].data.foreach_set("vector", coordinates)
        radius = hair.attributes.new("radius", "FLOAT", "POINT")
        radius.data.foreach_set("value", radii)
        pigment = hair.attributes.new("Strand pigment", "FLOAT_COLOR", "POINT")
        pigment.data.foreach_set("color", colors)
        hair.materials.append(material)
        obj = bpy.data.objects.new(source.name + " · editable strands", hair)
        collection.objects.link(obj)
        obj.parent = parent
        return obj


class GroomSource(NamedTuple):
    surface: object
    mesh: object
    name: str
    count: int
    colors: list
    profile: object
    palette: tuple
    seed: int


class Tuft(NamedTuple):
    position: Vector
    normal: Vector
    direction: Vector
    tangent: Vector
    tilt: float
    length: float
    width: float
    rise: float
    color: tuple
    weights: dict
    variant: int

    def center(self, t, root_offset, lift):
        return self.position + self.length * (
            self.direction * t +
            self.normal * (root_offset + self.rise * lift * t ** 1.35) +
            self.tangent * self.tilt * t * t * .48
        )
