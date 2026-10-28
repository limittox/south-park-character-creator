# Paper Town Character Creator

A South Park-style character creator. Build a construction-paper version of yourself, your friends or a total stranger, drop them into a scene, and save the photo as a JPEG.

Everything runs in the browser. There's no server and no account, and uploaded photos never leave your device.

## Features

**Character creator**
- About 300 hand-drawn SVG parts across 21 catalogs: 16 skin tones, 6 body types, 5 head shapes (including a flappy-headed Canadian), 19 eyes, 16 mouths, 8 eyebrow styles, 12 one-click moods, noses, face details, facial hair, 25 hairstyles in 16 colours, 29 tops, 13 bottoms, 12 shoes, 14 neckwear items, 38 hats, 14 glasses, 13 face accessories, 24 hand items and 10 sidekick pets.
- A catalog like the ones in the games: pick a group, pick a category, then click an item. Every thumbnail shows that item on *your* character.
- Click any part of the character on the stage (hat, hair, eyes, shirt, shoes...) to jump straight to its catalog.
- Dye clothes, hats and accessories with a paper-colour palette or any custom colour.
- Randomize everything or one category at a time, with undo/redo (Ctrl+Z / Ctrl+Y) and arrow keys to flip through items.
- Custom protest-sign slogans and a name tag that shows your character's name.
- Your character autosaves.

**Photo → Me**
- Upload a selfie (or use the webcam). The app finds your face, then reads your skin tone, hair colour, hair length, facial hair, glasses, smile and shirt colour, and builds a matching character.
- Drag and resize the face oval and every guess updates live. You can also override any trait by hand.
- **Cursed mode** pastes your actual face onto the paper head, with an optional cut-out filter. The jaw drops when you talk.

**Photo Booth**
- 12 original backgrounds: bus stop, Main Street, classroom, cafeteria, living room, frozen pond, a welcome sign with an editable town name, "Down Below", "Up Above", outer space, campfire and a photo studio with a colour of your choice.
- Drag any number of characters around, resize them, flip them, change their moods and give them speech bubbles.
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

The `dist/` folder is plain static files and can be hosted anywhere (GitHub Pages, Netlify, an S3 bucket, a USB stick...).

## How it's built

- React + TypeScript + Vite, no UI framework.
- Every character is layered SVG. Head parts are drawn in a normalized head space and body parts are generated from per-body-type geometry, so every item fits every body type.
- Exports serialize the SVG with the display font inlined, rasterize it on a canvas, and save it as JPEG or PNG.
- Photo analysis runs in plain TypeScript: a YCbCr skin mask finds the face, a second colour-keyed pass trims hair out of it, and region sampling with CIE-Lab colour matching reads the traits. Chrome's built-in `FaceDetector` is used when it's available.

| Path | What's there |
| --- | --- |
| `src/character/` | Geometry, the renderer and all the part drawings |
| `src/data/` | Catalog definitions, palettes, defaults and jokes |
| `src/scenes/` | Photo booth backgrounds and weather |
| `src/lib/` | Photo analysis, export, sharing, storage, sound, speech, undo |
| `src/components/` | UI views and dialogs |

## Disclaimer

An unofficial fan-made toy in the construction-paper cut-out style. All artwork and jokes are original. Not affiliated with or endorsed by anyone who owns a certain quiet little mountain town.
