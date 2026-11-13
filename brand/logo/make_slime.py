"""Rework the user's saved liquid scene as sticky flubber-like green slime.
Usage: Blender --background lime_liquid.blend --python make_slime.py -- --draft
The source scene is never overwritten. The Layout viewport supplies the angle.
"""
import argparse, math, os, sys
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
p = argparse.ArgumentParser()
p.add_argument('--draft', action='store_true')
p.add_argument('--samples', type=int, default=128)
args = p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
scene = bpy.context.scene
if scene.get('Slime revision'):
    raise RuntimeError('Start from lime_liquid.blend; this file is already the slime revision.')

# Retain the user's saved viewing direction, without touching the source file.
view = next(a.spaces.active.region_3d for a in bpy.data.screens['Layout'].areas if a.type == 'VIEW_3D')
rotation = view.view_rotation.copy()
scene['Saved user view rotation'] = list(rotation)
scene['Original camera matrix'] = [v for row in scene.camera.matrix_world for v in row]
cam = scene.camera
cam.name = 'Camera • saved sideways slime view'
cam.rotation_mode = 'QUATERNION'
cam.rotation_quaternion = rotation
# Keep the original orthographic framing while adopting the saved side angle.
cam.location = Vector((0,0,.13)) + rotation @ Vector((0,0,18))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 10

liquid = bpy.data.objects['LIME • sculpted splash']
liquid.name = 'LIME • sticky slime blob'
# Preserve the user's full sculpt: peaks, folds, silhouette, and depth.
bpy.data.collections['03 • Suspended air'].hide_render = True
bpy.data.collections['03 • Suspended air'].hide_viewport = True
# Keep the original inclusions available, but avoid glass cavities in the gel.
liquid['Surface intent'] = 'Sticky green flubber; softly translucent body, full sculptural folds, wet skin'
liquid['Geometry change'] = 'None: full source mesh, modifiers, and object transform preserved'

mat = bpy.data.materials.new('Slime • lime gel with wet skin')
mat.use_nodes = True
nodes = mat.node_tree.nodes
nodes.clear()
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
bsdf.name = 'Sticky slime body'
bsdf.label = 'Soft gel body / wet skin'
bsdf.inputs['Base Color'].default_value = (.075,.42,.002,1)
bsdf.inputs['Metallic'].default_value = 0
bsdf.inputs['Roughness'].default_value = .20
bsdf.inputs['IOR'].default_value = 1.36
bsdf.inputs['Transmission Weight'].default_value = .52
bsdf.inputs['Subsurface Weight'].default_value = .12
bsdf.inputs['Subsurface Radius'].default_value = (1,.7,.25)
bsdf.inputs['Subsurface Scale'].default_value = .10
bsdf.inputs['Coat Weight'].default_value = .28
bsdf.inputs['Coat Roughness'].default_value = .10
out = nodes.new('ShaderNodeOutputMaterial')
mat.node_tree.links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
absorption = nodes.new('ShaderNodeVolumeAbsorption')
absorption.inputs['Color'].default_value = (.25,.75,.008,1)
absorption.inputs['Density'].default_value = .65
mat.node_tree.links.new(absorption.outputs[0],out.inputs['Volume'])
coordinates = nodes.new('ShaderNodeTexCoord')
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 2.2
noise.inputs['Detail'].default_value = 1.2
noise.inputs['Roughness'].default_value = .45
mat.node_tree.links.new(coordinates.outputs['Generated'],noise.inputs['Vector'])
body_color = nodes.new('ShaderNodeValToRGB')
body_color.label = 'Subtle lime / leaf-green body variation'
body_color.color_ramp.elements[0].position = .2
body_color.color_ramp.elements[0].color = (.035,.28,.001,1)
body_color.color_ramp.elements[1].position = .8
body_color.color_ramp.elements[1].color = (.17,.57,.004,1)
mat.node_tree.links.new(noise.outputs['Fac'],body_color.inputs[0])
mat.node_tree.links.new(body_color.outputs['Color'],bsdf.inputs['Base Color'])
mat.diffuse_color = (.075,.42,.002,1)
for o in [liquid] + list(bpy.data.collections['02 • Floating droplets'].objects):
    o.data.materials.clear()
    o.data.materials.append(mat)

# Neutral studio, without the previous green reflection/refraction overrides.
world = scene.world
world.name = 'Studio • neutral soft illumination'
n = world.node_tree.nodes
n.clear()
bg = n.new('ShaderNodeBackground')
bg.inputs['Color'].default_value = (.83,.87,.78,1)
bg.inputs['Strength'].default_value = .16
out = n.new('ShaderNodeOutputWorld')
path = n.new('ShaderNodeLightPath')
camera_bg = n.new('ShaderNodeBackground')
camera_bg.inputs['Color'].default_value = (.95,.93,.86,1)
camera_bg.inputs['Strength'].default_value = 4
mix = n.new('ShaderNodeMixShader')
world.node_tree.links.new(path.outputs['Is Camera Ray'],mix.inputs[0])
transmission_bg = n.new('ShaderNodeBackground')
transmission_bg.label = 'Soft light through the gel'
transmission_bg.inputs['Color'].default_value = (.9,.95,.85,1)
transmission_bg.inputs['Strength'].default_value = .7
transmission_mix = n.new('ShaderNodeMixShader')
world.node_tree.links.new(path.outputs['Is Transmission Ray'],transmission_mix.inputs[0])
world.node_tree.links.new(bg.outputs[0],transmission_mix.inputs[1])
world.node_tree.links.new(transmission_bg.outputs[0],transmission_mix.inputs[2])
world.node_tree.links.new(transmission_mix.outputs[0],mix.inputs[1])
world.node_tree.links.new(camera_bg.outputs[0],mix.inputs[2])
world.node_tree.links.new(mix.outputs[0],out.inputs[0])

# Retain an optional matte floor; hide it for the floating logo composition.
plane = bpy.data.objects['Ivory cyclorama']
plane.location = (0,0,-1.05)
plane.hide_render = True
plane.visible_glossy = True
plane.visible_transmission = True
floor = bpy.data.materials.new('Ivory • matte studio floor')
floor.use_nodes = True
fp = floor.node_tree.nodes.get('Principled BSDF')
fp.inputs['Base Color'].default_value = (.86,.845,.79,1)
fp.inputs['Roughness'].default_value = .8
plane.data.materials.clear()
plane.data.materials.append(floor)

# Lighting placed relative to the user's camera, so the main sheen stays legible.
right = rotation @ Vector((1,0,0))
up = rotation @ Vector((0,1,0))
front = rotation @ Vector((0,0,1))
center = Vector((0,0,.25))
def light(name, position, power, size, size_y=None):
    obj = bpy.data.objects[name]
    obj.location = position
    obj.rotation_euler = (center-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.data.energy = power
    obj.data.shape = 'DISK' if size_y is None else 'RECTANGLE'
    obj.data.size = size
    if size_y is not None: obj.data.size_y = size_y
    obj.data.color = (1,.98,.92)
    return obj
light('Key • rounded upper-right softbox',center+front*6+up*5-right*3.5,1300,6)
light('Left • long liquid ribbon',center+front*2+up*2+right*5,450,3.5,6)
light('Bottom • luminous liquid rim',Vector((0,3,6)),650,4.5)

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48 if args.draft else args.samples
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = .03 if args.draft else .015
scene.cycles.max_bounces = 12
scene.cycles.transmission_bounces = 8
scene.cycles.sample_clamp_indirect = 5
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.resolution_x = 750 if args.draft else 1254
scene.render.resolution_y = scene.render.resolution_x
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = os.path.join(ROOT,'slime_draft.png' if args.draft else 'slime_preview.png')
scene['Slime revision'] = 3
scene['Source'] = 'User-saved lime_liquid.blend; Layout viewport angle retained'
scene['Material intent'] = 'Sticky green slime, blob, flubber; wet but not clear optical glass'
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            a.spaces.active.region_3d.view_perspective = 'CAMERA'
            a.spaces.active.shading.color_type = 'MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
liquid.select_set(True)
bpy.context.view_layer.objects.active = liquid
notes = bpy.data.texts.new('README • sticky slime revision')
notes.write('STICKY GREEN SLIME\n\nBased on your saved liquid scene. The saved Layout viewport rotation is now the render camera angle. Your source file has not been overwritten.\n\nThis material has a softly scattering, partly translucent body and a wet coat, rather than clear glass with strong absorption. All sculpted folds and peaks are preserved at their original height. A neutral photographic studio replaces the green ray-specific environment. Air inclusions are retained in a hidden collection.\n\nEdit Slime • lime gel with wet skin. Roughness controls the body gloss; Coat Roughness controls the surface sheen; Transmission Weight controls see-through clarity; Subsurface Weight and Scale soften the internal light.\n\nUse Cycles and AgX for the intended appearance. Render with Render > Render Image; save pictures using Image > Save As in the render window.\n')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'slime_draft.blend' if args.draft else 'lime_slime.blend'))
bpy.ops.render.render(write_still=True)
