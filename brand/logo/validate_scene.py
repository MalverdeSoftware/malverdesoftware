"""Read-only structural check: run with Blender --background lime_liquid.blend --python validate_scene.py."""
import bpy, bmesh, json
o=bpy.data.objects['LIME • sculpted splash']
bm=bmesh.new(); bm.from_mesh(o.data)
report={
    'blender_version': bpy.app.version_string,
    'splash_vertices': len(bm.verts),
    'splash_faces': len(bm.faces),
    'non_manifold_edges': sum(not e.is_manifold for e in bm.edges),
    'floating_droplets': len(bpy.data.collections['02 • Floating droplets'].objects),
    'air_inclusions': len(bpy.data.collections['03 • Suspended air'].objects),
    'camera': bpy.context.scene.camera.name,
    'render_engine': bpy.context.scene.render.engine,
    'packed_reference': bool(bpy.data.images.get('logo_v1.png').packed_file),
}
bm.free()
assert report['non_manifold_edges']==0, report
assert report['floating_droplets']==10 and report['packed_reference'], report
print('SCENE_VALIDATION '+json.dumps(report))
