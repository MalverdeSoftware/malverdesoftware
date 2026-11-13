# Green slime logo

Open **lime_slime.blend** for the latest sticky slime version. The user's saved **lime_liquid.blend** is preserved unchanged.

## What changed

- Preserved the complete sculpt: the mesh, folds, peaks, silhouette, object transform, and subdivision settings are unchanged.
- Used the saved Layout viewport rotation for the new render camera, retaining the user's sideways viewing direction. The source file's camera was still facing straight down.
- Replaced the clear optical-glass material with a dense, softly translucent green gel and a wet surface coat.
- Added subtle lime-to-leaf-green body color variation, gentle internal scattering, and mild absorption through thicker areas.
- Replaced the harsh green environment with neutral illumination, soft transmitted light, and three area lights arranged to show the folds.
- Used AgX highlight rolloff to reduce clipped white reflections.
- Retained all ten floating droplets. The original air inclusions remain available in their collection but are hidden in this version.
- Retained the ivory floor but hid it for the floating logo composition.

## Files

- `lime_slime.blend`: latest editable slime scene.
- `slime_preview.png`: full-size 1254 × 1254 Cycles render, 128 maximum samples with adaptive sampling and denoising.
- `make_slime.py`: reproducible material, lighting, and camera revision applied to the user's saved scene.
- `slime_validation.json`: verification that the sculpt and subdivision settings were preserved and the new camera uses the saved viewport angle.
- `lime_liquid.blend`: the user's saved earlier glass/liquid scene, unchanged by this revision.
- `logo_v2.png`: the user's sideways render, unchanged.
- `preview.png`: earlier front-facing glass render.
- `create_scene.py` and `finish_scene.py`: earlier reconstruction generators; these rebuild the glass scene and are not needed to open or render the slime version.
- `revisions/pass_01/`: initial reconstruction and preview.
- `revisions/pass_02/README.md`: documentation for the earlier glass reconstruction.

## Viewing and saving pictures

1. In Blender, choose File → Open and open `lime_slime.blend`.
2. Choose Render → Render Image to see the finished material and lighting.
3. In the render window, choose Image → Save As to save a PNG. This does not save changes to the Blender scene.
4. To render a new viewing angle, rotate the viewport, then choose View → Align View → Align Active Camera to View before rendering again.
5. Save exploratory scene changes under a different `.blend` filename if you want to retain them separately.

## Material controls

Select **LIME • sticky slime blob** and edit **Slime • lime gel with wet skin**.

- **Roughness** controls the body gloss; **Coat Roughness** controls the wet sheen.
- **Transmission Weight** controls how much light passes through the body.
- **Subsurface Weight / Scale** control the softness of light inside the gel.
- The **Subtle lime / leaf-green body variation** color ramp sets the green palette.
- The Volume Absorption node controls tint through thicker regions.

The default material uses IOR 1.36, body roughness 0.20, transmission 0.52, subsurface weight 0.12, coat weight 0.28, and coat roughness 0.10. Keep Cycles and AgX for the intended appearance. The saved file is self-contained and was produced with Blender 5.2.2 LTS.

## Reproducing this revision

Run from this folder:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background lime_liquid.blend --python make_slime.py -- --samples 128
```

This reads `lime_liquid.blend` and writes `lime_slime.blend` and `slime_preview.png`. It never saves over the input scene. If you have edited the slime version, save a separate copy before regenerating. Add `--draft` after the final `--` for a smaller proof instead of final output.
