# Paper Town Character Creator

A South Park-style character creator. Build a construction-paper version of yourself, your friends or a total stranger, drop them into a scene, and save the photo as a JPEG.

Everything runs in the browser. There's no server and no account, and uploaded photos never leave your device.

**Play it:** https://limittox.github.io/south-park-character-creator/

## The look

The art follows the show's construction-paper style. Proportions were measured pixel by pixel from reference stills, then checked side by side against 20 of the show's characters and every scene that has a counterpart in the show. Nothing is traced or copied from the show's artwork:

- Flat cut-out shapes with no black outlines. Only interior lines (mouths, arm creases, seams) are inked.
- Kids are a near-round head on a stubby body with a sliver of trousers and flat shoes. Grown-ups have smaller heads on long bodies and stand about one and a half kids tall.
- Big white eyes that lean in at the top, meet in the middle and tuck under hat brims, with tiny dot pupils and a small mouth down near the chin.
- Characters turn by sliding the face across the head, and walk with a stop-motion hop.
- Scenes were laid out and coloured side by side with stills from the show: a flat pale-blue sky, dark green mountains with soft snow caps, pines buried in lumpy snow, the bus stop's yellow crossing sign, Main Street's low shopfronts across the road, the classroom's lime walls, the cafeteria's greys and the living room's aqua walls and green carpet. Props get thin edges in a darker shade of their own colour; nature and characters get none. Nobody casts a shadow.

## Features

**Character creator**
- About 300 hand-drawn SVG parts across 21 catalogs: 16 skin tones, 7 body types, 5 head shapes (including a flappy-headed Canadian), 19 eyes, 16 mouths, 8 eyebrow styles, 12 one-click moods, noses, face details, facial hair, 25 hairstyles in 16 colours, 30 tops, 13 bottoms, 13 shoes, 14 neckwear items, 38 hats, 14 glasses, 13 face accessories, 24 hand items and 10 sidekick pets.
- A catalog like the ones in the games: pick a group, pick a category, then click an item. Every thumbnail shows that item on *your* character.
- Click any part of the character on the stage (hat, hair, eyes, shirt, shoes...) to jump straight to its catalog.
- Dye clothes, hats and accessories with a paper-colour palette or any custom colour.
- Randomize everything or one category at a time, with undo/redo (Ctrl+Z / Ctrl+Y) and arrow keys to flip through items.
- Turn your character's head, or send them hopping back and forth across the stage.
- Custom protest-sign slogans and a name tag that shows your character's name.
- Your character autosaves.

**Photo → Me**
- Upload a selfie (or use the webcam). An on-device face scanner places 478 landmarks on your face and labels every pixel as hair, skin, clothes or accessories. From that it picks your hairstyle (from length, volume, fringe and shape), hair colour, skin tone, beard or moustache, glasses, expression, hat and shirt colour, and builds a matching character.
- Each guess says why it was made ("past the shoulders", "chin and lip only"), offers the exact measured colour next to the paper palette, and can be changed from the full catalog.
- **Show what the scanner sees** paints the detected hair, skin, clothes and landmarks over your photo. With several people in the shot, pick a face or drag the oval onto one.
- **Cursed mode** pastes your actual face onto the paper head, with an optional cut-out filter. The jaw drops when you talk.

**Photo Booth**
- 13 original backgrounds: bus stop, Main Street, classroom, cafeteria, living room, frozen pond, a welcome sign with an editable town name, "Down Below", "Up Above", a red planet in outer space, campfire, a TV news desk your cast sits behind, and a photo studio with a colour of your choice.
- Drag any number of characters around (they hop along, facing the way they're going), resize them, flip them, point their faces left or right, change their moods and give them speech bubbles.
- Weather (snow, confetti, hearts, a snack storm), captions, and frames: an instant photo or the front page of *The Paper Town Times*.
- A 3-2-1 countdown ("Say 'butts'!"), a camera flash, then a 1600×1000 JPEG to save or share.

**Extras**
- **Talk:** type a line and your character says it out loud (Web Speech API) with a flapping mouth and the classic cut-out bob. Hoods muffle everything into "Mmmph mmph!"
- **Crew:** save characters, clone or delete them, export and import the crew as a file, and pick a few for a group photo.
- **Official Town ID card:** generated title, stats (Swear Power, Snack Capacity, Survival Odds...), "known for", likes and dislikes, all downloadable as a JPEG.
- **Share links** that rebuild your character for anyone who opens them, plus transparent PNG stickers.
- A town-news ticker that reports on your fashion choices, poke reactions, synthesized sound effects (including a "pull my finger" button) and a mute toggle.
- A responsive layout. On phones the stage and catalog tabs stay pinned while you scroll the items.

## Running it

```bash
npm install
npm run dev        # http://localhost:5199
npm test           # unit tests (Vitest)
npm run build      # static site in dist/
```

The `dist/` folder is plain static files and can be hosted anywhere (GitHub Pages, Netlify, an S3 bucket, a USB stick...). Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).

## How it's built

- React + TypeScript + Vite, no UI framework.
- Every character is layered SVG. Head parts are drawn in a normalized head space and body parts are generated from per-body-type geometry, so every item fits every body type.
- The flat show style is one CSS rule (`src/character/flat.ts`) that strips the ink outline from every filled shape inside a character or scene, on screen and in exports.
- Exports serialize the SVG with the display font inlined, rasterize it on a canvas, and save it as JPEG or PNG.
- The photo scanner (`src/lib/faceScan.ts`) uses Google's [MediaPipe](https://ai.google.dev/edge/mediapipe) face landmarker and multiclass selfie segmenter, running in WebAssembly on the device. The models (about 20 MB) are downloaded once from Google's model storage and kept in the browser's cache; photos never leave the device.
- `src/lib/faceTraits.ts` turns landmarks and pixel labels into traits in a head-tilt-free face coordinate system. Hairstyles come from the hair mask's shape; beards, which the segmenter calls "face", are found by their grain against the smooth cheeks; glasses by the frame across the nose bridge; skin tone by the Individual Typology Angle; colours are corrected for the light using the whites of the eyes. The thresholds were tuned on public-domain studio portraits.
- If the scanner can't load (offline), the converter falls back to a plain colour guess: a YCbCr skin mask finds the face and CIE-Lab colour matching reads the traits.

| Path | What's there |
| --- | --- |
| `src/character/` | Geometry, the renderer and all the part drawings |
| `src/data/` | Catalog definitions, palettes, defaults and jokes |
| `src/scenes/` | Photo booth backgrounds and weather |
| `src/lib/` | Photo analysis, export, sharing, storage, sound, speech, undo |
| `src/components/` | UI views and dialogs |

## Disclaimer

An unofficial fan-made toy in the construction-paper cut-out style. All artwork and jokes are original. Not affiliated with or endorsed by anyone who owns a certain quiet little mountain town.
