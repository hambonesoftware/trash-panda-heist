# Midnight Snack graphics review

The raccoon has a continuous, weighted torso and limbs with separately animated eyes, ears, scarf details, and striped tail. The Blender export contains an armature and vertex weights. Three.js binds the imported body to the existing animation joints, so locomotion, poses, and hand targets share the same animation system. The same library supplies the guard and stocker, apartment facade, instanced fire escapes, dumpster, slingshot, cartons, crates, and representative loot.

## Rebuild the models

Use Blender 4.5 LTS from the repository root.

```sh
blender --background --threads 4 --python-exit-code 1 --python art/generate.py
```

The command updates the editable [Blender scene](../../art/midnight.blend) and the [runtime GLB](../../assets/midnight.glb). The Blender scene has UVs. The roughly 2.2 MB GLB uses authored PBR materials and omits unused texture coordinates and images. The game loads the GLB once, shares geometry and materials, and instances the repeating deck sections. The lowest quality tier omits real-time shadow maps and post-processing. All added models and materials were created for this repository without third-party model or texture assets.

## Playable comparisons

Each pair shows upstream main at `b90e2b2` on the left and the Phase A branch on the right.

| Scene | Comparison |
| --- | --- |
| Roaming | [Raccoon and facade](10-maze-run.jpg) |
| Ladder | [Climb](13-ladder.jpg) |
| Hiding | [Hide from the guard](18-hide-in-can.jpg) |
| Slingshot | [Windup](02-windup.jpg) |
| Destruction | [Projectile impact](03b-impact.jpg) |
| Guard | [Chase](16-guard-chase.jpg) |
| Mobile | [Phone landscape](40-phone-landscape.jpg) |

Run `npm run build` for syntax, maze, desktop, touch, and ten-game autoplay checks. Run `node test/shots.mjs` for the storyboard and local frame-time samples. The browser test uses Chromium with SwiftShader. iPhone and iPad Safari performance still needs physical-device validation. The stage-specific art pass here covers Midnight Snack.
