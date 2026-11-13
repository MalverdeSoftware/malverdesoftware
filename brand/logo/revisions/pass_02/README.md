# Liquid logo — second Blender pass

Revised October 14, 2026 using `../logo_v1.png` as the visual reference. The second pass addresses the pale, shallow appearance of the initial reconstruction: it adds directed folds and rounded lobes, repairs the sampled rim, and uses stronger chartreuse absorption with an emerald studio environment and a broad upper-right softbox.

This is an editable, closed 3D mesh with independent droplets and air inclusions. The photo supplies the outline and the positions of the droplets. It is packed for comparison, and is not projected onto the rendered surface. Depth, folds, and reflections remain an artistic reconstruction from a single view.

## Files

- `lime_liquid.blend`: current editable scene.
- `preview.png`: current 1254 × 1254 Cycles render, 128 samples with adaptive sampling and denoising.
- `create_scene.py`: extracts the outline, builds the closed surface, directs eight broad folds, and assembles the droplets and studio.
- `finish_scene.py`: rounds the rim, adds local curl and lobe accents, and configures the final material and lighting.
- `validate_scene.py`: read-only structural validation.
- `revisions/pass_01/`: untouched copies of the initial scene, preview, generator, and notes.

## Changes in this pass

- Replaced photo-intensity-derived height with broad geometric flow paths, including the central curl, right sweeping shoulder, left returning fold, and lower fall.
- Added local swellings and channels to distinguish rounded lobe ends from their narrower necks.
- Remeshed the surface uniformly and smoothed the meniscus to remove the first version's uneven sampled edge.
- Increased optical depth and separated the bright illumination seen through the liquid from its darker emerald ambient reflections.
- Replaced the scattered bright reflections with one large primary softbox and two quieter fill lights.
- Preserved the reference composition and ten individual droplets; placed six prominent air inclusions from the reference plus smaller deterministic inclusions.
- Retained the source image inside the Blender file and preserved the initial pass separately.

## Editing

The scene was generated and checked in Blender 5.2.2 LTS. Use Blender 5.2 or newer to open this saved version.

1. Select **LIME • sculpted splash** in **01 • Sculpted liquid**. Sculpt Mode or proportional editing can refine the volume. **Optical surface** is an editable subdivision modifier.
2. **02 • Floating droplets** contains the ten independent droplets. **03 • Suspended air** contains 120 inclusions; hide it for a cleaner logo or faster render.
3. Edit **Chartreuse • optical liquid** to change tint, roughness, IOR, or volume absorption. Current IOR is 1.46 and absorption density is 2.5.
4. The World shader contains the studio gradient. Its **Studio gradient direction** vector and color ramp control the bright-to-dark transition visible through the liquid. The ivory background is camera-visible; it is hidden from transmission and glossy rays so the studio environment supplies those optical paths.
5. Move or resize **Key • rounded upper-right softbox** to reshape the main highlights. The left and bottom lights provide subtle fill.
6. **06 • Flow guides (hidden in render)** shows the base fold paths. They are guides, not live geometry modifiers. Change `flow_paths` in `create_scene.py` to regenerate broad forms; edit `FOLD_ACCENTS` and `LOBE_ACCENTS` in `finish_scene.py` for local changes. These coordinates are measured in pixels from the upper-left of the reference.
7. Use the orthographic camera and Cycles for the intended view. The scene uses Standard color management to preserve saturated yellow-green. CPU rendering is selected for portability; a configured GPU can be selected in Blender.
8. For a transparent export, hide **Ivory cyclorama**, enable Film → Transparent, and keep PNG / RGBA output. The studio world still supplies the liquid's reflections and refractions.

## Regeneration

The generator overwrites `lime_liquid.blend` and `preview.png`. Save any manual edits under another name before running it. Keep the source image in its original location next to the `logo` folder.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python create_scene.py -- --samples 128 --resolution 1254
```

Run from this folder, or supply the absolute path to `create_scene.py`. A quicker proof uses `-- --draft` and writes `draft_v2.blend` and `draft_v2.png` instead of the final files.

Validate the saved file with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background lime_liquid.blend --python validate_scene.py
```

The packed source image makes the saved `.blend` self-contained. The external image is required only for regeneration. This is a sculptural reconstruction, not a fluid simulation or animation-ready retopology.

## Verification

The saved revision was reopened in Blender 5.2.2 LTS. The main mesh has 206,402 vertices, 206,400 faces, and zero non-manifold edges. All ten floating droplets, 120 air inclusions, the camera, and the packed reference are present.
