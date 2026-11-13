"""Second-pass optical studio and sculpt finishing, called by create_scene.py.
All fields are geometric/procedural; no reference-image texture is rendered.
"""
import math
import bpy
from mathutils import Vector

# image-space center, two radii, signed height in Blender units
FOLD_ACCENTS = [
    (702,448,49,65,.65), (652,558,58,40,-.30),
    (943,651,72,55,.55), (619,719,94,72,.45), (337,542,62,43,.30),
]
LOBE_ACCENTS = [
    (425,155,65,73,.14), (480,320,48,65,-.40),
    (891,288,73,68,.14), (806,410,46,62,-.30),
    (218,886,62,69,.08), (1101,780,60,63,.08), (638,1063,65,72,.08),
]

def relief(x, y, accents):
    # Source is square, and the camera spans ten Blender units.
    width, height = bpy.data.images['logo_v1.png'].size
    px, py = x*width/10+width/2, height/2-y*width/10
    return sum(a*math.exp(-.5*(((px-cx)/rx)**2+((py-cy)/ry)**2))
               for cx,cy,rx,ry,a in accents)

def finish_scene(scene, draft=False):
    liquid = bpy.data.objects['LIME • sculpted splash']
    bpy.context.view_layer.objects.active = liquid
    # Uniform sampling removes the original pinched grid boundary.
    for modifier in list(liquid.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    remesh = liquid.modifiers.new('Uniform liquid surface', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = .028
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = liquid.modifiers.new('Round meniscus', 'SMOOTH')
    smooth.factor = 1
    smooth.iterations = 9
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    for accents in (FOLD_ACCENTS, LOBE_ACCENTS):
        for vertex in liquid.data.vertices:
            if vertex.co.z > 0:
                vertex.co.z += relief(vertex.co.x, vertex.co.y, accents)*min(1, vertex.co.z/.22)
        for bubble in bpy.data.collections['03 • Suspended air'].objects:
            bubble.location.z += relief(bubble.location.x, bubble.location.y, accents)
    sub = liquid.modifiers.new('Optical surface', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1 if draft else 2
    liquid.data.update()

    material = bpy.data.materials['Chartreuse • optical liquid']
    principled = material.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (.93,1,.35,1)
    principled.inputs['Roughness'].default_value = .045
    principled.inputs['IOR'].default_value = 1.46
    principled.inputs['Coat Weight'].default_value = 0
    absorption = next(n for n in material.node_tree.nodes if n.type == 'VOLUME_ABSORPTION')
    absorption.inputs['Color'].default_value = (.42,.80,.003,1)
    absorption.inputs['Density'].default_value = 2.5
    material.diffuse_color = (.24,.68,.012,1)
    air = bpy.data.materials['Air inclusions • liquid / air interface']
    air.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value = 1/1.46

    # The ivory backdrop is visible to the camera; the studio environment
    # supplies the dark-to-bright illumination seen through the liquid.
    bpy.data.objects['Ivory cyclorama'].visible_transmission = False
    nodes = scene.world.node_tree.nodes
    links = scene.world.node_tree.links
    nodes.clear()
    coordinates = nodes.new('ShaderNodeTexCoord')
    axis = nodes.new('ShaderNodeVectorMath')
    axis.operation = 'DOT_PRODUCT'
    axis.label = 'Studio gradient direction'
    axis.inputs[1].default_value = (.62,.76,.03)
    links.new(coordinates.outputs['Normal'], axis.inputs[0])
    remap = nodes.new('ShaderNodeMapRange')
    remap.inputs['From Min'].default_value = -.8
    remap.inputs['From Max'].default_value = .8
    links.new(axis.outputs['Value'], remap.inputs['Value'])
    gradient = nodes.new('ShaderNodeValToRGB')
    gradient.label = 'Bright transmission / deep emerald shoulder'
    ramp = gradient.color_ramp
    ramp.interpolation = 'EASE'
    ramp.elements.remove(ramp.elements[1])
    for i, (position, color) in enumerate([
        (0, (1.4,1.4,1.2,1)), (.45, (1.05,1.05,.92,1)),
        (.80, (.015,.19,.075,1)), (1, (.012,.12,.045,1)),
    ]):
        element = ramp.elements[0] if i == 0 else ramp.elements.new(position)
        element.position = position
        element.color = color
    links.new(remap.outputs[0], gradient.inputs[0])
    path = nodes.new('ShaderNodeLightPath')
    mix = nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MIX'
    mix.label = 'Emerald reflected ambient; white direct softboxes'
    mix.inputs[2].default_value = (.008,.065,.015,1)
    links.new(path.outputs['Is Reflection Ray'], mix.inputs[0])
    links.new(gradient.outputs['Color'], mix.inputs[1])
    background = nodes.new('ShaderNodeBackground')
    background.inputs['Strength'].default_value = 1
    links.new(mix.outputs[0], background.inputs['Color'])
    output = nodes.new('ShaderNodeOutputWorld')
    links.new(background.outputs[0], output.inputs[0])
    key = bpy.data.lights['Key • rounded upper-right softbox']
    key.size, key.energy = 12, 6000
    key_object = bpy.data.objects[key.name]
    key_object.location = (5,5,5)
    key_object.rotation_euler = (-key_object.location).to_track_quat('-Z','Y').to_euler()
    bpy.data.lights['Left • long liquid ribbon'].energy = 80
    bpy.data.lights['Bottom • luminous liquid rim'].energy = 65
    scene.cycles.device = 'CPU'
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = .025 if draft else .01
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
