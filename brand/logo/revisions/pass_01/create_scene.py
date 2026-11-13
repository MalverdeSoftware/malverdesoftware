import bpy, math, random, os
import numpy as np
from collections import deque
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
base=bpy.data.collections.get('Collection'); base.name='01 • Sculpted liquid'
def collection(name):
    c=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
drops=collection('02 • Floating droplets'); bubbles=collection('03 • Suspended air'); studio=collection('04 • Studio'); refs=collection('05 • Reference (hidden in render)')
def move(o,c):
    for old in list(o.users_collection): old.objects.unlink(o)
    c.objects.link(o)

im=bpy.data.images.load(os.path.join(os.path.dirname(ROOT),'logo_v1.png')); im.pack()
w,h=im.size
pix=np.array(im.pixels[:],dtype=np.float32).reshape(h,w,4)
step=4
rgb=pix[::step,::step,:3]; H,W=rgb.shape[:2]
mask=(rgb[:,:,1]>rgb[:,:,2]*1.12)&(rgb[:,:,1]>rgb[:,:,0]*.85)&(rgb[:,:,2]<.85)
# Close small gaps where bright specular highlights meet the outline.
for operation in ('dilate','erode'):
    p=np.pad(mask,2,constant_values=False)
    neighbors=[p[dy:dy+H,dx:dx+W] for dy in range(5) for dx in range(5)]
    mask=np.logical_or.reduce(neighbors) if operation=='dilate' else np.logical_and.reduce(neighbors)
# Flood-fill isolates the connected splash, excluding floating droplets.
seen=np.zeros((H,W),bool); comps=[]
for y,x in zip(*np.where(mask)):
    if seen[y,x]: continue
    q=deque([(y,x)]); seen[y,x]=1; comp=[]
    while q:
        yy,xx=q.popleft(); comp.append((yy,xx))
        for ny,nx in ((yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)):
            if 0<=ny<H and 0<=nx<W and mask[ny,nx] and not seen[ny,nx]:
                seen[ny,nx]=1; q.append((ny,nx))
    comps.append(comp)
main=max(comps,key=len); mask[:]=False
for y,x in main: mask[y,x]=True
# Fill highlight holes enclosed by the silhouette.
outside=np.zeros_like(mask); q=deque([(0,0)]); outside[0,0]=1
while q:
    y,x=q.popleft()
    for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
        if 0<=ny<H and 0<=nx<W and not mask[ny,nx] and not outside[ny,nx]:
            outside[ny,nx]=1; q.append((ny,nx))
mask=~outside
# Chamfer distance gives rounded, smoothly tapering edges.
d=np.where(mask,1e4,0.).astype(float)
for y in range(1,H-1):
    for x in range(1,W-1):
        if mask[y,x]: d[y,x]=min(d[y,x],d[y-1,x]+1,d[y,x-1]+1,d[y-1,x-1]+1.414,d[y-1,x+1]+1.414)
for y in range(H-2,0,-1):
    for x in range(W-2,0,-1):
        if mask[y,x]: d[y,x]=min(d[y,x],d[y+1,x]+1,d[y,x+1]+1,d[y+1,x+1]+1.414,d[y+1,x-1]+1.414)
def blur(a,n):
    for _ in range(n):
        p=np.pad(a,1,mode='edge'); a=(p[1:-1,1:-1]*4+p[:-2,1:-1]+p[2:,1:-1]+p[1:-1,:-2]+p[1:-1,2:])/8
    return a
dark=blur(1-rgb[:,:,1],350)
scale=10/w
dist=d*step*scale
height=np.sqrt(1-np.exp(-dist/.48))*(.65+1.6*dark)
height=blur(height,4)
verts=[]; faces=[]; ids={}
# Two continuous quad surfaces stitched into a closed volume.
valid=mask[:-1,:-1]&mask[1:,:-1]&mask[:-1,1:]&mask[1:,1:]
used=set()
for y,x in zip(*np.where(valid)):
    used.update(((y,x),(y+1,x),(y+1,x+1),(y,x+1)))
for y,x in sorted(used):
    for side in (0,1):
        ids[y,x,side]=len(verts)
        z=float(height[y,x]) if side==0 else -float(height[y,x])*.67
        verts.append(((x*step-w/2)*scale,(y*step-h/2)*scale,z))
edges={}
for y,x in zip(*np.where(valid)):
    corners=[(y,x),(y,x+1),(y+1,x+1),(y+1,x)]
    faces.append(tuple(ids[a,b,0] for a,b in corners))
    faces.append(tuple(ids[a,b,1] for a,b in reversed(corners)))
    for a,b in zip(corners,corners[1:]+corners[:1]):
        key=tuple(sorted((a,b)))
        if key in edges: del edges[key]
        else: edges[key]=(a,b)
for a,b in edges.values():
    faces.append((ids[a+(0,)],ids[a+(1,)],ids[b+(1,)],ids[b+(0,)]))
    for corner in (a,b):
        for side in (0,1):
            idx=ids[corner+(side,)]; vx,vy,vz=verts[idx]; verts[idx]=(vx,vy,.012 if side==0 else -.012)
mesh=bpy.data.meshes.new('Closed silhouette • quad surface'); mesh.from_pydata(verts,[],faces); mesh.update()
import bmesh
bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001); bm.to_mesh(mesh); bm.free()
obj=bpy.data.objects.new('LIME • sculpted splash',mesh); base.objects.link(obj)
for p in mesh.polygons:p.use_smooth=True
smooth=obj.modifiers.new('Soften sampled contour','SMOOTH'); smooth.factor=1.15; smooth.iterations=7
sub=obj.modifiers.new('Polished liquid surface','SUBSURF'); sub.levels=1; sub.render_levels=2

mat=bpy.data.materials.new('Chartreuse • optical liquid'); mat.use_nodes=True
n=mat.node_tree.nodes; links=mat.node_tree.links; p=n.get('Principled BSDF')
p.inputs['Base Color'].default_value=(.48,.86,.008,1)
p.inputs['Roughness'].default_value=.055
p.inputs['IOR'].default_value=1.46
p.inputs['Transmission Weight'].default_value=1
p.inputs['Coat Weight'].default_value=.22
p.inputs['Coat Roughness'].default_value=.035
vol=n.new('ShaderNodeVolumeAbsorption'); vol.inputs['Color'].default_value=(.24,.65,.008,1); vol.inputs['Density'].default_value=.55
links.new(vol.outputs[0],n.get('Material Output').inputs['Volume'])
obj.data.materials.append(mat)
def sphere(name,loc,size,material,col):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=loc)
    o=bpy.context.object; o.name=name; o.scale=size; o.data.materials.append(material); move(o,col)
    for p in o.data.polygons:p.use_smooth=True
    return o
# Coordinates measured in the supplied reference.
spec=[(695,190,51,61),(286,303,28,30),(669,289,12,13),(180,679,45,47),(270,678,18,19),(410,1014,61,67),(458,882,22,23),(988,506,12,13),(1102,601,12,13),(1029,941,14,15)]
for i,(x,y,rx,ry) in enumerate(spec):
    sphere('Floating droplet %02d'%(i+1),((x-w/2)*scale,(h/2-y)*scale,.1),(rx*scale,ry*scale,min(rx,ry)*scale*.8),mat,drops)
air=bpy.data.materials.new('Air inclusions • liquid / air interface'); air.use_nodes=True
ap=air.node_tree.nodes.get('Principled BSDF'); ap.inputs['Base Color'].default_value=(.92,1,.75,1); ap.inputs['Transmission Weight'].default_value=1; ap.inputs['Roughness'].default_value=.025; ap.inputs['IOR'].default_value=1/1.46
random.seed(22)
for i in range(115):
    for attempt in range(100):
        y=random.randrange(H); x=random.randrange(W)
        if dist[y,x]>.18: break
    else:continue
    r=random.uniform(.008,.026) if i>14 else random.uniform(.035,.09)
    z=float(height[y,x])*.58
    sphere('Air pearl %03d'%i,((x*step-w/2)*scale,(y*step-h/2)*scale,z),(r,r,r),air,bubbles)

bg=bpy.data.materials.new('Warm ivory seamless'); bg.diffuse_color=(.88,.865,.80,1); bg.use_nodes=True
bp=bg.node_tree.nodes.get('Principled BSDF'); bp.inputs['Base Color'].default_value=(.88,.865,.80,1); bp.inputs['Roughness'].default_value=.8
bp.inputs['Emission Color'].default_value=(.88,.865,.80,1); bp.inputs['Emission Strength'].default_value=.8
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-3)); plane=bpy.context.object; plane.name='Ivory cyclorama'; plane.data.materials.append(bg); move(plane,studio)
def aim(o,pt):o.rotation_euler=(Vector(pt)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,size_y,target=(0,0,0)):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='RECTANGLE'; data.size=size; data.size_y=size_y
    o=bpy.data.objects.new(name,data); studio.objects.link(o); o.location=loc; aim(o,target)
area('Key • tall softbox',(-4,3,6),550,3.2,6)
area('Upper-right reflection',(3,5,5),800,3,3)
area('Left edge strip',(-5,-1,2.4),200,1.2,5)
area('Low rim',(1,-5,2.8),200,5,1.5)
world=bpy.context.scene.world; world.use_nodes=True; world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.24,.14,1); world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.object.camera_add(location=(0,0,18)); cam=bpy.context.object; cam.name='Camera • reference composition'; aim(cam,(0,0,0)); cam.data.type='ORTHO'; cam.data.ortho_scale=10; move(cam,studio)
scene=bpy.context.scene; scene.camera=cam; scene.render.engine='CYCLES'; scene.cycles.samples=64; scene.cycles.use_denoising=True; scene.cycles.max_bounces=16; scene.cycles.transmission_bounces=12
scene.render.resolution_x=1000; scene.render.resolution_y=1000; scene.render.resolution_percentage=75
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'; scene.render.filepath=os.path.join(ROOT,'preview.png')
bpy.ops.object.empty_add(type='IMAGE',location=(0,0,-2)); ref=bpy.context.object; ref.name='Original • packed reference'; ref.data=im; ref.empty_display_size=10; ref.hide_render=True; ref.hide_viewport=True; move(ref,refs)
readme=bpy.data.texts.new('README • scene notes'); readme.write('LIME LIQUID — editable 3D reconstruction\n\nThe supplied image is packed as a hidden reference. The rendered splash uses a closed 3D mesh, transmissive materials, independent droplets, suspended air inclusions, and four studio lights. No image plane is used in the render.\n\nCamera and silhouette match the supplied reference. Depth, rear surface, internal folds, and reflections are artistic approximations from a single view.\n\nCollections separate splash, droplets, bubbles, studio, and reference. Surface modifiers remain editable. Render with Cycles.\n')
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'lime_liquid.blend'))
bpy.ops.render.render(write_still=True)
