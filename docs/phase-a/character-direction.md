# Raccoon character direction

The target is an expressive urban thief with the anatomy and coat of a real raccoon. The scarf, upright acting, and mischievous expression carry the cartoon style. At gameplay distance, the mask, muzzle, ears, and tail should identify the character before individual hairs are visible.

## What the references teach

| Reference | Decision for Trash Panda Heist |
| --- | --- |
| [University of Texas raccoon skull scan](https://digimorph.geo.utexas.edu/specimens/Procyon_lotor/female/) and [Virginia Department of Wildlife Resources](https://dwr.virginia.gov/wildlife/information/raccoon/) | Preserve a broad skull, a tapered pale muzzle, short ears, a dark eye mask, five-digit paws, and a thick tail with a dark tip. Keep the fur gray-brown with lighter guard hairs. A short eye-to-nose distance keeps the profile recognizable. |
| Framestore’s production notes for [*Guardians of the Galaxy Vol. 2*](https://www.framestore.com/work/guardians-galaxy-vol-2) and [*Vol. 3*](https://www.framestore.com/work/guardians-galaxy-vol-3) | Revisit face shapes and skeleton alongside the groom. Let small changes in the eyes, head angle, and stance carry the expression. Rocket is a reference for the balance of animal anatomy and human-readable acting. |
| [Nintendo’s *Star Fox 64 3D* developer interview](https://iwataasks.nintendo.com/interviews/3ds/starfox/0/2/) | Treat Fox McCloud as a reference for recognizable animal shapes and a clear character silhouette. The developers discuss puppet-like performance, which suggests keeping the expression legible even with a restrained amount of motion. |
| [Disney’s Zootopia production panel](https://media.disneyanimation.com/uploads/production/publication_asset/139/asset/ZootopiaProductionPanel.pdf) and [paper on hierarchical grooming](https://media.disneyanimation.com/uploads/production/publication_asset/175/asset/a13-kaur.pdf) | Shape the coat in regions. Short fur follows the bridge of the nose, longer cheek fur sweeps back, the ears have a separate fringe, and the tail has its own direction and taper. The shape and flow of a group should be readable before adding finer strands. |
| [Disney Animation’s deformer-based facial rig](https://media.disneyanimation.com/uploads/production/publication_asset/97/asset/facial.pdf) | Build expressions from the eyelids, brows, and muzzle. Start with poses the player already sees in the game. The new lids close for a blink, narrow when aiming, and open wider on a fall or hit. |
| [Insomniac’s *Ratchet & Clank: Rift Apart* lighting talk](https://media.gdcvault.com/GDC%2B2022/Speaker%2BSlides/RecalibratingOurLimits_Mullen_Brian.pdf) and [Epic’s groom card guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-cards-and-meshes-for-grooms-in-unreal-engine) | Use the solid coat for the shadow pass. Keep finer strand detail for close views and use textured, weighted cards for the browser. Reserve individual curve strands for Blender review. |

## What changed in the asset

The new skull has orbital hollows, a short tapered muzzle, curved whiskers, rounded ear cups, and copper irises with darker pupils. The silhouette carries more mass at the shoulders and through the tail. Paw fingers, pads, and claws are modeled individually. The arms are sculpted and weighted away from the ribs, then returned to the game's bind pose so the shoulders stay connected and the forearms can move freely.

The Blender generator builds a short directional undercoat and a layer of longer guard hairs. Both inherit the same mask, pale muzzle, and tail bands. The studio uses the [Cycles hair shader](https://docs.blender.org/manual/en/4.5/render/shader_nodes/shader/hair_principled.html) and tapers the curve radii from root to tip.

The **Raccoon · studio** scene in [midnight.blend](../../art/midnight.blend) opens on a posed character with editable curve fur. The body and tail curves in that scene are evaluated in its display pose. The **Midnight Snack · export** scene contains the rigged surfaces and browser groom. In Three.js the body and tail cards inherit the same joint motion as the solid skin. The lower render presets can drop the cards at a distance and retain the colored coat and directional normal map.

## Review the right things

- Use the studio render to judge eye placement, whiskers, and transitions between fur regions. [Blender render](raccoon-studio.jpg)
- See how the mask and coat read under the alley lighting at the same camera angle. [In-game before and after](raccoon-before-after.jpg)
- Check silhouette and deformation at gameplay scale. [Climbing](13-ladder.jpg) · [Slingshot](02-windup.jpg) · [Phone landscape](40-phone-landscape.jpg)

The eyelids cover a few frequent gameplay reactions. In close shots, the far eye can still catch a small highlight along the silhouette. Independent brow and muzzle controls would give the character a wider range of asymmetric expressions. The upright pose also leaves room for a more animal stance with bent hocks and a lower center of gravity.
