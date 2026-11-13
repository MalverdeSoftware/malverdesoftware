"""Build and render the 3D MalverdeSoftware medal from the sculpted relief.

Run build_relief.py first, then from this folder (add --draft after the --):
    /Applications/Blender.app/Contents/MacOS/Blender --background --python build_medal.py -- --draft

Writes malverde_medal.blend, medal_hero.png and medal_front.png with transparent
backgrounds. The logo stands alone, with no scene (see ../DESIGN-ETHOS.md).
"""
import json, math, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent
MAPS = ROOT / 'relief_maps'
G = json.loads((ROOT / 'medal_geometry.json').read_text())
DRAFT = '--draft' in sys.argv
M = G['medal']
S = .01
RO = M['outer']
SPAN = 2 * (RO + 10)
WIDTH = SPAN * S
R = RO * S
GRID = 2200
LIFT = .3

height = np.load(MAPS / 'height.npy')
N = height.shape[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Mesh: a square grid trimmed to the circle, with edge points snapped to a true circle.
axis = np.linspace(-R, R, GRID)
step = axis[1] - axis[0]
X, Y = np.meshgrid(axis, axis)
r = np.hypot(X, Y) + 1e-9
snap = (r > R - .8 * step) & (r < R + 1.6 * step)
X[snap] *= R / r[snap]
Y[snap] *= R / r[snap]
keep = np.hypot(X, Y) <= R + 1e-7
index = -np.ones(keep.shape, np.int64)
index[keep] = np.arange(keep.sum())
corners = np.stack([index[:-1, :-1], index[:-1, 1:], index[1:, 1:], index[1:, :-1]], -1).reshape(-1, 4)
faces = corners[(corners >= 0).all(1)]

# Sample depth at each point. Image row 0 is the top of the medal.
px = np.clip((X[keep] / WIDTH + .5) * (N - 1), 0, N - 1.001)
py = np.clip((.5 - Y[keep] / WIDTH) * (N - 1), 0, N - 1.001)
ix, iy = px.astype(np.int64), py.astype(np.int64)
fx, fy = px - ix, py - iy
z = (height[iy, ix] * (1 - fx) * (1 - fy) + height[iy, ix + 1] * fx * (1 - fy)
     + height[iy + 1, ix] * (1 - fx) * fy + height[iy + 1, ix + 1] * fx * fy) * S
z = z + LIFT  # the dished field must clear the body behind it
verts = np.stack([X[keep], Y[keep], z], -1).astype(np.float32)

mesh = bpy.data.meshes.new('Medal relief')
mesh.vertices.add(len(verts))
mesh.vertices.foreach_set('co', verts.ravel())
mesh.loops.add(faces.size)
mesh.polygons.add(len(faces))
mesh.polygons.foreach_set('loop_start', np.arange(len(faces), dtype=np.int32) * 4)
mesh.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
mesh.update(calc_edges=True)
mesh.shade_smooth()
relief = bpy.data.objects.new('Medal relief', mesh)
bpy.context.collection.objects.link(relief)


def texture(nodes, name, color_space='Non-Color'):
    node = nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(str(MAPS / name))
    node.image.colorspace_settings.name = color_space
    node.interpolation = 'Cubic'
    node.extension = 'CLIP'
    return node


mat = bpy.data.materials.new('Medal enamel')
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
link = nt.links.new
out = nt.nodes.new('ShaderNodeOutputMaterial')
coord = nt.nodes.new('ShaderNodeTexCoord')
mapping = nt.nodes.new('ShaderNodeMapping')
mapping.inputs['Scale'].default_value = (1 / WIDTH, 1 / WIDTH, 1)
mapping.inputs['Location'].default_value = (.5, .5, 0)
link(coord.outputs['Object'], mapping.inputs['Vector'])
tex_mat, tex_detail, tex_rough = texture(nt.nodes, 'material.png'), texture(nt.nodes, 'detail.png'), texture(nt.nodes, 'rough.png')
for t in (tex_mat, tex_detail, tex_rough):
    link(mapping.outputs['Vector'], t.inputs['Vector'])
split = nt.nodes.new('ShaderNodeSeparateColor')
link(tex_mat.outputs['Color'], split.inputs['Color'])
bump = nt.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 1
bump.inputs['Distance'].default_value = 20 * S
link(tex_detail.outputs['Color'], bump.inputs['Height'])


def rough_map(base, spread):
    node = nt.nodes.new('ShaderNodeMapRange')
    node.inputs['To Min'].default_value = max(base - spread, .01)
    node.inputs['To Max'].default_value = base + spread
    link(tex_rough.outputs['Color'], node.inputs['Value'])
    return node.outputs['Result']


def shader(color, rough, spread, **inputs):
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    if color is not None:
        b.inputs['Base Color'].default_value = color
    link(rough_map(rough, spread), b.inputs['Roughness'])
    link(bump.outputs['Normal'], b.inputs['Normal'])
    for key, value in inputs.items():
        b.inputs[key.replace('_', ' ')].default_value = value
    return b


# Green gel: deeper in the valleys and brighter over the crests, as thick color glass is.
gel = shader(None, .10, .05, IOR=1.5, Subsurface_Weight=.35, Subsurface_Radius=(.25, 1, .15),
             Subsurface_Scale=.12, Specular_Tint=(.35, 1, .25, 1), Coat_Weight=.6, Coat_Roughness=.03, Coat_IOR=1.33)
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
link(coord.outputs['Object'], sep.inputs[0])
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0
ramp.color_ramp.elements[0].color = (.004, .055, .003, 1)
ramp.color_ramp.elements[1].position = 1
ramp.color_ramp.elements[1].color = (.03, .19, .006, 1)
height_range = nt.nodes.new('ShaderNodeMapRange')
height_range.inputs['From Min'].default_value = .05 + LIFT
height_range.inputs['From Max'].default_value = .85 + LIFT
link(sep.outputs['Z'], height_range.inputs['Value'])
link(height_range.outputs['Result'], ramp.inputs['Fac'])
link(ramp.outputs['Color'], gel.inputs['Base Color'])

# Ink: dark satin, so the combed hair catches light instead of going flat black.
ink = shader((.005, .010, .004, 1), .36, .05, Coat_Weight=.12, Coat_Roughness=.22, Specular_IOR_Level=.45)
# Cream: glazed porcelain.
cream = shader(None, .22, .05, Subsurface_Weight=.25, Subsurface_Radius=(1, .75, .55),
               Subsurface_Scale=.08, Coat_Weight=.7, Coat_Roughness=.14)

# Glaze pools warm and slightly darker in the recesses around each form.
ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
ao.samples = 8
ao.inputs['Distance'].default_value = .55
pool = nt.nodes.new('ShaderNodeValToRGB')
pool.color_ramp.elements[0].position = .25
pool.color_ramp.elements[0].color = (.60, .50, .36, 1)
pool.color_ramp.elements[1].position = .95
pool.color_ramp.elements[1].color = (.95, .92, .82, 1)
link(ao.outputs['AO'], pool.inputs['Fac'])
link(pool.outputs['Color'], cream.inputs['Base Color'])

mix_ink = nt.nodes.new('ShaderNodeMixShader')
link(split.outputs[1], mix_ink.inputs[0])
link(cream.outputs[0], mix_ink.inputs[1])
link(ink.outputs[0], mix_ink.inputs[2])
mix_gel = nt.nodes.new('ShaderNodeMixShader')
link(split.outputs[0], mix_gel.inputs[0])
link(mix_ink.outputs[0], mix_gel.inputs[1])
link(gel.outputs[0], mix_gel.inputs[2])
link(mix_gel.outputs[0], out.inputs['Surface'])
mesh.materials.append(mat)

# Heavy brushed-metal body behind the enamel, seen only from an angle.
metal = bpy.data.materials.new('Medal body')
metal.use_nodes = True
b = metal.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (.55, .56, .53, 1)
b.inputs['Metallic'].default_value = 1
b.inputs['Roughness'].default_value = .27
bpy.ops.mesh.primitive_cylinder_add(vertices=512, radius=R + .002, depth=1.1, location=(0, 0, -.55))
body = bpy.context.object
body.name = 'Medal body'
body.data.materials.append(metal)
bpy.ops.object.shade_smooth()
mod = body.modifiers.new('Edge', 'BEVEL')
mod.width, mod.segments, mod.limit_method, mod.angle_limit = .10, 8, 'ANGLE', math.radians(40)

# Metal bezel from the body up around the ring, closing the gap under the relief.
angles = np.linspace(0, 2 * np.pi, 512, endpoint=False)
wall_v = [(R + .005) * np.array((np.cos(a), np.sin(a))) for a in angles]
wall_verts = [(float(x), float(y), z_) for x, y in wall_v for z_ in (-.02, LIFT + .27)]  # a bezel cup, hiding the ring's steepest edge
wall_faces = [(2 * i, 2 * ((i + 1) % 512), 2 * ((i + 1) % 512) + 1, 2 * i + 1) for i in range(512)]
wall_mesh = bpy.data.meshes.new('Medal wall')
wall_mesh.from_pydata(wall_verts, [], wall_faces)
wall_mesh.shade_smooth()
wall_mesh.materials.append(metal)
bpy.context.collection.objects.link(bpy.data.objects.new('Medal wall', wall_mesh))

# A thin polished lip on the bezel, which catches a clean line of light.
bpy.ops.mesh.primitive_torus_add(major_radius=R + .005, minor_radius=.032, major_segments=512, minor_segments=16,
                                 location=(0, 0, LIFT + .27))
lip = bpy.context.object
lip.name = 'Bezel lip'
lip.data.materials.append(metal)
bpy.ops.object.shade_smooth()

# Photo studio: a dim gradient room with large softboxes the gloss can reflect.
world = bpy.data.worlds.new('Studio')
scene.world = world
world.use_nodes = True
wt = world.node_tree
w_coord = wt.nodes.new('ShaderNodeTexCoord')
w_sep = wt.nodes.new('ShaderNodeSeparateXYZ')
w_ramp = wt.nodes.new('ShaderNodeValToRGB')
w_ramp.color_ramp.elements[0].position = .22
w_ramp.color_ramp.elements[0].color = (.015, .017, .016, 1)
w_ramp.color_ramp.elements[1].position = .9
w_ramp.color_ramp.elements[1].color = (.55, .56, .54, 1)
floor_stop = w_ramp.color_ramp.elements.new(.02)  # a pale floor the bezel's side can reflect
floor_stop.color = (.42, .42, .40, 1)
wt.links.new(w_coord.outputs['Generated'], w_sep.inputs[0])
wt.links.new(w_sep.outputs['Z'], w_ramp.inputs['Fac'])
wt.links.new(w_ramp.outputs['Color'], wt.nodes['Background'].inputs['Color'])
wt.nodes['Background'].inputs['Strength'].default_value = .55


def softbox(name, loc, energy, sx, sy, color=(1, .98, .95)):
    data = bpy.data.lights.new(name, 'AREA')
    data.shape, data.size, data.size_y, data.energy, data.color = 'RECTANGLE', sx, sy, energy, color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


# Raking key from the upper left: low enough to throw shadows across the relief.
softbox('Raking key', (-20, 17, 13), 4600, 9, 9)
softbox('Strip, right', (23, 3, 12), 1000, 3, 22)
softbox('Under fill', (4, -24, 15), 360, 18, 6, (.96, 1, .96))
softbox('Top reflection', (0, 6, 30), 260, 26, 12)
# Soft frontal light: lifts the cream to its true value without adding any glare.
softbox('Frontal fill', (-2, -3, 34), 4200, 24, 24, (1, .96, .88))
bpy.data.lights['Frontal fill'].specular_factor = 0

cam_data = bpy.data.cameras.new('Camera')
cam_data.lens = 100
cam_data.dof.use_dof = not DRAFT
cam_data.dof.aperture_fstop = .5  # a touch of real lens falloff on the angled view
camera = bpy.data.objects.new('Camera', cam_data)
bpy.context.collection.objects.link(camera)
scene.camera = camera


def aim(position):
    forward = (Vector((0, 0, .2)) - Vector(position)).normalized()
    right = forward.cross(Vector((0, 1, 0))).normalized()
    up = right.cross(forward)
    camera.matrix_world = Matrix(((right.x, up.x, -forward.x, position[0]), (right.y, up.y, -forward.y, position[1]),
                                  (right.z, up.z, -forward.z, position[2]), (0, 0, 0, 1)))
    cam_data.dof.focus_distance = (Vector(position) - Vector((0, 0, .2))).length


scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    scene.cycles.device = 'GPU'
except Exception as error:
    print('Using CPU:', error)
scene.cycles.samples = 96 if DRAFT else 512
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 12
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Punchy'
scene.view_settings.exposure = .95
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 1100 if DRAFT else 2400
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'malverde_medal.blend'))
suffix = '_draft' if DRAFT else ''
for name, position in (('medal_front', (0, 0, 54)), ('medal_hero', (-15, -19, 48))):
    aim(position)
    scene.render.filepath = str(ROOT / f'{name}{suffix}.png')
    bpy.ops.render.render(write_still=True)
