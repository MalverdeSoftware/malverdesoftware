# Liquid logo — editable Blender reconstruction

## Intent and context

Created on October 14, 2026 from `../logo_v1.png`. The goal is an editable 3D starting point for future logo refinement and new renders: a translucent chartreuse liquid splash, separate floating droplets, tiny air inclusions, and an ivory studio background.

The source is a single 2D image. Its silhouette and droplet positions guide the reconstruction; depth, hidden surfaces, internal folds, and lighting are artistic approximations. This is a modeled object, not a fluid simulation or a flat image applied to a plane.

## Files

- `lime_liquid.blend`: editable scene, with the original reference image packed into the file.
- `preview.png`: rendered camera view.
- `create_scene.py`: reproducible scene-generation script. Reads `../logo_v1.png` and writes the scene and preview into this folder.
- `validate_scene.py`: read-only Blender script for checking the main mesh and packed reference.
- `README.md`: context, process, and editing guidance.

## Editing and rendering

Open `lime_liquid.blend` in Blender 4.5 or newer. Save a versioned copy before substantial changes. The `.blend` is self-contained; the external source image is only needed when rerunning the generator.

1. Select **LIME • sculpted splash** in collection **01 • Sculpted liquid**. Use Sculpt Mode with Grab and Smooth brushes for broad shape refinements, or Edit Mode with proportional editing. The mesh is dense; begin with large, gentle changes. Its smoothing and subdivision modifiers remain editable.
2. Collection **02 • Floating droplets** contains independent objects. Move, rotate, scale, duplicate, or remove them individually.
3. In Material Properties or the Shader Editor, edit **Chartreuse • optical liquid**. Base Color changes tint; Roughness changes polish; Transmission Weight changes transparency; IOR controls refraction. Volume Absorption color and density control tint through the object's thickness.
4. Collection **03 • Suspended air** contains the small internal air spheres. Hide this collection for a simpler logo or faster previews.
5. Collection **04 • Studio** contains the camera, ivory ground plane, and four area lights. Move or resize lights to adjust the broad reflected highlights. Move the camera to inspect and render other angles. The original camera is orthographic and looks straight down at the splash.
6. Use the camera view (Numpad 0) and Render Image (F12). Rendering uses Cycles with denoising. For final output, set resolution percentage to 100% and increase samples to 256 or 512. Set a larger resolution when needed.
7. For a transparent-background export, hide the **Ivory cyclorama** from rendering, enable Render Properties → Film → Transparent, and choose PNG with RGBA in Output Properties.

The reference object in **05 • Reference (hidden in render)** is hidden from viewport and rendering by default. The image is also available in the Image Editor. It is not used as a texture on the logo.

## Construction process

1. Load the supplied image in Blender and sample its pixels on a regular grid.
2. Identify the green region and retain its largest connected component as the splash. Fill enclosed highlight holes so they do not cut through the geometry.
3. Compute distance from the silhouette edge. Use that distance to taper the mesh into rounded edges. Broad, smoothed image intensity guides the surface relief.
4. Build top and underside quad surfaces and stitch their boundaries into a closed volume. Add smoothing and subdivision modifiers.
5. Add individual ellipsoidal droplets at positions measured from the reference. Add deterministic small air inclusions using random seed 22.
6. Assign a transmissive liquid material with volume absorption; add four studio area lights, an ivory ground, and an orthographic camera.
7. Pack the source image, save the scene, and render a preview.

The generator rebuilds the entire scene and overwrites `lime_liquid.blend` and `preview.png`. Do not rerun it over your only edited copy. To regenerate from the command line:

```sh
blender --background --python create_scene.py
```

Run that command from this folder, or provide the script's absolute path. Blender was not installed at creation time; an official Blender 4.5.6 Apple Silicon disk image was downloaded to a temporary directory and mounted for background generation. That temporary runtime is not part of this project and is not a persistent installation. Use your own Blender installation for future edits.

## Refinement priorities

- Tune surface folds and thickness from oblique views; a single front image cannot determine the exact volume.
- Tune tint, absorption, and light placement together to achieve the desired luminous yellow-green highlights and dark emerald reflections.
- Simplify tiny inclusions and secondary droplets if the logo must remain legible at small sizes.
- For major animation or deformation work, consider a dedicated retopology pass; the current dense grid-derived mesh is intended for static rendering and sculptural refinement.

## Verification and current settings

The saved file was reopened in Blender 4.5.6. Its main mesh contains 81,850 vertices and 81,846 faces, with zero non-manifold edges. The scene includes ten independent floating droplets, 115 small air inclusions, a valid camera, and a packed source image. Cycles produced the included preview at 750 × 750 pixels with 64 samples and denoising (1000 × 1000 resolution at 75%).

The silhouette extraction was refined after the first render to avoid interpreting bright highlights as missing portions of the object. Surface relief was smoothed, thickness increased, and the edge seam repaired and checked. The final appearance is a starting point for further art direction, not a pixel-identical reproduction of the original reflections.
