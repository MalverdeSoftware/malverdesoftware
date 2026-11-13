"""Editable 3D liquid logo; -- --draft renders a quick proof.
The photograph supplies the outline, never a texture on the rendered surface.
"""
import argparse, math, os, random, sys
from collections import deque
import bpy, bmesh
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
parser = argparse.ArgumentParser()
parser.add_argument('--draft', action='store_true')
parser.add_argument('--samples', type=int, default=128)
parser.add_argument('--resolution', type=int, default=1254)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
def collection(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
base = collection('01 • Sculpted liquid')
drops = collection('02 • Floating droplets')
bubbles = collection('03 • Suspended air')
studio = collection('04 • Studio')
refs = collection('05 • Reference (hidden in render)')
guides = collection('06 • Flow guides (hidden in render)')
guides.hide_render = True; guides.hide_viewport = True
def move(obj, col):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    col.objects.link(obj)

im = bpy.data.images.load(os.path.join(os.path.dirname(ROOT), 'logo_v1.png'), check_existing=True); im.pack()
w, h = im.size
pix = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
step = 3
rgb = pix[::step, ::step, :3]; H, W = rgb.shape[:2]
mask = (rgb[:,:,1] > rgb[:,:,2]*1.12) & (rgb[:,:,1] > rgb[:,:,0]*.85) & (rgb[:,:,2] < .85)
# Close specular pinholes, retain the large connected volume, fill enclosed holes.
for operation in ('dilate', 'erode'):
    p = np.pad(mask, 2, constant_values=False)
    neighbors = [p[dy:dy+H, dx:dx+W] for dy in range(5) for dx in range(5)]
    mask = np.logical_or.reduce(neighbors) if operation == 'dilate' else np.logical_and.reduce(neighbors)
seen = np.zeros_like(mask); components = []
for y,x in zip(*np.where(mask)):
    if seen[y,x]: continue
    q = deque([(y,x)]); seen[y,x] = True; component = []
    while q:
        yy,xx = q.popleft(); component.append((yy,xx))
        for ny,nx in ((yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)):
            if 0 <= ny < H and 0 <= nx < W and mask[ny,nx] and not seen[ny,nx]:
                seen[ny,nx] = True; q.append((ny,nx))
    components.append(component)
mask[:] = False
for y,x in max(components, key=len): mask[y,x] = True
outside = np.zeros_like(mask); q = deque([(0,0)]); outside[0,0] = True
while q:
    y,x = q.popleft()
    for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
        if 0 <= ny < H and 0 <= nx < W and not mask[ny,nx] and not outside[ny,nx]:
            outside[ny,nx] = True; q.append((ny,nx))
mask = ~outside

def blur(a,n):
    for _ in range(n):
        p = np.pad(a,1,mode='edge')
        a = (p[1:-1,1:-1]*4+p[:-2,1:-1]+p[2:,1:-1]+p[1:-1,:-2]+p[1:-1,2:])/8
    return a
# Smooth distance before constructing the rounded cross-section.
d = np.where(mask,1e4,0.).astype(float)
for y in range(1,H-1):
    for x in range(1,W-1):
        if mask[y,x]: d[y,x] = min(d[y,x],d[y-1,x]+1,d[y,x-1]+1,d[y-1,x-1]+1.414,d[y-1,x+1]+1.414)
for y in range(H-2,0,-1):
    for x in range(W-2,0,-1):
        if mask[y,x]: d[y,x] = min(d[y,x],d[y+1,x]+1,d[y,x+1]+1,d[y+1,x+1]+1.414,d[y+1,x-1]+1.414)
scale = 10/w; dist = d*step*scale
YY,XX = np.mgrid[:H,:W]; X = XX*step; Y = h-YY*step

def catmull(points, per_segment=24):
    p = np.array([points[0]]+points+[points[-1]],dtype=float); curve=[]
    for i in range(1,len(p)-2):
        a,b,c,e = p[i-1:i+3]
        for t in np.linspace(0,1,per_segment,endpoint=False):
            curve.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-e)*t*t+(-a+3*b-3*c+e)*t*t*t))
    curve.append(p[-2]); return np.array(curve)
# (image x, image y, fold width, height). Broad hand-directed flowing ridges.
flow_paths = [
 ('Crown into central curl',[(421,146,92,.66),(455,236,76,.76),(487,356,54,.98),(534,451,67,1.08),(629,484,76,1.02),(707,451,50,.90)]),
 ('Upper-right sweeping shoulder',[(900,282,90,.92),(829,335,75,.98),(786,442,53,.72),(820,538,51,.57),(933,601,68,.76),(972,667,57,.90),(892,704,57,.72)]),
 ('Left returning fold',[(276,544,50,.45),(360,585,54,.60),(407,667,47,.80),(361,766,59,.72),(248,867,78,.62)]),
 ('Lower central fall',[(578,824,53,.59),(628,913,63,.92),(637,1054,82,.88)]),
 ('Lower-right bead',[(832,949,40,.40),(909,1002,65,.62)]),
 ('Right lower lobe',[(1038,714,65,.68),(1103,792,73,.77)]),
 ('Left fine arm',[(155,397,53,.38),(225,397,32,.30),(305,445,30,.26)]),
 ('Right fine arm',[(1025,546,32,.25),(1107,489,64,.50)]),
]
relief = np.zeros((H,W))
for name,points in flow_paths:
    path = catmull(points); ridge = np.zeros((H,W))
    for px,py,radius,amplitude in path:
        field = amplitude*np.exp(-((X-px)**2+(Y-py)**2)/(2*radius**2))
        ridge = np.maximum(ridge,field)
    relief += ridge
    curve = bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'
    spline=curve.splines.new('POLY'); spline.points.add(len(path)-1)
    for point,(px,py,radius,amplitude) in zip(spline.points,path):
        point.co=((px-w/2)*scale,(h/2-py)*scale,amplitude+.30,1)
    guide=bpy.data.objects.new(name,curve); guides.objects.link(guide); guide.hide_render=True
relief=blur(relief,90)
edge=np.sqrt(1-np.exp(-blur(dist,10)/.30))
height=blur(edge*(.24+relief),3)
underside=blur(edge*(.22+.30*blur(relief,140)),3)
verts=[]; faces=[]; ids={}
valid=mask[:-1,:-1]&mask[1:,:-1]&mask[:-1,1:]&mask[1:,1:]
used=set()
for y,x in zip(*np.where(valid)): used.update(((y,x),(y+1,x),(y+1,x+1),(y,x+1)))
for y,x in sorted(used):
    for side in (0,1):
        ids[y,x,side]=len(verts)
        z=float(height[y,x]) if side==0 else -float(underside[y,x])
        verts.append(((x*step-w/2)*scale,(y*step-h/2)*scale,z))
edges={}
for y,x in zip(*np.where(valid)):
    corners=[(y,x),(y,x+1),(y+1,x+1),(y+1,x)]
    faces.append(tuple(ids[a,b,0] for a,b in corners)); faces.append(tuple(ids[a,b,1] for a,b in reversed(corners)))
    for a,b in zip(corners,corners[1:]+corners[:1]):
        key=tuple(sorted((a,b)))
        if key in edges: del edges[key]
        else: edges[key]=(a,b)
for a,b in edges.values():
    faces.append((ids[a+(0,)],ids[a+(1,)],ids[b+(1,)],ids[b+(0,)]))
    for corner in (a,b):
        for side in (0,1):
            idx=ids[corner+(side,)]; vx,vy,_=verts[idx]; verts[idx]=(vx,vy,.018 if side==0 else -.018)
mesh=bpy.data.meshes.new('Closed liquid • continuous folded surface'); mesh.from_pydata(verts,[],faces); mesh.update()
bm=bmesh.new(); bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
obj=bpy.data.objects.new('LIME • sculpted splash',mesh); base.objects.link(obj)
obj['Revision']='02 — hand-directed flow folds, polished optics, calibrated studio'
obj['Source']='logo_v1.png; outline only, no photograph texture in render'
for polygon in mesh.polygons: polygon.use_smooth=True
smooth=obj.modifiers.new('Relax silhouette sampling','SMOOTH'); smooth.factor=1.0; smooth.iterations=12
sub=obj.modifiers.new('Continuous polished liquid','SUBSURF'); sub.levels=1; sub.render_levels=1 if args.draft else 2

mat=bpy.data.materials.new('Chartreuse • optical liquid'); mat.use_nodes=True
n=mat.node_tree.nodes; links=mat.node_tree.links; p=n.get('Principled BSDF')
p.inputs['Base Color'].default_value=(.94,1,.72,1)
p.inputs['Roughness'].default_value=.035; p.inputs['IOR'].default_value=1.46
p.inputs['Transmission Weight'].default_value=1; p.inputs['Coat Weight'].default_value=.08; p.inputs['Coat Roughness'].default_value=.025
vol=n.new('ShaderNodeVolumeAbsorption'); vol.label='Emerald depth / yellow-green thin edges'
vol.inputs['Color'].default_value=(.38,.78,.004,1); vol.inputs['Density'].default_value=1.55
links.new(vol.outputs[0],n.get('Material Output').inputs['Volume']); obj.data.materials.append(mat)

def sphere(name,loc,size,material,col,segments=48,rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=bpy.context.object; o.name=name; o.scale=size; o.data.materials.append(material); move(o,col)
    for polygon in o.data.polygons: polygon.use_smooth=True
    return o
spec=[(695,190,51,61),(286,303,28,30),(669,289,12,13),(180,679,45,47),(270,678,18,19),(410,1014,61,67),(458,882,22,23),(988,506,12,13),(1102,601,12,13),(1029,941,14,15)]
for i,(x,y,rx,ry) in enumerate(spec):
    drop=sphere('Floating droplet %02d'%(i+1),((x-w/2)*scale,(h/2-y)*scale,.12),(rx*scale,ry*scale,min(rx,ry)*scale*.95),mat,drops)
    drop['Reference center (pixels)']=(x,y)
    drop_sub=drop.modifiers.new('Optical polish','SUBSURF'); drop_sub.levels=1

air=bpy.data.materials.new('Air inclusions • liquid / air interface'); air.use_nodes=True
ap=air.node_tree.nodes.get('Principled BSDF'); ap.inputs['Base Color'].default_value=(1,1,1,1)
ap.inputs['Transmission Weight'].default_value=1; ap.inputs['Roughness'].default_value=.015; ap.inputs['IOR'].default_value=1/1.46
random.seed(22)
pearls=[(427,493,14),(487,558,13),(886,489,13),(910,406,8),(538,771,10),(709,688,9)]
for i in range(120):
    if i<len(pearls):
        px,py,radius=pearls[i]; x,y=round(px/step),round((h-py)/step); r=radius*scale
    else:
        for attempt in range(100):
            y,x=random.randrange(H),random.randrange(W)
            if dist[y,x]>.25: break
        else: continue
        r=random.uniform(.007,.023)
    z=float(height[y,x])-r-.06
    sphere('Air pearl %03d'%i,((x*step-w/2)*scale,(y*step-h/2)*scale,z),(r,r,r),air,bubbles,20,12)

def aim(o,point): o.rotation_euler=(Vector(point)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,size_y,target=(0,0,0),shape='RECTANGLE'):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape=shape; data.size=size
    if shape=='RECTANGLE': data.size_y=size_y
    o=bpy.data.objects.new(name,data); studio.objects.link(o); o.location=loc; aim(o,target); return o
bg=bpy.data.materials.new('Warm ivory seamless'); bg.use_nodes=True
bn=bg.node_tree.nodes; bn.clear(); emission=bn.new('ShaderNodeEmission')
emission.inputs['Color'].default_value=(.91,.90,.86,1); emission.inputs['Strength'].default_value=1
out=bn.new('ShaderNodeOutputMaterial'); bg.node_tree.links.new(emission.outputs[0],out.inputs['Surface'])
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-3.5)); plane=bpy.context.object
plane.name='Ivory cyclorama'; plane.data.materials.append(bg); plane.visible_glossy=False; move(plane,studio)
area('Key • rounded upper-right softbox',(3.6,4.5,7),950,4.4,4.4,shape='DISK')
area('Left • long liquid ribbon',(-4,1.8,4.5),650,1.7,6.5)
area('Bottom • luminous liquid rim',(-1,-5,2.2),450,5,1.6)
world=bpy.context.scene.world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.60,.66,.52,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.38
bpy.ops.object.camera_add(location=(0,0,18)); cam=bpy.context.object; cam.name='Camera • reference composition'
aim(cam,(0,0,0)); cam.data.type='ORTHO'; cam.data.ortho_scale=10; move(cam,studio)
scene=bpy.context.scene; scene.camera=cam; scene.render.engine='CYCLES'
scene.cycles.samples=48 if args.draft else args.samples; scene.cycles.use_denoising=True
scene.cycles.max_bounces=20; scene.cycles.transmission_bounces=16; scene.cycles.transparent_max_bounces=16
scene.cycles.sample_clamp_indirect=5
scene.cycles.device='CPU'
scene.render.resolution_x=700 if args.draft else args.resolution; scene.render.resolution_y=700 if args.draft else args.resolution
scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'; scene.view_settings.exposure=0; scene.view_settings.gamma=1
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=os.path.join(ROOT,'draft_v2.png' if args.draft else 'preview.png')
bpy.ops.object.empty_add(type='IMAGE',location=(0,0,-2)); ref=bpy.context.object; ref.name='Original • packed reference'
ref.data=im; ref.empty_display_size=10; ref.hide_render=True; ref.hide_viewport=True; move(ref,refs)
readme=bpy.data.texts.new('README • scene notes v2')
readme.write('LIME LIQUID — second sculpting pass\n\nClosed 3D surface with eight flowing folds with sculpted curl and lobe accents, polished volume-tinted liquid, ten independent droplets and sparse embedded air. The source image is packed for comparison only: it is never applied to the rendered surface.\n\nThe initial reconstruction is archived in revisions/pass_01. Flow guides describe the generated sculpt but are not live modifiers; edit create_scene.py and finish_scene.py to regenerate, or sculpt the mesh directly.\n\nThe orthographic camera matches the source composition. Standard color management preserves saturated yellow-green glass. Use Cycles.\n')
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'; a.spaces.active.shading.color_type='MATERIAL'
sys.path.insert(0, ROOT)
from finish_scene import finish_scene
finish_scene(scene, draft=args.draft)
scene['Revision']=2; scene['Reference']='logo_v1.png'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'draft_v2.blend' if args.draft else 'lime_liquid.blend'))
bpy.ops.render.render(write_still=True)
