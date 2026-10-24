# Zef's Dino Underwear Quest

A morning ritual for a four-year-old learning to stay dry at night, so he
can wear underwear to bed instead of diapers. Zef wakes up, runs to a
grown-up, and presses one big button himself: the smiling sun for a dry
night, or the heart for a not-dry night. Coach Rex, a big friendly T. rex,
does the rest.

Everything you see is built in code with React Three Fiber and Three.js:
the dinosaurs, the lands, the plants and the effects. The dinosaurs are
sculpted when the game loads: each is one smooth, skinned body blended from
soft shapes (a snout and jaw with teeth, muscled legs, clawed toes, a long
tail, a scaly skin with a banded belly) over the skeleton the animations
drive. Coach Rex's voice is pre-recorded into small audio clips that ship
with the game. The game loads nothing from the internet and makes no AI
calls while it runs.

## The title screen

The game opens like a video game: the name in big letters over a little
stage where Coach Rex stands with every child's dino, each wearing what
they've collected. The very first time there's one big **Start!** button.
After that there's a button for each child ("Zef's adventure!", with a
picture of their dino so a child who can't read yet can find their own) and
**+ Add new child**. Each child has their own dino, stars, prizes, meter
and goal. A small **For grown-ups: how it works** button explains the game
in plain words, for family members who join an adventure someone else set
up (the same explanation is in the parent corner).

## The morning

1. **Tap your adventure.** Coach Rex says good morning.
2. **Press a button.**
   - **Dry!** A big star flies onto the next stepping stone, Zef's dino
     hops onto it, the underwear meter ticks up, and one surprise plays.
     The surprises rotate:
     - a mystery egg (every other star, until he has them all): Zef taps
       it open, the prize floats out big and spinning, and a big
       "Collect!" button puts it on his dino (caps, sunglasses, a
       basketball jersey, a soccer ball, sneakers, a cape and more)
     - in between, ten games take turns:
       - a high five with Coach Rex
       - balloons to pop
       - snack time: Zef taps fruit on a big leaf and it flies into Coach
         Rex's mouth (chomp!), until he burps and says "Excuse me!"
       - a dance party
       - hide and seek: Coach Rex hides behind one of three bushes, and
         the one that wiggles is the giveaway
       - tickle time: tap Coach Rex until he topples over laughing
       - a roar-off
       - the dino band: five glowing rocks each play a note over a drum
         beat while Coach Rex dances
       - fireworks Zef taps into the sky
       - dino moves: Zef stands up and stomps, stretches, wiggles, spins
         or jumps along with Coach Rex, away from the screen
   - **Not dry.** Coach Rex walks over for a big hug ("My arms are tiny,
     but my hugs are huge!"). The underwear meter loses one dot, and every
     star stays.
3. **A joke or a dino fact.** Before saying goodbye, Coach Rex tells a
   silly dino joke one morning (with a pause before the punchline and a
   "ba-dum-tss") and shares a dino fact the next: twelve of each.
4. **See you tomorrow!** A "Watch again" button replays the morning, and a
   purple "Dress up" button opens his dino's wardrobe: everything he's
   collected, to put on (tap) or take off (tap again) himself, with Coach
   Rex reacting to each one. What he picks is what his dino wears on the
   board and the title screen. Until the wardrobe has been opened once on a
   device, the button wiggles and Coach Rex points it out ("Psst! Tap the
   hanger button..."); tapping the "?" in the wardrobe explains that more
   things to wear hide in mystery eggs. One press counts per morning, and
   refreshing never replays or double-counts.

The top of the screen shows the stars so far and how many more until the
next treasure chest ("4 more"), with a little bar filling up toward it.
Tapping it makes Coach Rex say it out loud ("Four more stars to the next
treasure chest!") while the chest sparkles.

Coach Rex has nine ways to say good morning, a dozen cheers for a dry night
(and a special one for every tenth star, up to 100), six goodbyes and ten
things to say when he's tapped, and they rotate, so the mornings don't
sound the same for weeks.

The board's weather follows the seasons: leaves tumble down in the fall,
snow falls in the winter, blossom petals drift in the spring and
butterflies flutter in the summer (the other way round south of the
equator). Every fourth morning, a rainbow arcs across the sky.

Coach Rex's words show as a caption along the bottom, just above whatever
buttons are showing.

## Two things to fill up

- **Stars (the board).** Every dry morning is a star, and stars never go
  away. The board winds through seven lands: Jungle Jumble, Volcano Valley,
  Splashy Lagoon, Fossil Canyon, Snowball Mountain, Crystal Caves and
  Rainbow Meadow. Each land ends at a treasure chest with a real-world
  prize. The first chest is just 5 stars away, the next at 10, then one
  every 15 stars (25, 40, 55, ...). A child who was already past 5 stars
  when the early chest arrived gets that extra chest on their next
  morning. The default prizes are candy, movie night, McDonald's, a
  squishy, candy, and a pizza party, then the list starts over. All of
  them can be edited.
- **The underwear meter.** This has underwear at the top. Every dry night
  adds a dot, and a not-dry night takes only one away (never below empty),
  so a few accidents never undo weeks of work. The last five dots (shown in
  gold) are different: they need five dry nights in a row, and a not-dry
  night there starts those five over, so the meter only fills after five
  dry nights in a row. Coach Rex says so when the child reaches them. When it's full (20 dots by default; a
  grown-up can change the goal), Zef is ready to wear underwear at night. A
  pterodactyl flies him to the Underwear Store, where he picks out
  underwear for his dino, so they both wear underwear at night. Coach Rex
  says the goal's number when it's 3, 5, 10, 15 or 20. A grown-up can
  switch to the classic meter instead, which counts dry nights in a row and
  starts over after a not-dry night. An adventure that began before the
  kinder meter existed gets it from its next morning on (the nights before
  stay as they were counted), so its meter never jumps.

A morning with no record is unknown. It never counts as dry or not dry: it
doesn't add a star and doesn't change the meter.

## A new child

0. The very first time, grown-ups get a short welcome first: what the game
   is for (staying dry at night, so the child can wear underwear to bed
   instead of diapers) and how a morning, the stars, the hug, the prize
   chests and the meter work.
1. A grown-up enters the child's name and picks the goal: how many dry
   nights fill the meter (3, 5, 10, 15 or 20; any other number later in
   the parent corner). Coach Rex says that number in his intro.
2. The child picks their dino (T. rex, triceratops, stegosaurus or
   long-neck) and its color.
3. Coach Rex explains the mission, and the child taps along: stay dry at
   night so you can wear underwear to bed instead of diapers; a star for
   every dry morning (tap the star, and the dino hops onto it); treasure
   chests with prizes along the way (tap one: it's locked until you get
   there); a hug for a not-dry night; the meter (tap it to see what full
   looks like); and the Underwear Store at the end. It finishes with the
   child tapping their dino for their biggest roar. If a tap doesn't come,
   Coach Rex carries on by himself.

The game itself always uses its bright daytime colors; only the parent
corner follows the phone's dark mode.

## Parent corner

Press and hold the moon button (top right), then answer a quick
multiplication question. In the parent corner you can:

- record or correct any morning, with a note on exactly what will change
- see stars, the meter, the best run, the next prize and the last four
  weeks
- set the underwear goal; it shows how long the goal typically takes at
  the recent dry rate
- choose what a not-dry night does to the meter: take one dot off (the
  kinder default, with the last five dots needing dry nights in a row,
  which can be turned off) or start it over (the classic way: dry nights in
  a row). An adventure already under way when the last-five rule arrived
  gets it from its next morning on, so nothing already recorded changes
- edit the prizes and tick off the ones you've handed over
- preview a dry morning, the hug, a prize chest, a surprise (a different
  one each tap), the Underwear Store or the intro, without changing real
  progress
- change the name, dino and color, and turn sound, music and reduced motion
  on or off
- back up and restore (old candy-castle backups bring their nights along)
- see where progress is saved, how to share the game, and switch to
  another child or add one
- start a new quest (keeps the dino), start a child's adventure over from
  the very beginning (the name screen, picking a dino and the intro), or
  remove a child from the game

## Saving and sharing

Inside the claude.ai artifact viewer, every child's adventure is saved in
the page's own online database (one document per child), so it follows the
grown-up's Claude account instead of one phone. Each device also keeps a
copy in the browser, so the game opens instantly and keeps working offline;
the two line up whenever the page is open (every recorded morning from both
is kept, and a child removed on one device is removed on the others).

Who sees what is set by the page's Share menu and the database rules
declared when it's published (only the owner and people at Contributor or
Editor level read or write the adventures):

- **Family** (another parent, a grandparent): invite them by email as an
  Editor. Signed in to Claude, they see the same adventures live and can
  press the morning button on their own phone.
- **Other families**: invite them by email as a Viewer. They can start
  adventures for their own children, which stay on their own device, and
  never see the family's.
- Leave the public link off: while it's on, family invited by email lose
  access to the shared adventures.

Outside the viewer (a saved copy, the dev server) the game saves in the
browser only. An old one-child save from before is brought over as the
first child, and joins the online child of the same name if another device
put them online first.

## Coach Rex's voice

The lines live in `src/voice/lines.ts`. `scripts/voice/generate.py` records
them into `src/voice/clips/` with the open-source Qwen3-TTS model, using its
built-in voice "Ryan" directed like a fun kids' TV host, with a mood for
each kind of line (cheering for dry mornings, gentle for hugs, giggly for
taps). It shortens long pauses and evens out the loudness with ffmpeg.
Every clip is checked before it's kept: a speech recognizer (Whisper) must
hear the right words, and a voice classifier must still hear a man; a clip
that fails is re-recorded. Re-running only re-records lines that changed.
Lines that say "Zef" have name-free twins ("buddy") used if the name is
changed (or call him "big guy": other children are "superstar" or
"buddy"). The intro line about the meter is recorded for goals of 3, 5, 10,
15 and 20 nights, the quick picks on the new-child screen, with a twin
without the number for any other goal, in a version for each kind of
meter. Clips for lines that no longer exist are removed.

To use a different voice, replace the clips with files of the same names.

```sh
pip install qwen-tts torch faster-whisper librosa soundfile
python scripts/voice/generate.py --models <folder with Qwen3-TTS-12Hz-1.7B-CustomVoice/, whisper-small.en/ and optionally agegender/>
```

## Developing

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # progress, save and voice-line tests
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

`/lab.html` (dev server only) shows one dinosaur under studio lights, e.g.
`/lab.html?species=trex&color=0&view=34&outfit=0,1&pants=2`.

`?debug` in the URL exposes a small test API on `window.__dino`. With it
you can seed nights, press the buttons, run previews, and project dinos and
props to screen positions. `?season=winter` (or spring, summer, fall),
`?rainbow` and `?dayshift=1` show other weather, a rainbow, or another
day's lines. The `scripts/dino-*.mjs` files use it with
Playwright to play through the title screen, setup and the tap-along
intro, mornings, chests, the surprises, the wardrobe, the store and the
parent corner. `scripts/dino-sync.mjs` stands in for the
viewer's database to check that two family devices stay in step and that a
Viewer's adventures stay separate.

### Layout

- `src/state`: dates, stars, the meter, prizes, save data, import/export,
  the library of children and how it lines up with the online copy (pure
  and unit tested), plus `cloud.ts`, which talks to the viewer's database
- `src/game`: the director (every morning event), actors, camera, rewards
- `src/dino`: the sculpting kit (`sdf.ts`), skin shader, the sculpted T. rex
  and four-legged dinos, the animator, accessories, underwear
- `src/board`: the lands, path, chests, plants and rocks (`nature.ts`),
  landmarks, sky and lights
- `src/store`: the Underwear Store
- `src/setup`: the title screen's stage and the pick-your-dino stage
- `src/voice`: Coach Rex's lines and the clip player
- `src/audio`: sound effects and music, all synthesized
- `src/ui`: the big buttons, the meter, captions and the parent corner
