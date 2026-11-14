# Midnight Snack graphics review

The raccoon has a sculpted muzzle and eye sockets, movable eyelids, a directional undercoat, and longer guard hairs that follow the skinned body and tail. The Blender scene includes a posed studio view. Three.js binds the exported body and groom to the existing animation joints, so locomotion and hand targets share the same rig. The same library supplies the guard and stocker, apartment facade, instanced fire escapes, dumpster, slingshot, cartons, crates, and representative loot. [Character direction and references](character-direction.md)

## Rebuild the models

Use Blender 4.5 LTS from the repository root.

```sh
blender --background --threads 2 --python-exit-code 1 --python art/generate.py
```

The command updates the editable Blender file and the 4.6 MB runtime GLB. The Blender file has a character studio and an export scene. The raccoon uses two generated textures, a shared strand atlas and a directional normal map. The five groom meshes contribute about 14,000 triangles when shown. The game shares geometry and materials, instances repeating deck sections, and drops the groom as the camera pulls back. The lowest quality tier omits real-time shadow maps and post-processing. All added models and materials were created for this repository. [Blender scene](../../art/midnight.blend) · [Runtime GLB](../../assets/midnight.glb)

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

The character close-up shows the previous Blender raccoon at `9b23f54` and the revised one in the same alley view. [Character comparison](raccoon-before-after.jpg) · [Studio render](raccoon-studio.jpg)

## Validation

`npm run build` passed all 82 browser checks in Chrome, including the empty-handed start, slingshot, guards, keyboard controls, and touch in portrait and landscape. The autoplayer finished all ten games and won eight. The headless test uses a silent native Web Audio sink to exercise game audio independently of the host's speakers.

`node test/shots.mjs` captured 23 frames. On this Windows SwiftShader setup the storyboard sampled about 534 ms per frame at desktop quality 2 and 603 ms at emulated phone quality 0. The phone sample recorded 308 draw calls, 210,840 triangles, and 30 textures. Physical iPhone and iPad Safari performance still needs validation. The stage-specific art pass here covers Midnight Snack.
