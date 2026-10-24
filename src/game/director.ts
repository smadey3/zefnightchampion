// The director runs every moment of the morning ritual:
//
//   title screen (whose adventure?) -> greeting -> the two big buttons
//   -> a celebration or a hug -> see you tomorrow
//
// A dry morning: a star flies to the next stone, Zef's dino hops onto it, the
// underwear meter ticks up and one surprise plays (an egg with a new
// accessory, or one of ten little games with Coach Rex). Reaching the end of a
// land opens a prize chest; filling the meter opens the Underwear Store.
// A wet morning: Coach Rex walks over for a big hug, the meter loses a dot,
// and every star stays. Every morning ends with a joke or a dino fact.
//
// Progress comes only from the save; the director compares it with what the
// child has already seen, so refreshes never replay or double-count.

import * as THREE from 'three';
import { Cancelled, cam, clock, coach, hero, play, type DinoAction, type DinoActor } from './actors';
import { motion } from './settings';
import { bus } from './bus';
import { sfx } from '../audio/sfx';
import { music } from '../audio/music';
import { unlockAudio, voiceLevel } from '../audio/core';
import { burst } from '../three/Particles';
import { useGame, useSave, type PreviewKind } from '../state/store';
import { computeQuest, finalStretch, landOf, landRange, prizesEarned, todayKey, type DateKey, type QuestState } from '../state/progress';
import { ACCESSORIES, accessoriesUnlocked, accessoryForStar, prizeAt, resolveOutfit, surpriseFor, type Prize, type Species } from './rewards';
import { chestPos, groundHeight, landCurve, restPos, spacePos, storeLandmarkPos } from '../board/layout';
import { chestAnim, onChestTap } from '../board/Chest';
import {
  FRUIT,
  MAX_BALLOONS,
  ROCK_COLORS,
  flyStar,
  fx,
  launchFirework,
  onBalloonTap,
  onBushTap,
  onEggTap,
  onFruitTap,
  onHandTap,
  onIntroStarTap,
  onPrizeTap,
  onRockTap,
  onSkyTap,
} from '../board/EventProps';
import { pedestalHeight, pedestalPos, STORE_ORIGIN } from '../store/StoreScene';
import { lineup } from '../setup/SetupStage';
import { voice } from '../voice/voice';
import { MAX_CHEST_GAP, lineText } from '../voice/lines';
import { boardView } from './CameraRig';
import { clamp, ease, TAU } from '../three/util';

interface Ctx {
  wait: (s: number) => Promise<void>;
  until: (test: () => boolean, timeout?: number) => Promise<void>;
  alive: () => boolean;
}

let seq = 0;
let current: { id: number; cancelled: boolean } | null = null;

export function cancelCutscene() {
  if (current) current.cancelled = true;
  current = null;
  voice.stop();
  useGame.getState().set({ cutscene: null, caption: null, awaiting: null, dressUp: false });
}

async function runCutscene(name: string, fn: (ctx: Ctx) => Promise<void>) {
  if (current) current.cancelled = true;
  const me = { id: ++seq, cancelled: false };
  current = me;
  useGame.getState().set({ cutscene: name, dressUp: false });
  const ctx: Ctx = {
    wait: async (s) => {
      await clock.wait(s);
      if (me.cancelled) throw new Cancelled();
    },
    until: async (test, timeout = 30) => {
      await clock.until(() => me.cancelled || test(), timeout);
      if (me.cancelled) throw new Cancelled();
    },
    alive: () => !me.cancelled,
  };
  try {
    await fn(ctx);
  } catch (e) {
    if (!(e instanceof Cancelled)) console.error(e);
  } finally {
    if (current === me) {
      current = null;
      useGame.getState().set({ cutscene: null, caption: null, awaiting: null });
    }
  }
}

// ------------------------------------------------------------ helpers

function data() {
  return useSave.getState().data;
}

function quest(): QuestState {
  const d = data();
  return computeQuest(d.records, d.rules);
}

function childName() {
  return data().profile.name || 'Zef';
}

function goal() {
  return data().rules.goal;
}

/** Today as a day count, so lines that rotate daily change every morning. */
/** Test hook (`?dayshift=1` with `?debug`): pretend it's another day, to hear other lines. */
export const dayShift = { days: 0 };

function dayIndex(): number {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000) + dayShift.days;
}

const GREETINGS = ['greet-1', 'greet-2', 'greet-3', 'greet-4', 'greet-5', 'greet-6', 'greet-7', 'greet-8', 'greet-9'];
const DRY_CHEERS = ['dry-1', 'dry-2', 'dry-3', 'dry-4', 'dry-5', 'dry-6', 'dry-7', 'dry-8', 'dry-9', 'dry-10', 'dry-11', 'dry-12'];
const GOODBYES = ['bye-1', 'bye-2', 'bye-3', 'bye-4', 'bye-5', 'bye-6'];

/**
 * The dry-night cheer for star `n`: every tenth star up to 100 has its own,
 * and the rest take turns, so they don't repeat for 12 mornings.
 */
function dryCheer(n: number): string {
  if (n >= 10 && n <= 100 && n % 10 === 0) return `stars-${n}`;
  return DRY_CHEERS[Math.max(0, n - 1) % DRY_CHEERS.length];
}

const JOKES = 12;
const FACTS = 12;

/** Today's little extra before the goodbye: a joke one day, a dino fact the next. */
function todaysExtra(): string[] {
  const day = dayIndex();
  const k = Math.floor(day / 2);
  if (day % 2 === 0) {
    const j = (k % JOKES) + 1;
    return [`joke-time-${(k % 2) + 1}`, `joke-${j}-q`, `joke-${j}-a`];
  }
  return [`fact-time-${(k % 2) + 1}`, `fact-${(k % FACTS) + 1}`];
}

function prefetch(ids: string[]) {
  voice.prefetch(ids, childName(), goal());
}

/** Say a line: caption on screen, Coach Rex's jaw moving, wait until it's said. */
async function say(ctx: Ctx, id: string, pad = 0.25) {
  const g = useGame.getState();
  const text = lineText(id, childName(), goal());
  g.set({ caption: { text, who: 'coach' } });
  const dur = await voice.say(id, childName(), data().settings.sound, goal());
  const end = clock.time + dur;
  await ctx.until(() => clock.time >= end, dur + 2);
  if (useGame.getState().caption?.text === text) useGame.getState().set({ caption: null });
  await ctx.wait(pad);
}

/** Start a line without waiting for it to finish. */
function sayAsync(id: string) {
  const text = lineText(id, childName(), goal());
  useGame.getState().set({ caption: { text, who: 'coach' } });
  void voice.say(id, childName(), data().settings.sound, goal()).then((dur) => {
    setTimeout(() => {
      if (useGame.getState().caption?.text === text) useGame.getState().set({ caption: null });
    }, dur * 1000 + 200);
  });
}

/**
 * Per-frame: the coach's jaw follows the voice. The loudness goes through a
 * soft curve (quiet breaths keep the mouth closed, loud words don't slam it
 * wide open) and then opens quickly and closes a little slower, so the mouth
 * moves with the words instead of flickering with every wobble of the sound.
 */
export function updateTalk(dt: number) {
  const lvl = voice.speaking() ? voiceLevel() : 0;
  const target = Math.pow(clamp((lvl - 0.08) / 0.8, 0, 1), 0.75);
  const tau = target > coach.talk ? 0.045 : 0.13;
  coach.talk += (target - coach.talk) * (1 - Math.exp(-dt / tau));
}

function shot(pos: THREE.Vector3, target: THREE.Vector3, lambda = 2.2, fit = 0) {
  cam.mode = 'shot';
  cam.pos.copy(pos);
  cam.target.copy(target);
  cam.lambda = motion.reduced ? 6 : lambda;
  cam.fitWidth = fit;
}

function boardCamera(lambda = 2.2) {
  cam.mode = 'board';
  cam.lambda = lambda;
  cam.fitWidth = 0;
}

/** A close shot of Zef's dino and the coach from the board camera's side. */
function closeShot(lambda = 2.4) {
  const back = new THREE.Vector3().subVectors(cameraPos(), hero.pos).setY(0).normalize();
  const side = new THREE.Vector3(-back.z, 0, back.x);
  const mid = hero.pos.clone().lerp(coach.pos, 0.45);
  shot(mid.clone().addScaledVector(back, 4.2).addScaledVector(side, 0.2).setY(mid.y + 1.8), mid.clone().setY(mid.y + 0.85), lambda, 4.4);
}

function cameraPos(): THREE.Vector3 {
  const c = (window as unknown as { __camera?: THREE.Camera }).__camera;
  return c ? c.position.clone() : hero.pos.clone().add(new THREE.Vector3(0, 5, 7));
}

function faceCamera(a: DinoActor) {
  const c = cameraPos();
  a.heading = Math.atan2(c.x - a.pos.x, c.z - a.pos.z);
}

function faceEachOther() {
  hero.heading = Math.atan2(coach.pos.x - hero.pos.x, coach.pos.z - hero.pos.z);
  coach.heading = Math.atan2(hero.pos.x - coach.pos.x, hero.pos.z - coach.pos.z);
}

/** The board camera's forward direction at a board position (same rule as the camera rig). */
function boardFwd(stars: number): THREE.Vector3 {
  const rules = data().rules;
  const anchor = restPos(stars, rules);
  const end = landRange(landOf(stars, rules), rules).end;
  const ahead = spacePos(Math.min(stars + 4, end), rules);
  const f = ahead.clone().sub(anchor).setY(0);
  if (f.lengthSq() < 0.01) f.set(0, 0, -1);
  return f.normalize().lerp(new THREE.Vector3(0, 0, -1), 0.55).normalize();
}

/** Where Coach Rex stands: beside Zef's dino as the camera sees it, away from the next stone. */
function coachSpot(stars: number): THREE.Vector3 {
  const rules = data().rules;
  const p = restPos(stars, rules);
  const f = boardFwd(stars);
  const right = new THREE.Vector3(-f.z, 0, f.x);
  const next = spacePos(stars + 1, rules);
  const side = next.clone().sub(p).dot(right) > 0 ? -1 : 1;
  return p.clone().addScaledVector(right, 1.8 * side).addScaledVector(f, 0.6).setY(p.y - 0.12);
}

function placeAt(stars: number) {
  const rules = data().rules;
  hero.pos.copy(restPos(stars, rules)).setY(restPos(stars, rules).y - 0.12);
  coach.pos.copy(coachSpot(stars));
  hero.air = 0;
  hero.visible = true;
  coach.visible = true;
  hero.scale = 1;
  coach.scale = 1.75;
  boardView.anchor.copy(hero.pos);
  faceCamera(hero);
  faceCamera(coach);
}

async function hopTo(ctx: Ctx, a: DinoActor, to: THREE.Vector3, dur = 0.6, height = 0.9) {
  const from = a.pos.clone();
  a.heading = Math.atan2(to.x - from.x, to.z - from.z);
  // anticipation squash
  a.stretch = 0.82;
  await ctx.wait(0.12);
  sfx.play('hop');
  const start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / dur, 0, 1);
    a.pos.lerpVectors(from, to, ease.inOutSine(u));
    a.air = Math.sin(u * Math.PI) * height;
    a.stretch = 1 + Math.sin(u * Math.PI) * 0.12;
    if (u >= 1) break;
  }
  a.air = 0;
  a.stretch = 0.8;
  sfx.play('land');
  burst('puff', a.pos.clone().setY(a.pos.y + 0.1), { count: 5, colors: ['#ffffff', '#f1f3f5'], size: 0.18, up: 0.3 });
  await ctx.wait(0.12);
  a.stretch = 1;
}

async function walkTo(ctx: Ctx, a: DinoActor, to: THREE.Vector3, speed = 2.2) {
  const from = a.pos.clone();
  const dist = from.distanceTo(to);
  if (dist < 0.05) return;
  a.heading = Math.atan2(to.x - from.x, to.z - from.z);
  a.walk = 1;
  const dur = dist / speed;
  const start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / dur, 0, 1);
    a.pos.lerpVectors(from, to, u);
    if (u >= 1) break;
  }
  a.walk = 0;
}

/** Wait for the child to tap something (or for a friendly timeout). */
async function awaitTap(ctx: Ctx, kind: NonNullable<ReturnType<typeof useGame.getState>['awaiting']>, timeout: number, register: (fn: () => void) => void): Promise<boolean> {
  let tapped = false;
  register(() => {
    tapped = true;
  });
  useGame.getState().set({ awaiting: kind });
  await ctx.until(() => tapped, timeout);
  register(() => undefined);
  useGame.getState().set({ awaiting: null });
  return tapped;
}

function today() {
  return todayKey();
}

// ------------------------------------------------------------ boot & phases

/** Line the board up with what the current child has already seen. */
function syncBoard() {
  const d = data();
  const q = computeQuest(d.records, d.rules);
  const shown = Math.min(d.seen.stars, q.stars);
  useGame.getState().set({
    shownStars: shown,
    shownMeter: q.latest?.result === 'wet' && q.latest.date !== d.seen.hugDate ? d.seen.meter : Math.min(d.seen.meter, q.meter),
    shownAccessories: accessoriesUnlocked(shown),
    openedChests: Math.min(d.seen.prizes, q.prizes),
    showUnderpants: d.seen.underpants,
    land: landOf(shown, d.rules),
  });
  for (const a of [hero, coach]) {
    a.action.name = 'none';
    a.expression = 'smile';
    a.look = null;
    a.visible = true;
  }
  placeAt(shown);
  boardCamera();
  cam.snap = true;
}

/** Put away anything a moment left out (props, the chest, the store visit). */
function clearProps() {
  Object.assign(chestAnim, { land: -1, open: 0, rise: 0, wiggle: 0 });
  fx.egg.visible = false;
  fx.prize.visible = false;
  fx.balloons.active = false;
  fx.bushes.active = false;
  fx.rockets.length = 0;
  onBalloonTap(null);
  onBushTap(null);
  onSkyTap(null);
  fx.introStar.visible = false;
  onIntroStarTap(null);
  meterTap = null;
  introRoarTap = null;
  fx.hand.visible = false;
  fx.ptero.visible = false;
  fx.star.active = false;
  fx.fruit.active = false;
  fx.rocks.active = false;
  onFruitTap(null);
  onRockTap(null);
  tickleTap = null;
  dancing = false;
  roaring = false;
  music.setMood('play');
  // and what a moment cut short leaves on the dinos: a look at the sky, a squash, a jump, an open mouth
  for (const a of [hero, coach]) {
    a.look = null;
    a.stretch = 1;
    a.air = 0;
    a.expression = 'smile';
  }
}

/** The game always opens on the title screen. */
export function boot() {
  showTitle();
}

/** The title screen: the cast on stage, the name of the game, whose adventure. */
export function showTitle() {
  cancelCutscene();
  previewRestore = null;
  clearProps();
  music.setMood('play');
  // a child someone started adding but never named isn't kept
  const save = useSave.getState();
  for (const [id, c] of Object.entries(save.library.children)) {
    if (!c.data.profile.name.trim() && !c.data.profile.setupDone && Object.keys(c.data.records).length === 0) save.removeChild(id);
  }
  useGame.getState().set({ phase: 'title', scene: 'title', setupStep: null, setupBack: false, preview: null, parentOpen: false, fade: 0, highlight: null, previewUnderpants: null, dressUp: false, dressHint: false });
  titleCamera();
}

function titleCamera() {
  const o = new THREE.Vector3(0, 0, -800);
  shot(o.clone().add(new THREE.Vector3(0, 2.3, 7.6)), o.clone().add(new THREE.Vector3(0, 1.05, -0.4)), 3, 6.2);
  cam.snap = true;
}

/** A child's button on the title screen: wake the sound and start their morning. */
export function playChild(id: string) {
  const g = useGame.getState();
  if (g.phase !== 'title' || !g.ready) return;
  unlockAudio();
  if (data().settings.music) music.start();
  sfx.play('tap');
  useSave.getState().selectChild(id);
  if (!data().profile.setupDone) {
    beginSetup(true);
    return;
  }
  g.set({ phase: 'event' });
  startMorning(true);
}

/**
 * "Add new child" (or "Start" the very first time): set up a new adventure.
 * The very first time, grown-ups get a short welcome saying what the game is for.
 */
export function addChildFromTitle() {
  const g = useGame.getState();
  if (g.phase !== 'title' || !g.ready) return;
  unlockAudio();
  if (data().settings.music) music.start();
  sfx.play('tap');
  const first = !Object.values(useSave.getState().library.children).some((c) => c.data.profile.name.trim());
  useSave.getState().addChild();
  beginSetup(true, first);
}

/** From the grown-ups' welcome to the name screen. */
export function setupWelcomeDone() {
  if (useGame.getState().setupStep !== 'welcome') return;
  sfx.play('tap');
  useGame.getState().set({ setupStep: 'name' });
}

/** Back from the welcome or the name screen to the title (a child nobody has named yet isn't kept). */
export function setupBack() {
  const g = useGame.getState();
  if ((g.setupStep !== 'name' && g.setupStep !== 'welcome') || !g.setupBack) return;
  showTitle();
}

function beginSetup(canGoBack: boolean, welcome = false) {
  useGame
    .getState()
    .set({ phase: 'setup', scene: 'setup', setupStep: welcome ? 'welcome' : 'name', setupBack: canGoBack, preview: null, parentOpen: false, fade: 0, highlight: null, howItWorks: false, dressUp: false });
  setupCamera();
}

/** Say good morning, then ask (or play what's new). From the title, the board fades in first. */
function startMorning(fromTitle = false) {
  const g = useGame.getState();
  void runCutscene('greet', async (ctx) => {
    if (fromTitle) {
      g.set({ fade: 1 });
      await ctx.wait(0.45);
      syncBoard();
      g.set({ scene: 'board' });
      await ctx.wait(0.5);
      g.set({ fade: 0 });
    }
    // (read it fresh: syncBoard just set where this child's dino is)
    placeAt(useGame.getState().shownStars);
    play(hero, 'stretch', 1.8);
    play(coach, 'wave', 1.6);
    closeShot(2);
    const greeting = GREETINGS[dayIndex() % GREETINGS.length];
    prefetch(['ask', 'already', greeting]);
    await say(ctx, greeting);
    if (hasPending()) {
      await playPending(ctx);
      return;
    }
    if (data().records[today()]) {
      await say(ctx, 'already');
      finishMorning();
      return;
    }
    boardCamera();
    useGame.getState().set({ phase: 'ask' });
    await say(ctx, 'ask');
  });
}

function finishMorning() {
  boardCamera(1.8);
  placeAt(useGame.getState().shownStars);
  const done = !!data().records[today()];
  // until the wardrobe has been opened once, the hanger wiggles and Coach Rex points it out
  const hint = done && useGame.getState().shownAccessories > 0 && !dressUpOpened();
  useGame.getState().set({ phase: done ? 'done' : 'ask', caption: null, dressHint: hint });
  if (hint) {
    setTimeout(() => {
      const g = useGame.getState();
      if (g.phase === 'done' && g.dressHint && !g.cutscene && !g.dressUp && !g.preview) sayAsync('wardrobe-hint');
    }, 900);
  }
}

/** True when the save holds something the child hasn't seen yet. */
function hasPending(): boolean {
  const d = data();
  const q = computeQuest(d.records, d.rules);
  if (q.stars > d.seen.stars) return true;
  if (q.prizes > d.seen.prizes) return true;
  if (d.underpants.earned && !d.seen.underpants) return true;
  if (q.latest?.result === 'wet' && q.latest.date !== d.seen.hugDate) return true;
  return false;
}

// ------------------------------------------------------------ the buttons

export function pressDry() {
  press('dry');
}

export function pressWet() {
  press('wet');
}

function press(result: 'dry' | 'wet') {
  const g = useGame.getState();
  if (g.phase !== 'ask' || g.preview) return;
  unlockAudio();
  if (data().settings.music) music.start();
  if (data().records[today()]) {
    g.set({ phase: 'done' });
    return;
  }
  g.set({ phase: 'event', caption: null });
  voice.stop();
  sfx.play('tap');
  useSave.getState().record(today(), result);
  void runCutscene(result === 'dry' ? 'dry' : 'wet', (ctx) => playPending(ctx));
}

/** Called after the parent corner closes or on boot: play anything new. */
export function checkProgress() {
  const g = useGame.getState();
  if (!g.ready || g.parentOpen || g.preview || g.cutscene) return;
  if (g.phase !== 'ask' && g.phase !== 'done') return;
  syncCorrections();
  if (!hasPending()) {
    const has = !!data().records[today()];
    if (g.phase === 'ask' && has) g.set({ phase: 'done' });
    if (g.phase === 'done' && !has) {
      putAwayWardrobe();
      g.set({ phase: 'ask' });
    }
    return;
  }
  putAwayWardrobe();
  g.set({ phase: 'event' });
  void runCutscene('pending', (ctx) => playPending(ctx));
}

/** A grown-up's correction lowered things: settle quietly, never "taking away" on screen. */
function syncCorrections() {
  const d = data();
  const q = computeQuest(d.records, d.rules);
  const g = useGame.getState();
  const patch: Partial<typeof d.seen> = {};
  if (q.stars < d.seen.stars) patch.stars = q.stars;
  if (q.prizes < d.seen.prizes) patch.prizes = q.prizes;
  if (Object.keys(patch).length) {
    useSave.getState().markSeen(patch);
    const shown = Math.min(g.shownStars, q.stars);
    g.set({ shownStars: shown, shownAccessories: accessoriesUnlocked(shown), openedChests: Math.min(g.openedChests, q.prizes), land: landOf(shown, d.rules) });
    placeAt(shown);
  }
  const latestWetUnseen = q.latest?.result === 'wet' && q.latest.date !== d.seen.hugDate;
  if (!latestWetUnseen && q.meter !== g.shownMeter && q.stars <= d.seen.stars) {
    g.set({ shownMeter: q.meter });
    useSave.getState().markSeen({ meter: q.meter });
  }
}

// ------------------------------------------------------------ the pipeline

async function playPending(ctx: Ctx) {
  const d = data();
  const q = computeQuest(d.records, d.rules);
  const g = useGame.getState();
  const latestDry = q.latest?.result === 'dry';
  prefetch([dryCheer(q.stars), 'first-star', 'wet-1', 'wet-4', 'wet-5', 'wet-2', 'wet-3', 'wet-3-kind', 'wet-3-final', ...todaysExtra(), GOODBYES[dayIndex() % GOODBYES.length]]);

  // 1. a chest the child is already past but hasn't opened (the prize schedule
  //    gained one): open the one just behind them, and settle older ones quietly
  const passed = Math.min(q.prizes, prizesEarned(g.shownStars, d.rules));
  for (let land = d.seen.prizes; land < passed; land++) {
    if (land >= landOf(g.shownStars, d.rules) - 1) {
      await openChest(ctx, land, false);
    } else {
      useSave.getState().markSeen({ prizes: land + 1 });
      useGame.getState().set({ openedChests: Math.max(useGame.getState().openedChests, land + 1) });
    }
  }

  // 1b. new stars
  if (q.stars > g.shownStars) {
    await celebrateStars(ctx, g.shownStars, q.stars, latestDry);
  }

  // 2. the meter catches up (dry) — a wet night's dot comes off during the hug
  const after = quest();
  const { floor } = finalStretch(data().rules);
  if (latestDry && after.missedRestart?.on === after.latest?.date && useGame.getState().shownMeter > floor) {
    await lastDotsOver(ctx, floor);
  }
  if (latestDry && after.meter !== useGame.getState().shownMeter) {
    await meterUp(ctx, useGame.getState().shownMeter, after.meter, data().rules.goal);
  }

  // 3. the surprise for today's star
  if (q.stars > d.seen.stars && latestDry) {
    await surprise(ctx, q.stars, false);
  }
  useSave.getState().markSeen({ stars: q.stars, meter: latestDry ? after.meter : data().seen.meter });

  // 4. the Underpants Store
  if (data().underpants.earned && !data().seen.underpants) {
    await storeVisit(ctx, false);
  }

  // 5. a hug for a wet morning
  const q2 = quest();
  if (q2.latest?.result === 'wet' && q2.latest.date !== data().seen.hugDate) {
    await hug(ctx, false);
    useSave.getState().markSeen({ hugDate: q2.latest.date, meter: q2.meter });
  }

  // 6. see you tomorrow
  await goodbye(ctx);
}

async function celebrateStars(ctx: Ctx, from: number, to: number, cheer: boolean) {
  const rules = data().rules;
  const g = useGame.getState();
  closeShot(2);
  if (cheer) {
    play(hero, 'cheer', 1.6);
    play(coach, 'cheer', 1.6);
    hero.expression = 'happy';
    sfx.play('fanfare');
    burst('confetti', hero.pos.clone().setY(hero.pos.y + 1.4), { count: 40 });
    await say(ctx, to === 1 ? 'first-star' : dryCheer(to), 0.1);
  }
  for (let s = from + 1; s <= to; s++) {
    const quick = s < to;
    boardCamera(2.4);
    const r = landRange(landOf(s - 1, rules), rules);
    const atChest = s === r.end;
    const target = spacePos(s, rules);
    await ctx.wait(quick ? 0.1 : 0.3);
    await flyStar(target);
    if (!ctx.alive()) return;
    useGame.getState().set({ shownStars: s });
    bus.emit('star', s);
    // hop onto the new stone (or up to the chest), coach strolls along
    const land = target.clone().setY(target.y - 0.12);
    if (atChest) {
      const prev = spacePos(s - 1, rules);
      land.add(prev.clone().sub(target).setY(0).normalize().multiplyScalar(1.15));
    }
    const walking = walkTo(ctx, coach, atChest ? land.clone().add(coachSpot(s - 1).sub(spacePos(s - 1, rules)).setY(0)) : coachSpot(s), 3);
    await hopTo(ctx, hero, land, quick ? 0.45 : 0.6);
    await walking;
    if (atChest) {
      await openChest(ctx, landOf(s - 1, rules), false);
      await crossBridge(ctx, landOf(s - 1, rules));
    }
  }
  faceCamera(hero);
  faceCamera(coach);
  hero.expression = 'smile';
  g.set({ land: landOf(to, rules) });
}

/** A morning nobody recorded in the last dots: they come off gently and start over, then today's dot goes on. */
async function lastDotsOver(ctx: Ctx, floor: number) {
  const g = useGame.getState();
  faceCamera(hero);
  faceCamera(coach);
  for (let m = g.shownMeter; m > floor; m--) {
    g.set({ shownMeter: m - 1 });
    await ctx.wait(0.18);
  }
  sfx.play('sparkle');
  await say(ctx, floor > 0 ? 'meter-missed' : 'meter-missed-all', 0.2);
}

async function meterUp(ctx: Ctx, from: number, to: number, goal: number) {
  const g = useGame.getState();
  if (to < from) {
    g.set({ shownMeter: to });
    return;
  }
  for (let m = from + 1; m <= to; m++) {
    g.set({ shownMeter: m });
    sfx.play('tick', Math.min(9, Math.round((m / goal) * 9)));
    await ctx.wait(to - from > 3 ? 0.12 : 0.4);
  }
  const left = goal - to;
  if (to >= goal) return;
  // reaching the last five dots: from here they need dry nights in a row
  const stretch = finalStretch(data().rules);
  if (stretch.size > 0 && stretch.floor > 0 && from < stretch.floor && to === stretch.floor) await say(ctx, 'meter-final');
  else if (left >= 1 && left <= 3) await say(ctx, `meter-${left}`);
  else if (to === Math.floor(goal / 2)) await say(ctx, 'meter-half');
  else if (to === 1 || to % 5 === 0) await say(ctx, 'meter-up');
}

// ------------------------------------------------------------ chests

async function openChest(ctx: Ctx, land: number, preview: boolean) {
  const rules = data().rules;
  const prize: Prize = prizeAt(data().prizes, land);
  const c = chestPos(land, rules);
  const back = new THREE.Vector3().subVectors(cameraPos(), c).setY(0).normalize();
  shot(c.clone().addScaledVector(back, 5).setY(c.y + 3.2), c.clone().setY(c.y + 1.2), 2.2, 4.5);
  faceCamera(hero);
  hero.look = c.clone().setY(c.y + 1.5);
  chestAnim.land = land;
  chestAnim.open = 0;
  chestAnim.rise = 0;
  chestAnim.wiggle = 1;
  sfx.play('drumroll');
  await say(ctx, 'chest-reach', 0.1);
  await awaitTap(ctx, 'chest', 12, (fn) => onChestTap(fn));
  onChestTap(null);
  chestAnim.wiggle = 0;
  chestAnim.open = 1;
  sfx.play('chest');
  sfx.play('fanfare');
  bus.emit('chest', land);
  burst('confetti', c.clone().setY(c.y + 1.2), { count: 60, speed: 4.5 });
  burst('sparkle', c.clone().setY(c.y + 1.5), { count: 40, speed: 3.5 });
  const start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 1.2, 0, 1);
    chestAnim.rise = ease.outBack(u);
    if (u >= 1) break;
  }
  play(hero, 'cheer', 2);
  play(coach, 'cheer', 2);
  await say(ctx, prizeLine(prize));
  await ctx.wait(0.6);
  if (!preview) {
    useSave.getState().markSeen({ prizes: Math.max(data().seen.prizes, land + 1) });
    useGame.getState().set({ openedChests: Math.max(useGame.getState().openedChests, land + 1) });
  }
  chestAnim.rise = 0;
  chestAnim.land = preview ? land : -1;
  hero.look = null;
}

function prizeLine(prize: Prize): string {
  const l = prize.label.trim().toLowerCase();
  if (l.includes('mcdonald')) return 'prize-mcdonalds';
  if (l.includes('movie')) return 'prize-movie';
  if (l.includes('pizza')) return 'prize-pizza';
  if (l.includes('squish')) return 'prize-squishy';
  if (l.includes('candy') || l.includes('sweet')) return 'prize-candy';
  if (l.includes('ice cream')) return 'prize-icecream';
  if (l.includes('book')) return 'prize-book';
  if (l.includes('park')) return 'prize-park';
  if (l.includes('toy')) return 'prize-toy';
  return 'prize-gift';
}

async function crossBridge(ctx: Ctx, land: number) {
  const rules = data().rules;
  const next = land + 1;
  const entry = landCurve(next, rules).getPointAt(0).clone();
  entry.y = restPos(landRange(next, rules).start, rules).y - 0.12;
  boardView.ahead.copy(entry);
  boardCamera(1.6);
  sayAsync(`land-${next % 7}`);
  const mid = hero.pos.clone().lerp(entry, 0.5);
  mid.y -= 0.3;
  const coachEnd = coachSpot(landRange(next, rules).start);
  const coachWalk = walkTo(ctx, coach, coachEnd, 3.2);
  await walkTo(ctx, hero, mid, 3);
  await walkTo(ctx, hero, entry, 3);
  await coachWalk;
  useGame.getState().set({ land: next });
  faceCamera(hero);
  faceCamera(coach);
  await ctx.wait(1.2);
}

// ------------------------------------------------------------ surprises

async function surprise(ctx: Ctx, star: number, preview: boolean, kind = surpriseFor(star)) {
  closeShot(2.2);
  faceCamera(hero);
  faceCamera(coach);
  if (kind === 'egg') await eggSurprise(ctx, star, preview);
  else if (kind === 'highfive') await highFive(ctx);
  else if (kind === 'dance') await danceParty(ctx);
  else if (kind === 'balloons') await balloonPop(ctx);
  else if (kind === 'fireworks') await fireworksShow(ctx);
  else if (kind === 'peekaboo') await hideAndSeek(ctx);
  else if (kind === 'tickle') await tickleTime(ctx);
  else if (kind === 'snack') await snackTime(ctx);
  else if (kind === 'moves') await dinoMoves(ctx, star);
  else if (kind === 'band') await dinoBand(ctx);
  else await roarOff(ctx);
}

/** The flat direction from Zef's dino toward the camera, and the one to its right. */
function viewAxes(): { toCam: THREE.Vector3; side: THREE.Vector3 } {
  const toCam = new THREE.Vector3().subVectors(cameraPos(), hero.pos).setY(0).normalize();
  return { toCam, side: new THREE.Vector3(-toCam.z, 0, toCam.x) };
}

/** Balloons float up in front of the dinos: pop them all. */
async function balloonPop(ctx: Ctx) {
  const { toCam, side } = viewAxes();
  const mid = hero.pos.clone().lerp(coach.pos, 0.45).addScaledVector(toCam, 1.3);
  const n = Math.min(5, MAX_BALLOONS);
  const base = Math.max(hero.pos.y, coach.pos.y);
  const targets = Array.from({ length: n }, (_, i) =>
    mid
      .clone()
      .addScaledVector(side, (i - (n - 1) / 2) * 0.85)
      .setY(base + 1.0 + (i % 2) * 0.55 + Math.random() * 0.2),
  );
  fx.balloons.items = targets.map((t) => ({ pos: t.clone().setY(t.y - 1.4), popped: false, pop: 0 }));
  fx.balloons.active = true;
  sfx.play('magic');
  let start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.9, 0, 1);
    fx.balloons.items.forEach((b, i) => b.pos.copy(targets[i]).setY(targets[i].y - 1.4 * (1 - ease.outCubic(u))));
    if (u >= 1) break;
  }
  let popped = 0;
  const pop = (i: number) => {
    const b = fx.balloons.items[i];
    if (!b || b.popped) return;
    b.popped = true;
    popped++;
    sfx.play('balloon');
    burst('confetti', b.pos.clone().setY(b.pos.y + 0.4), { count: 20, speed: 3 });
    play(hero, popped % 2 ? 'giggle' : 'cheer', 0.8);
  };
  onBalloonTap(pop);
  useGame.getState().set({ awaiting: 'balloons' });
  sayAsync('balloons');
  start = clock.time;
  let nudged = false;
  let lastAuto = 0;
  try {
    await ctx.until(() => {
      if (!nudged && clock.time - start > 9 && popped < n) {
        nudged = true;
        sayAsync('balloons-more');
      }
      // nobody popping? they pop by themselves after a while
      if (clock.time - start > 18 && clock.time - lastAuto > 0.5) {
        lastAuto = clock.time;
        const i = fx.balloons.items.findIndex((b) => !b.popped);
        if (i >= 0) pop(i);
      }
      return popped >= n;
    }, 40);
  } finally {
    onBalloonTap(null);
    useGame.getState().set({ awaiting: null });
  }
  await ctx.wait(0.4);
  fx.balloons.active = false;
  play(hero, 'cheer', 1.4);
  play(coach, 'cheer', 1.4);
  hero.expression = 'happy';
  await say(ctx, 'balloons-done');
  hero.expression = 'smile';
}

/** Fireworks: every tap on the sky sends one up. */
async function fireworksShow(ctx: Ctx) {
  const { toCam, side } = viewAxes();
  const mid = hero.pos.clone().lerp(coach.pos, 0.5);
  const sky = mid.clone().addScaledVector(toCam, -5).setY(mid.y + 6);
  // look up over the dinos' shoulders into the sky
  shot(mid.clone().addScaledVector(toCam, 6.5).setY(mid.y + 1.4), sky, 1.6, 0);
  hero.look = sky.clone();
  coach.look = sky.clone();
  const randomSky = () => sky.clone().addScaledVector(side, (Math.random() - 0.5) * 9).add(new THREE.Vector3(0, Math.random() * 2.5 - 0.5, 0));
  let shots = 0;
  onSkyTap((p) => {
    shots++;
    // keep it up in the sky, even for a tap near the ground
    const q = p.clone();
    q.y = Math.max(q.y, mid.y + 4.5);
    launchFirework(q);
    if (shots % 2) play(hero, 'cheer', 0.9);
  });
  useGame.getState().set({ awaiting: 'fireworks' });
  sayAsync('fireworks');
  const start = clock.time;
  let lastAuto = 0;
  try {
    await ctx.until(() => {
      if (clock.time - start > 8 && clock.time - lastAuto > 1.4 && shots < 6) {
        lastAuto = clock.time;
        shots++;
        launchFirework(randomSky());
      }
      return shots >= 6;
    }, 40);
  } finally {
    onSkyTap(null);
    useGame.getState().set({ awaiting: null });
  }
  await ctx.wait(1.5);
  hero.look = null;
  coach.look = null;
  closeShot(2);
  play(hero, 'cheer', 1.4);
  play(coach, 'cheer', 1.4);
  await say(ctx, 'fireworks-done');
}

/** Hide and seek: Coach Rex hides behind one of three bushes. */
async function hideAndSeek(ctx: Ctx) {
  play(coach, 'wave', 1.4);
  await say(ctx, 'peekaboo', 0.2);
  const { toCam, side } = viewAxes();
  const mid = hero.pos.clone().lerp(coach.pos, 0.5);
  const home = coach.pos.clone();
  // poof! he's gone
  sfx.play('poof');
  burst('puff', coach.pos.clone().setY(coach.pos.y + 1.4), { count: 16, size: 0.5, speed: 1.2 });
  coach.visible = false;
  // three bushes pop up in a row in front of the dinos
  fx.bushes.items = [-1, 0, 1].map((k) => {
    const pos = mid.clone().addScaledVector(toCam, 2.1).addScaledVector(side, k * 1.55);
    pos.y = groundHeight(pos.x, pos.z);
    return { pos, wiggle: 0, scale: 0.01, heading: Math.random() * TAU };
  });
  fx.bushes.active = true;
  const hiding = Math.floor(Math.random() * 3);
  sfx.play('rustle');
  let start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.5, 0, 1);
    for (const b of fx.bushes.items) b.scale = 0.01 + 1.05 * ease.outBack(u);
    if (u >= 1) break;
  }
  // on a tall screen the meter covers the right edge: slide the bushes left of it
  const tall = typeof window !== 'undefined' && window.innerWidth < window.innerHeight * 0.8;
  // (`side` points to the screen's left, so the camera moves the other way)
  const center = mid.clone().addScaledVector(toCam, 2.1).addScaledVector(side, tall ? -0.45 : 0);
  shot(center.clone().addScaledVector(toCam, 5.4).setY(center.y + 2.8), center.clone().addScaledVector(toCam, -0.6).setY(center.y + 0.6), 2.2, tall ? 6 : 5.6);
  await say(ctx, 'peekaboo-find', 0);
  let found = false;
  let lastNope = -9;
  onBushTap((i) => {
    if (found) return;
    fx.bushes.items[i].wiggle = 1;
    sfx.play('rustle');
    if (i === hiding) {
      found = true;
      return;
    }
    if (clock.time - lastNope > 1.6) {
      lastNope = clock.time;
      sayAsync('peekaboo-nope');
    }
  });
  useGame.getState().set({ awaiting: 'peekaboo' });
  const t0 = clock.time;
  let lastHint = t0;
  try {
    await ctx.until(() => {
      // the bush he's behind gives a little wiggle now and then
      if (clock.time - lastHint > 2.6) {
        lastHint = clock.time;
        fx.bushes.items[hiding].wiggle = 0.7;
        sfx.play('rustle');
      }
      if (clock.time - t0 > 20) found = true;
      return found;
    }, 40);
  } finally {
    onBushTap(null);
    useGame.getState().set({ awaiting: null });
  }
  // peekaboo! he pops up from behind it
  const bush = fx.bushes.items[hiding];
  coach.pos.copy(bush.pos).addScaledVector(toCam, -0.75);
  coach.pos.y = groundHeight(coach.pos.x, coach.pos.z) + 0.04;
  coach.visible = true;
  faceCamera(coach);
  sfx.play('boing');
  burst('sparkle', coach.pos.clone().setY(coach.pos.y + 1.8), { count: 30, speed: 3 });
  burst('confetti', coach.pos.clone().setY(coach.pos.y + 1.8), { count: 30 });
  play(coach, 'cheer', 1.6);
  start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.55, 0, 1);
    coach.air = Math.sin(u * Math.PI) * 1.1;
    if (u >= 1) break;
  }
  coach.air = 0;
  hero.expression = 'happy';
  play(hero, 'giggle', 1.2);
  await say(ctx, 'peekaboo-found', 0.2);
  // the bushes shrink away and Coach Rex strolls back
  start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.4, 0, 1);
    for (const b of fx.bushes.items) b.scale = Math.max(0.001, 1.05 * (1 - u));
    if (u >= 1) break;
  }
  fx.bushes.active = false;
  closeShot(2);
  await walkTo(ctx, coach, home, 2.6);
  faceCamera(coach);
  hero.expression = 'smile';
}

async function eggSurprise(ctx: Ctx, star: number, preview: boolean) {
  const acc = accessoryForStar(star);
  if (acc === null) return;
  const g = useGame.getState();
  if (preview) g.set({ shownAccessories: acc });
  // in front of the two dinos, in the middle of the shot
  const back = new THREE.Vector3().subVectors(cameraPos(), hero.pos).setY(0).normalize();
  fx.egg.pos.copy(hero.pos).lerp(coach.pos, 0.4).addScaledVector(back, 1.5);
  fx.egg.pos.y = Math.min(hero.pos.y, coach.pos.y) + 0.02;
  fx.egg.visible = true;
  fx.egg.pop = 0;
  fx.egg.crack = 0;
  fx.egg.hatch = 0;
  fx.egg.wobble = 1;
  hero.look = fx.egg.pos.clone();
  coach.look = fx.egg.pos.clone();
  sfx.play('pop');
  for (let i = 0; i <= 10; i++) {
    fx.egg.pop = i / 10;
    await ctx.wait(0.03);
  }
  prefetch(['egg-done', `acc-${ACCESSORIES[acc].id}`]);
  await say(ctx, 'egg', 0);
  // three taps crack it open; if nobody taps, it hatches by itself
  let taps = 0;
  const tapper = () => {
    if (fx.egg.hatch > 0) return;
    taps++;
    fx.egg.crack = taps;
    fx.egg.wobble = 1.4;
    sfx.play('crack', taps);
    burst('sparkle', fx.egg.pos.clone().setY(fx.egg.pos.y + 0.6), { count: 10 });
  };
  onEggTap(tapper);
  useGame.getState().set({ awaiting: 'egg' });
  const startT = clock.time;
  let nudged = false;
  await ctx.until(() => {
    if (!nudged && clock.time - startT > 6 && taps < 3) {
      nudged = true;
      sayAsync('egg-tap');
    }
    if (clock.time - startT > 14 && taps < 3) tapper();
    return taps >= 3;
  }, 30);
  onEggTap(null);
  useGame.getState().set({ awaiting: null });
  await ctx.wait(0.25);
  fx.egg.hatch = 1;
  sfx.play('hatch');
  burst('confetti', fx.egg.pos.clone().setY(fx.egg.pos.y + 0.7), { count: 50, speed: 3.5 });

  // the prize floats up out of the egg, big and spinning, in a close-up
  const up = fx.egg.pos.clone().setY(fx.egg.pos.y + 1.3);
  const prize = fx.prize;
  prize.index = acc;
  prize.species = data().profile.species;
  prize.float = 1;
  prize.size = 0.05;
  prize.pos.copy(fx.egg.pos).setY(fx.egg.pos.y + 0.4);
  prize.visible = true;
  hero.look = up.clone();
  coach.look = up.clone();
  hero.expression = 'wow';
  shot(up.clone().addScaledVector(back, 3.1).setY(up.y + 0.3), up.clone().setY(up.y - 0.05), 2.8, 1.9);
  sfx.play('magic');
  const from = prize.pos.clone();
  let start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.9, 0, 1);
    prize.pos.lerpVectors(from, up, ease.outCubic(u));
    prize.size = 0.05 + 1.1 * ease.outBack(u);
    if (u >= 1) break;
  }
  burst('sparkle', up, { count: 36, speed: 3 });
  play(coach, 'cheer', 1.6);
  // "Look what was inside! Tap the big button to collect it!"
  let collected = false;
  const collect = () => {
    collected = true;
  };
  onPrizeTap(collect);
  collectTap = collect;
  useGame.getState().set({ awaiting: 'collect' });
  sayAsync('egg-done');
  // a few twinkles round the edge (never in front of it)
  const sideways = new THREE.Vector3(-back.z, 0, back.x);
  const sparkles = setInterval(() => {
    const a = Math.random() * Math.PI * 2;
    const at = up.clone().addScaledVector(sideways, Math.cos(a) * 0.85).setY(up.y + Math.sin(a) * 0.7).addScaledVector(back, -0.3);
    burst('sparkle', at, { count: 3, speed: 0.8 });
  }, 650);
  try {
    // if nobody taps, it goes on by itself after a while
    await ctx.until(() => collected, 25);
  } finally {
    clearInterval(sparkles);
    onPrizeTap(null);
    collectTap = null;
    useGame.getState().set({ awaiting: null });
  }
  voice.stop();
  useGame.getState().set({ caption: null });

  // it flies onto Zef's dino
  sfx.play('whoosh');
  closeShot(2.4);
  prize.float = 0;
  const slot = ACCESSORIES[acc].slot;
  const flyFrom = prize.pos.clone();
  start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.75, 0, 1);
    const to = hero.slots[slot];
    prize.pos.lerpVectors(flyFrom, to, ease.inOutSine(u));
    prize.pos.y += Math.sin(u * Math.PI) * 0.9;
    prize.size = 1.15 - 0.85 * ease.inCubic(u);
    if (u >= 1) break;
  }
  prize.visible = false;
  fx.egg.visible = false;
  if (!preview) useSave.getState().setOutfit(ACCESSORIES[acc].slot, acc);
  useGame.getState().set({ shownAccessories: acc + 1 });
  sfx.play('sparkle');
  burst('sparkle', hero.slots[slot].clone(), { count: 40, speed: 3 });
  burst('confetti', hero.pos.clone().setY(hero.pos.y + 1.2), { count: 30, speed: 3 });
  hero.look = null;
  coach.look = null;
  hero.expression = 'happy';
  faceCamera(hero);
  play(hero, 'show', 2.2);
  // a close-up of Zef's dino wearing it
  const toCam = new THREE.Vector3().subVectors(cameraPos(), hero.pos).setY(0).normalize();
  shot(hero.pos.clone().addScaledVector(toCam, 3.2).setY(hero.pos.y + 1.4), hero.pos.clone().setY(hero.pos.y + 0.8), 2.4, 2.4);
  await say(ctx, `acc-${ACCESSORIES[acc].id}`);
  hero.expression = 'smile';
}

let collectTap: (() => void) | null = null;

// ------------------------------------------------------------ tickle, snack, moves, band

let tickleTap: (() => void) | null = null;

/**
 * A wider shot for the games played with things in front of the dinos (and
 * for the dino moves, arms up high): both dinos and the props all in view,
 * on wide screens too.
 */
function stageShot(toCam: THREE.Vector3, forward = 0.7, height = 0.8) {
  const mid = hero.pos.clone().lerp(coach.pos, 0.5);
  const look = mid.clone().addScaledVector(toCam, forward).setY(mid.y + height);
  shot(look.clone().addScaledVector(toCam, 6.4).setY(look.y + 2.4), look, 2.2, 4.6);
}

/** Tickle time: tap Coach Rex until he topples over laughing. */
async function tickleTime(ctx: Ctx) {
  const { toCam } = viewAxes();
  faceCamera(coach);
  shot(coach.pos.clone().addScaledVector(toCam, 4.8).setY(coach.pos.y + 2.2), coach.pos.clone().setY(coach.pos.y + 1.3), 2, 3.6);
  play(coach, 'point', 1.6);
  await say(ctx, 'tickle', 0.1);
  let taps = 0;
  let last = clock.time;
  const tickle = () => {
    taps++;
    last = clock.time;
    sfx.play('giggle');
    play(coach, taps % 3 === 0 ? 'wiggle' : 'giggle', 0.9);
    coach.expression = 'happy';
    burst('sparkle', coach.pos.clone().setY(coach.pos.y + 1.5), { count: 6 + taps * 2, speed: 2.6, colors: ['#fff3a8', '#ffffff', '#ffc9de'] });
    if (taps === 2) sayAsync('tap-3');
    else if (taps === 5) sayAsync('tickle-lots');
  };
  tickleTap = tickle;
  useGame.getState().set({ awaiting: 'tickle' });
  const t0 = clock.time;
  let helping = false;
  try {
    await ctx.until(() => {
      // nobody tickling (or stopped)? Zef's dino joins in
      if (!helping && clock.time - last > (taps === 0 ? 7 : 4)) helping = true;
      if (helping && clock.time - last > 0.7) {
        play(hero, 'point', 0.6);
        tickle();
      }
      return taps >= 8 || clock.time - t0 > 20;
    }, 24);
  } finally {
    tickleTap = null;
    useGame.getState().set({ awaiting: null });
  }
  // he topples over, laughing
  sfx.play('giggle');
  play(coach, 'sit', 99, true);
  burst('confetti', coach.pos.clone().setY(coach.pos.y + 1.2), { count: 26 });
  await ctx.wait(0.5);
  sfx.play('giggle');
  play(hero, 'giggle', 1.4);
  hero.expression = 'happy';
  await say(ctx, 'tickle-done', 0.1);
  play(coach, 'none');
  coach.expression = 'smile';
}

/** Snack time: tap the fruit and it flies into Coach Rex's mouth. Chomp! */
async function snackTime(ctx: Ctx) {
  const { toCam, side } = viewAxes();
  const mid = hero.pos.clone().lerp(coach.pos, 0.5).addScaledVector(toCam, 1.5);
  mid.y = groundHeight(mid.x, mid.z);
  const n = FRUIT.length;
  const f = fx.fruit;
  f.leaf.copy(mid).setY(mid.y + 0.03);
  f.heading = Math.atan2(toCam.x, toCam.z);
  f.items = Array.from({ length: n }, (_, i) => {
    const pos = mid.clone().addScaledVector(side, (i - (n - 1) / 2) * 0.55);
    pos.y = Math.max(groundHeight(pos.x, pos.z), mid.y) + 0.06;
    return { pos, from: pos.clone(), to: new THREE.Vector3(), fly: 0, flying: false, landed: false, chewed: false };
  });
  f.pop = 0;
  f.active = true;
  sfx.play('magic');
  let start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.45, 0, 1);
    f.pop = ease.outBack(u);
    if (u >= 1) break;
  }
  faceCamera(coach);
  stageShot(toCam);
  play(coach, 'nod', 1.2);
  await say(ctx, 'snack', 0.1);
  // mouth open, waiting; the fruit goes just in front of his snout
  coach.expression = 'wow';
  const mouth = () => coach.slots.face.clone().addScaledVector(toCam, 0.3).add(new THREE.Vector3(0, -0.22, 0));
  let eaten = 0;
  let last = clock.time;
  let chewing = 0;
  const toss = (i: number) => {
    const it = f.items[i];
    if (!it || it.flying) return;
    it.flying = true;
    it.fly = 0;
    it.from.copy(it.pos);
    it.to.copy(mouth());
    last = clock.time;
    sfx.play('toss');
  };
  onFruitTap(toss);
  useGame.getState().set({ awaiting: 'snack' });
  const t0 = clock.time;
  try {
    await ctx.until(() => {
      f.items.forEach((it, i) => {
        if (!it.landed || it.chewed) return;
        // chomp!
        it.chewed = true;
        eaten++;
        chewing = clock.time + 0.7;
        sfx.play('chomp');
        play(coach, 'nod', 0.8);
        coach.expression = 'happy';
        burst('confetti', it.to.clone(), { count: 10, speed: 2.2, colors: FRUIT[i].crumbs });
        if (eaten === 2) sayAsync('snack-yum');
        else if (eaten === 4) sayAsync('snack-more');
      });
      if (eaten < n && clock.time > chewing) coach.expression = 'wow';
      // no taps for a while? Coach Rex helps himself to the next one
      if (clock.time - last > (eaten === 0 ? 8 : 5) || clock.time - t0 > 26) {
        const next = f.items.findIndex((it) => !it.flying);
        if (next >= 0) toss(next);
      }
      return eaten >= n;
    }, 45);
  } finally {
    onFruitTap(null);
    useGame.getState().set({ awaiting: null });
  }
  await ctx.wait(0.4);
  // that was a lot of fruit
  sfx.play('burp');
  coach.expression = 'wow';
  play(coach, 'show', 1.2);
  burst('puff', mouth(), { count: 6, size: 0.3, speed: 0.8 });
  await ctx.wait(0.9);
  sfx.play('giggle');
  play(hero, 'giggle', 1.4);
  hero.expression = 'happy';
  coach.expression = 'happy';
  await say(ctx, 'snack-done', 0.1);
  start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.35, 0, 1);
    f.pop = 1 - u;
    if (u >= 1) break;
  }
  f.active = false;
  coach.expression = 'smile';
}

/** The moves Coach Rex leads, three a morning; the child does them for real, away from the screen. */
const DINO_MOVES: { line: string; act: DinoAction | 'jump'; dur: number }[] = [
  { line: 'move-stomp', act: 'stomp', dur: 4 },
  { line: 'move-stretch', act: 'stretch', dur: 3.6 },
  { line: 'move-wiggle', act: 'wiggle', dur: 3.8 },
  { line: 'move-spin', act: 'spin', dur: 1.3 },
  { line: 'move-hop', act: 'jump', dur: 0.55 },
];

/** Both dinos jump together, once. */
async function jumpBoth(ctx: Ctx, dur: number) {
  sfx.play('hop');
  const start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / dur, 0, 1);
    const h = Math.sin(u * Math.PI);
    hero.air = h * 0.55;
    coach.air = h * 0.45;
    hero.stretch = coach.stretch = 1 + 0.12 * h;
    if (u >= 1) break;
  }
  hero.air = coach.air = 0;
  hero.stretch = coach.stretch = 1;
  sfx.play('land');
  cam.shake = 0.04;
  await ctx.wait(0.15);
}

/** Dino moves: stand up and stomp, stretch, wiggle, spin or jump along with Coach Rex. */
async function dinoMoves(ctx: Ctx, star: number) {
  stageShot(viewAxes().toCam, 0, 1.3);
  music.setMood('party');
  play(coach, 'wave', 1.2);
  await say(ctx, 'moves', 0.2);
  const off = bus.on('stomp', () => {
    cam.shake = 0.06;
    sfx.play('stomp');
  });
  try {
    const first = (Math.floor(star / 2) + dayIndex()) % DINO_MOVES.length;
    for (let k = 0; k < 3; k++) {
      const m = DINO_MOVES[(first + k) % DINO_MOVES.length];
      const talking = say(ctx, m.line, 0.1);
      talking.catch(() => undefined);
      if (m.act === 'jump') {
        for (let j = 0; j < 3; j++) await jumpBoth(ctx, m.dur);
      } else if (m.act === 'spin') {
        for (let j = 0; j < 2; j++) {
          play(hero, 'spin', m.dur);
          play(coach, 'spin', m.dur);
          sfx.play('whoosh');
          await ctx.wait(m.dur + 0.1);
        }
      } else {
        play(hero, m.act, m.dur);
        play(coach, m.act, m.dur);
      }
      await talking;
      await ctx.wait(0.5);
      if (k < 2) {
        sfx.play('ding');
        burst('sparkle', hero.pos.clone().setY(hero.pos.y + 1.2), { count: 14 });
      }
    }
  } finally {
    off();
  }
  music.setMood('play');
  play(hero, 'cheer', 1.4);
  play(coach, 'cheer', 1.4);
  burst('confetti', hero.pos.clone().lerp(coach.pos, 0.5).setY(hero.pos.y + 1.6), { count: 36 });
  await say(ctx, 'moves-done', 0.2);
}

/** The dino band: tap the rocks to play music while Coach Rex dances. */
async function dinoBand(ctx: Ctx) {
  const { toCam, side } = viewAxes();
  const mid = hero.pos.clone().lerp(coach.pos, 0.5).addScaledVector(toCam, 1.6);
  const n = ROCK_COLORS.length;
  const r = fx.rocks;
  r.items = Array.from({ length: n }, (_, i) => {
    // low notes on the left of the screen (`side` points left), in a gentle arc
    const pos = mid
      .clone()
      .addScaledVector(side, (2 - i) * 0.62)
      .addScaledVector(toCam, -Math.abs(i - 2) * 0.16);
    pos.y = groundHeight(pos.x, pos.z);
    return { pos, bounce: 0, glow: 0, hint: 0 };
  });
  const ring = (i: number) => {
    const it = r.items[i];
    it.bounce = 1;
    it.glow = 1;
    sfx.play('note', i);
    burst('note', it.pos.clone().setY(it.pos.y + 0.55), { count: 2, colors: [ROCK_COLORS[i]] });
  };
  r.pop = 0;
  r.active = true;
  stageShot(toCam);
  sfx.play('magic');
  let start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.45, 0, 1);
    r.pop = ease.outBack(u);
    if (u >= 1) break;
  }
  // each rock sings its note
  for (let i = 0; i < n; i++) {
    ring(i);
    await ctx.wait(0.16);
  }
  await say(ctx, 'band', 0.1);
  music.setMood('band');
  let notes = 0;
  let first = -1;
  let last = clock.time;
  onRockTap((i) => {
    ring(i);
    notes++;
    last = clock.time;
    if (first < 0) first = clock.time;
    play(coach, notes % 2 ? 'wiggle' : 'twist', 1.2);
    if (notes % 3 === 0) play(hero, 'nod', 0.8);
    if (notes === 7) sayAsync('band-more');
  });
  useGame.getState().set({ awaiting: 'band' });
  const t0 = clock.time;
  let hinted = clock.time;
  try {
    await ctx.until(() => {
      // waiting for a tap: a rock wobbles to say "tap me"
      if (clock.time - last > 4 && clock.time - hinted > 2) {
        hinted = clock.time;
        r.items[Math.floor(Math.random() * n)].hint = 1;
      }
      return notes >= 16 || (first >= 0 && clock.time - first > 15) || (notes > 0 && clock.time - last > 6) || clock.time - t0 > 24;
    }, 28);
  } finally {
    onRockTap(null);
    useGame.getState().set({ awaiting: null });
  }
  music.setMood('play');
  // the big finish: a run up the rocks
  for (let i = 0; i < n; i++) {
    ring(i);
    await ctx.wait(0.1);
  }
  sfx.play('fanfare');
  play(hero, 'cheer', 1.4);
  play(coach, 'cheer', 1.4);
  burst('note', hero.pos.clone().lerp(coach.pos, 0.5).setY(hero.pos.y + 1.6), { count: 10 });
  await say(ctx, 'band-done', 0.2);
  start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.35, 0, 1);
    r.pop = 1 - u;
    if (u >= 1) break;
  }
  r.active = false;
}

// ------------------------------------------------------------ wardrobe

const DRESS_KEY = 'zefs-dino-dressup-opened';

/** Has this child opened the wardrobe on this device yet? (Then the hint stops.) */
function dressUpOpened(): boolean {
  try {
    const id = useSave.getState().library.current;
    return !id || localStorage.getItem(`${DRESS_KEY}:${id}`) === '1';
  } catch {
    return true;
  }
}

function markDressUpOpened() {
  try {
    const id = useSave.getState().library.current;
    if (id) localStorage.setItem(`${DRESS_KEY}:${id}`, '1');
  } catch {
    /* storage blocked: the hint comes back next time, which is harmless */
  }
}

/** The "?" in the wardrobe: where more things to wear come from. */
export function askForMoreClothes() {
  if (!useGame.getState().dressUp) return;
  sfx.play('boing');
  sayAsync('wardrobe-more');
}

/** Tap the stars at the top: Coach Rex says how many more stars to the next treasure chest, and it sparkles. */
export function tapCounter() {
  const g = useGame.getState();
  if (g.scene !== 'board' || g.cutscene || g.preview || g.dressUp || (g.phase !== 'ask' && g.phase !== 'done') || voice.speaking()) return;
  unlockAudio();
  const rules = data().rules;
  const land = landOf(g.shownStars, rules);
  const left = clamp(landRange(land, rules).end - g.shownStars, 1, MAX_CHEST_GAP);
  sfx.play('sparkle');
  burst('sparkle', chestPos(land, rules).clone().add(new THREE.Vector3(0, 1.3, 0)), { count: 34, speed: 3.2 });
  sayAsync(`chest-more-${left}`);
}

/** What Zef's dino is wearing right now. */
function currentOutfit() {
  return resolveOutfit(useGame.getState().shownAccessories, data().outfit);
}

/** The hanger button after the morning: dress-up time, with a close-up of the dino. */
export function openWardrobe() {
  const g = useGame.getState();
  if (g.phase !== 'done' || g.cutscene || g.dressUp || g.shownAccessories < 1) return;
  unlockAudio();
  markDressUpOpened();
  g.set({ dressUp: true, dressHint: false });
  sfx.play('magic');
  faceCamera(hero);
  const { toCam } = viewAxes();
  // the dino sits in the top half, above the wardrobe
  shot(hero.pos.clone().addScaledVector(toCam, 3.4).setY(hero.pos.y + 1.2), hero.pos.clone().setY(hero.pos.y + 0.25), 2.4, 2.6);
  play(hero, 'show', 1.6);
  sayAsync('wardrobe');
}

/** Tap an item in the wardrobe: put it on (Coach Rex names it), or take it off. */
export function toggleOutfit(index: number) {
  const g = useGame.getState();
  if (!g.dressUp || g.phase !== 'done' || g.scene !== 'board' || g.preview || index < 0 || index >= g.shownAccessories) return;
  const a = ACCESSORIES[index];
  const worn = currentOutfit()[a.slot] === index;
  useSave.getState().setOutfit(a.slot, worn ? -1 : index);
  if (worn) {
    sfx.play('pop');
    play(hero, 'giggle', 0.8);
    return;
  }
  sfx.play('magic');
  burst('sparkle', hero.slots[a.slot].clone(), { count: 24, speed: 2.5 });
  play(hero, 'show', 1.4);
  sayAsync(`acc-${a.id}`);
}

export function closeWardrobe() {
  if (!useGame.getState().dressUp) return;
  sfx.play('tap');
  putAwayWardrobe();
}

/** Close the wardrobe without a sound (when something else needs the screen). */
function putAwayWardrobe() {
  const g = useGame.getState();
  if (!g.dressUp) return;
  g.set({ dressUp: false });
  if (g.scene !== 'board') return;
  boardCamera(1.6);
  faceCamera(hero);
}

/** The big "Collect!" button under the prize from the egg. */
export function collectPrize() {
  if (useGame.getState().awaiting !== 'collect') return;
  sfx.play('tap');
  collectTap?.();
}

let highFiveSlap: (() => void) | null = null;

async function highFive(ctx: Ctx) {
  play(coach, 'highfive', 99, true);
  await ctx.wait(0.4);
  fx.hand.follow = coach;
  fx.hand.visible = true;
  await say(ctx, 'highfive', 0);
  let slapped = false;
  const slap = () => {
    slapped = true;
  };
  onHandTap(slap);
  highFiveSlap = slap;
  useGame.getState().set({ awaiting: 'highfive' });
  await ctx.until(() => slapped, 12);
  onHandTap(null);
  highFiveSlap = null;
  useGame.getState().set({ awaiting: null });
  fx.hand.visible = false;
  // Zef's dino jumps up and slaps it
  const hp = coach.hand.clone();
  fx.hand.follow = null;
  hero.heading = Math.atan2(coach.pos.x - hero.pos.x, coach.pos.z - hero.pos.z);
  play(hero, 'highfive', 0.9);
  hero.air = 0;
  const start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 0.45, 0, 1);
    hero.air = Math.sin(u * Math.PI) * 0.6;
    if (u >= 1) break;
  }
  sfx.play('slap');
  bus.emit('slap');
  cam.shake = 0.12;
  burst('sparkle', hp, { count: 34, speed: 4, colors: ['#fff3a8', '#ffffff', '#ffd43b'] });
  burst('confetti', hp, { count: 20 });
  play(coach, 'cheer', 1.4);
  play(hero, 'cheer', 1.4);
  hero.expression = 'happy';
  await say(ctx, 'highfive-done');
  faceCamera(hero);
  hero.expression = 'smile';
}

async function danceParty(ctx: Ctx) {
  music.setMood('party');
  await say(ctx, 'dance', 0);
  const moves: [import('./actors').DinoAction, number][] = [
    ['wiggle', 2.4],
    ['spin', 1.3],
    ['stomp', 2.2],
    ['twist', 2.4],
    ['spin', 1.3],
  ];
  const off = bus.on('stomp', () => {
    cam.shake = 0.08;
    sfx.play('stomp');
  });
  useGame.getState().set({ awaiting: null });
  dancing = true;
  for (const [m, dur] of moves) {
    play(hero, m, dur);
    play(coach, m === 'spin' ? 'wiggle' : m, dur);
    burst('note', hero.pos.clone().setY(hero.pos.y + 1.3), { count: 3 });
    await ctx.wait(dur);
  }
  dancing = false;
  off();
  music.setMood('play');
  play(hero, 'cheer', 1.2);
  await say(ctx, 'dance-done');
}

let dancing = false;
let roarTaps = 0;
let roaring = false;

async function roarOff(ctx: Ctx) {
  await say(ctx, 'roar', 0);
  roarTaps = 0;
  roaring = true;
  useGame.getState().set({ awaiting: 'roar' });
  const startT = clock.time;
  let lastAuto = startT;
  await ctx.until(() => {
    if (clock.time - startT > 7 && clock.time - lastAuto > 2.2 && roarTaps < 3) {
      lastAuto = clock.time;
      heroRoar();
    }
    return roarTaps >= 3 && hero.action.name === 'none';
  }, 30);
  roaring = false;
  useGame.getState().set({ awaiting: null });
  await ctx.wait(0.3);
  // Coach Rex roars back — the biggest one
  play(coach, 'roar', 2.0);
  sfx.play('roar', 1, 1);
  cam.shake = 0.3;
  burst('puff', coach.pos.clone().setY(coach.pos.y + 2), { count: 10, size: 0.5, colors: ['#ffffff'] });
  await ctx.wait(2.0);
  play(hero, 'cheer', 1.2);
  await say(ctx, 'roar-done');
}

function heroRoar() {
  if (hero.action.name === 'roar') return;
  roarTaps++;
  const power = Math.min(1, roarTaps / 3);
  play(hero, 'roar', 1.3 + power * 0.4);
  sfx.play('roar', 0, power);
  cam.shake = 0.08 + power * 0.18;
  burst('sparkle', hero.pos.clone().setY(hero.pos.y + 1.0), { count: 8 + roarTaps * 6, speed: 2 + roarTaps });
  if (roarTaps === 2) sayAsync('roar-more');
}

// ------------------------------------------------------------ taps

export function tapHero() {
  const g = useGame.getState();
  if (g.awaiting === 'intro-roar') {
    introRoarTap?.();
    return;
  }
  if (g.awaiting === 'roar' && roaring) {
    heroRoar();
    return;
  }
  if (dancing) {
    play(hero, 'spin', 1.2);
    return;
  }
  if (g.cutscene || g.phase === 'setup') return;
  const r = Math.floor(Math.random() * 4);
  const acts = ['giggle', 'spin', 'roar', 'cheer'] as const;
  play(hero, acts[r], acts[r] === 'roar' ? 1.3 : 1.1);
  if (acts[r] === 'roar') sfx.play('roar', 0, 0.3);
  else sfx.play(acts[r] === 'giggle' ? 'giggle' : 'boing');
  burst('sparkle', hero.pos.clone().setY(hero.pos.y + 1), { count: 10 });
}

let coachTapN = 0;
export function tapCoach() {
  const g = useGame.getState();
  if (g.awaiting === 'tickle') {
    tickleTap?.();
    return;
  }
  if (g.awaiting === 'highfive') {
    // tapping anywhere on the coach counts as a high five too
    highFiveSlap?.();
    return;
  }
  if (g.cutscene || g.phase === 'setup' || voice.speaking()) return;
  coachTapN++;
  play(coach, coachTapN % 2 ? 'giggle' : 'wave', 1.2);
  sfx.play('boing');
  const lines = ['tap-1', 'tap-2', 'tap-3', 'tap-4', 'tap-5', 'tap-6', 'tap-7', 'tap-8', 'tap-9', 'tap-10'];
  sayAsync(lines[coachTapN % lines.length]);
}

// ------------------------------------------------------------ hug

/** The meter as it stood before the morning of `date` was recorded. */
function meterBefore(date: DateKey): number {
  const d = data();
  const records = { ...d.records };
  delete records[date];
  return computeQuest(records, d.rules).meter;
}

async function hug(ctx: Ctx, preview: boolean, replay = false) {
  music.setMood('calm');
  hero.expression = 'calm';
  faceCamera(hero);
  closeShot(1.8);
  const openers = ['wet-1', 'wet-4', 'wet-5'];
  await say(ctx, openers[quest().wets % openers.length], 0.1);
  // Coach walks over beside Zef (side-on to the camera) and wraps him up
  const view = new THREE.Vector3().subVectors(hero.pos, cameraPos()).setY(0).normalize();
  const right = new THREE.Vector3(-view.z, 0, view.x);
  const sideSign = new THREE.Vector3().subVectors(coach.pos, hero.pos).dot(right) >= 0 ? 1 : -1;
  const spot = hero.pos.clone().addScaledVector(right, 1.15 * sideSign);
  spot.y = coach.pos.y;
  await walkTo(ctx, coach, spot, 2);
  faceEachOther();
  play(coach, 'hug', 99, true);
  play(hero, 'hugged', 99, true);
  hero.expression = 'happy';
  sfx.play('hug');
  const mid = hero.pos.clone().lerp(coach.pos, 0.5);
  shot(mid.clone().addScaledVector(view, -3.8).setY(mid.y + 1.7), mid.clone().setY(mid.y + 0.95), 1.5, 3.4);
  const hearts = setInterval(() => burst('heart', mid.clone().setY(mid.y + 1.6), { count: 3 }), 600);
  try {
    await say(ctx, 'wet-2', 0.3);
    // the kinder meter loses one dot (the classic one starts fresh); the stars all stay
    const g = useGame.getState();
    const kind = data().rules.meter !== 'streak';
    // watching it again starts the meter where it was before the not-dry night
    const from = replay ? meterBefore(today()) : g.shownMeter;
    const stretch = finalStretch(data().rules);
    const restart = kind && stretch.size > 0 && from > stretch.floor;
    const to = preview && !replay ? (kind ? (restart ? stretch.floor : Math.max(0, from - 1)) : 0) : Math.min(from, quest().meter);
    g.set({ shownMeter: from });
    for (let m = from; m > to; m--) {
      g.set({ shownMeter: m - 1 });
      await ctx.wait(from - to > 8 ? 0.05 : 0.18);
    }
    g.set({ shownMeter: to });
    sfx.play('sparkle');
    boardCamera(1.4);
    // ("only lost one dot" only when that's true: a dry morning a grown-up changed to not dry takes off two,
    // and in the last five dots the five start over)
    const startedOver = restart && to === stretch.floor && from - to > 1;
    await say(ctx, startedOver ? 'wet-3-final' : kind && from - to === 1 ? 'wet-3-kind' : 'wet-3', 0.2);
  } finally {
    clearInterval(hearts);
  }
  play(coach, 'none');
  play(hero, 'none');
  coach.action.name = 'none';
  hero.action.name = 'none';
  await walkTo(ctx, coach, coachSpot(useGame.getState().shownStars), 2.2);
  faceCamera(hero);
  faceCamera(coach);
  hero.expression = 'smile';
  music.setMood('play');
}

// ------------------------------------------------------------ store

let storePick: number | null = null;
export function pickUnderpantsTap(i: number) {
  if (useGame.getState().awaiting !== 'store-pick') return;
  storePick = i;
}

async function storeVisit(ctx: Ctx, preview: boolean) {
  const g = useGame.getState();
  closeShot(2);
  play(hero, 'cheer', 2);
  play(coach, 'cheer', 2);
  sfx.play('fanfare');
  const fireworks = setInterval(() => burst('confetti', hero.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 2.5, (Math.random() - 0.5) * 2)), { count: 30, speed: 4 }), 450);
  try {
    await say(ctx, 'store-open', 0.2);
  } finally {
    clearInterval(fireworks);
  }
  // the store lights up far away
  const store = storeLandmarkPos(landOf(g.shownStars, data().rules), data().rules);
  shot(hero.pos.clone().add(new THREE.Vector3(0, 3.5, 6)), store.clone().add(new THREE.Vector3(0, 4, 0)), 1.2);
  await ctx.wait(1.5);
  // a pterodactyl swoops down to give Zef a ride
  fx.ptero.visible = true;
  fx.ptero.flap = 1;
  const above = hero.pos.clone().add(new THREE.Vector3(0, 2.3, 0));
  const startP = above.clone().add(new THREE.Vector3(-14, 8, 10));
  sfx.play('flap');
  let start = clock.time;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 2, 0, 1);
    fx.ptero.pos.lerpVectors(startP, above, ease.outCubic(u));
    fx.ptero.heading = Math.atan2(above.x - startP.x, above.z - startP.z);
    if (u >= 1) break;
  }
  closeShot(2);
  await say(ctx, 'store-fly', 0);
  play(hero, 'cheer', 1.2);
  const lift = hero.pos.clone();
  const flyTo = store.clone().add(new THREE.Vector3(0, 6, 8));
  shot(lift.clone().add(new THREE.Vector3(5, 4, 9)), lift.clone().add(new THREE.Vector3(0, 3, -6)), 1.2);
  sfx.play('whoosh');
  start = clock.time;
  coach.visible = false;
  for (;;) {
    await ctx.wait(0);
    const u = clamp((clock.time - start) / 3.2, 0, 1);
    const p = new THREE.Vector3().lerpVectors(above, flyTo, ease.inOutSine(u));
    p.y += Math.sin(u * Math.PI) * 4;
    fx.ptero.pos.copy(p);
    fx.ptero.heading = Math.atan2(flyTo.x - above.x, flyTo.z - above.z);
    hero.pos.copy(p).add(new THREE.Vector3(0, -1.5, 0));
    hero.heading = fx.ptero.heading;
    if (u > 0.7) g.set({ fade: (u - 0.7) / 0.3 });
    if (u >= 1) break;
  }
  g.set({ fade: 1 });
  await ctx.wait(0.4);
  fx.ptero.visible = false;

  // inside the shop
  g.set({ scene: 'store' });
  hero.pos.copy(STORE_ORIGIN).add(new THREE.Vector3(-2.6, 0, 1.4));
  coach.pos.copy(STORE_ORIGIN).add(new THREE.Vector3(2.9, 0, 1.2));
  coach.visible = true;
  hero.visible = true;
  hero.heading = 2.6;
  coach.heading = -2.5;
  hero.air = 0;
  shot(STORE_ORIGIN.clone().add(new THREE.Vector3(0, 3.1, 6.6)), STORE_ORIGIN.clone().add(new THREE.Vector3(0, 1.3, -1.6)), 3, 6.6);
  cam.snap = true;
  music.setMood('party');
  await ctx.wait(0.3);
  g.set({ fade: 0 });
  await ctx.wait(0.6);
  await say(ctx, 'store-pick', 0);
  storePick = null;
  useGame.getState().set({ awaiting: 'store-pick' });
  const t0 = clock.time;
  await ctx.until(() => storePick !== null || clock.time - t0 > 60, 70);
  useGame.getState().set({ awaiting: null });
  const choice = storePick ?? 0;
  if (!preview) useSave.getState().pickUnderpants(choice);
  const ped = pedestalPos(choice);
  burst('confetti', ped.clone().setY(pedestalHeight(choice) + 0.6), { count: 50, speed: 4 });
  burst('sparkle', ped.clone().setY(pedestalHeight(choice) + 0.5), { count: 30 });
  sfx.play('magic');
  // put them on, up on the show-off stage
  await walkTo(ctx, hero, STORE_ORIGIN.clone().add(new THREE.Vector3(0, 0.12, 1.6)), 2.6);
  faceCamera(hero);
  g.set({ showUnderpants: true, previewUnderpants: preview ? choice : null });
  burst('sparkle', hero.pos.clone().setY(hero.pos.y + 0.6), { count: 40, speed: 3 });
  shot(STORE_ORIGIN.clone().add(new THREE.Vector3(0, 1.9, 5.4)), STORE_ORIGIN.clone().add(new THREE.Vector3(0, 0.7, 1.6)), 2, 3.4);
  play(hero, 'show', 2.4);
  await say(ctx, 'store-picked', 0);
  faceCamera(hero);
  play(hero, 'cheer', 2.4);
  play(coach, 'cheer', 2.4);
  const party = setInterval(() => burst('confetti', STORE_ORIGIN.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 3)), { count: 24 }), 400);
  try {
    await say(ctx, 'store-done', 0.4);
  } finally {
    clearInterval(party);
  }
  if (!preview) useSave.getState().markSeen({ underpants: true });
  music.setMood('play');
  // back to the board
  g.set({ fade: 1 });
  await ctx.wait(0.6);
  g.set({ scene: 'board' });
  placeAt(g.shownStars);
  boardCamera();
  cam.snap = true;
  await ctx.wait(0.3);
  g.set({ fade: 0 });
  await ctx.wait(0.5);
}

// ------------------------------------------------------------ goodbye

async function goodbye(ctx: Ctx) {
  await jokeOrFact(ctx);
  boardCamera(1.8);
  faceCamera(hero);
  faceCamera(coach);
  play(hero, 'wave', 1.6);
  play(coach, 'wave', 1.6);
  await say(ctx, GOODBYES[dayIndex() % GOODBYES.length]);
  finishMorning();
}

/** A joke one morning (with a beat before the punchline, and a ba-dum-tss), a dino fact the next. */
async function jokeOrFact(ctx: Ctx) {
  const [intro, a, b] = todaysExtra();
  closeShot(2);
  faceCamera(hero);
  faceCamera(coach);
  play(coach, 'point', 1.2);
  await say(ctx, intro, 0.2);
  if (b) {
    await say(ctx, a, 0.1);
    play(coach, 'nod', 1);
    play(hero, 'nod', 1);
    await ctx.wait(1);
    await say(ctx, b, 0);
    sfx.play('rimshot');
    play(coach, 'giggle', 1.6);
    play(hero, 'giggle', 1.6);
    hero.expression = 'happy';
    await ctx.wait(0.4);
    sfx.play('giggle');
    await ctx.wait(0.6);
  } else {
    play(coach, 'show', 1.8);
    sfx.play('sparkle');
    await say(ctx, a, 0.1);
    hero.expression = 'wow';
    play(hero, 'nod', 1);
    await ctx.wait(0.8);
  }
  hero.expression = 'smile';
}

// ------------------------------------------------------------ replay & previews

/** "Watch again": replay this morning's moment without changing anything. */
export function replayToday() {
  const g = useGame.getState();
  if (g.phase !== 'done' || g.cutscene) return;
  const r = data().records[today()];
  if (!r) return;
  startPreview(r === 'dry' ? 'dry' : 'wet', true);
}

let previewRestore: { stars: number; meter: number; acc: number; chests: number; pants: boolean } | null = null;
let surpriseTurn = -1;
let previewSeq = 0;

/** Grown-ups can preview any moment; real progress never changes. */
export function startPreview(kind: PreviewKind, fromChild = false) {
  cancelCutscene();
  const g = useGame.getState();
  unlockAudio();
  if (data().settings.music) music.start();
  clearProps();
  if (!g.preview) previewRestore = { stars: g.shownStars, meter: g.shownMeter, acc: g.shownAccessories, chests: g.openedChests, pants: g.showUnderpants };
  const myPreview = ++previewSeq;
  g.set({ preview: { kind, replay: fromChild }, parentOpen: false, phase: 'event', scene: kind === 'intro' ? 'board' : g.scene });
  void runCutscene(`preview-${kind}`, async (ctx) => {
    const rules = data().rules;
    const stars = g.shownStars;
    placeAt(stars);
    if (kind === 'dry') {
      const target = fromChild ? stars : stars + 1;
      if (fromChild) {
        g.set({ shownStars: Math.max(0, stars - 1) });
        placeAt(Math.max(0, stars - 1));
      }
      const from = useGame.getState().shownStars;
      await celebrateStarsPreview(ctx, from, target);
      const goal = rules.goal;
      await meterUp(ctx, g.shownMeter, Math.min(goal - 1, g.shownMeter + (fromChild ? 0 : 1)), goal);
      await surprise(ctx, Math.max(1, target), true);
    } else if (kind === 'wet') {
      // watching it again starts the meter where it was before the not-dry night
      if (fromChild) g.set({ shownMeter: meterBefore(today()) });
      await hug(ctx, true, fromChild);
    } else if (kind === 'prize') {
      const land = landOf(stars, rules);
      await openChest(ctx, land, true);
    } else if (kind === 'store') {
      await storeVisit(ctx, true);
    } else if (kind === 'surprise') {
      // one of the surprises between eggs, a different one each time
      const kinds = ['tickle', 'snack', 'band', 'moves', 'balloons', 'fireworks', 'peekaboo', 'highfive', 'dance', 'roar'] as const;
      surpriseTurn = (surpriseTurn + 1) % kinds.length;
      await surprise(ctx, Math.max(1, stars), true, kinds[surpriseTurn]);
    } else if (kind === 'intro') {
      await intro(ctx);
    }
    await goodbyePreview(ctx);
  }).finally(() => {
    if (previewSeq === myPreview) endPreview();
  });
}

async function celebrateStarsPreview(ctx: Ctx, from: number, to: number) {
  closeShot(2);
  play(hero, 'cheer', 1.6);
  play(coach, 'cheer', 1.6);
  sfx.play('fanfare');
  burst('confetti', hero.pos.clone().setY(hero.pos.y + 1.4), { count: 40 });
  await say(ctx, dryCheer(to), 0.1);
  if (to <= from) return;
  const rules = data().rules;
  boardCamera(2.4);
  const target = spacePos(to, rules);
  await flyStar(target);
  useGame.getState().set({ shownStars: to });
  const walking = walkTo(ctx, coach, coachSpot(to), 3);
  await hopTo(ctx, hero, target.clone().setY(target.y - 0.12), 0.6);
  await walking;
  faceCamera(hero);
  faceCamera(coach);
}

async function goodbyePreview(ctx: Ctx) {
  // watching it again includes today's joke or dino fact
  if (useGame.getState().preview?.replay) await jokeOrFact(ctx);
  boardCamera(1.8);
  play(hero, 'wave', 1.4);
  play(coach, 'wave', 1.4);
  await ctx.wait(1.2);
}

export function endPreview() {
  if (!useGame.getState().preview) return;
  cancelCutscene();
  const g = useGame.getState();
  const r = previewRestore;
  clearProps();
  music.setMood('play');
  if (r) g.set({ shownStars: r.stars, shownMeter: r.meter, shownAccessories: r.acc, openedChests: r.chests, showUnderpants: r.pants });
  g.set({ preview: null, fade: 0, scene: data().profile.setupDone ? 'board' : 'setup', previewUnderpants: null, highlight: null });
  previewRestore = null;
  coach.action.name = 'none';
  hero.action.name = 'none';
  coach.visible = true;
  hero.visible = true;
  hero.expression = 'smile';
  placeAt(useGame.getState().shownStars);
  boardCamera();
  cam.snap = true;
  g.set({ phase: data().profile.setupDone ? (data().records[today()] ? 'done' : 'ask') : 'setup' });
  setTimeout(() => checkProgress(), 300);
}

// ------------------------------------------------------------ first-time setup

function setupCamera() {
  const o = new THREE.Vector3(0, 0, -800);
  shot(o.clone().add(new THREE.Vector3(0, 1.6, 5.8)), o.clone().add(new THREE.Vector3(0, 0.85, 0)), 3, 6.4);
  cam.snap = true;
}

export function setupNameDone(name: string) {
  const g = useGame.getState();
  unlockAudio();
  if (data().settings.music) music.start();
  useSave.getState().setProfile({ name: name.trim().slice(0, 24) || 'Zef' });
  g.set({ setupStep: 'dino' });
  setupCamera();
  void runCutscene('setup-dino', async (ctx) => {
    for (const s of Object.values(lineup)) play(s, 'wave', 1.4);
    await say(ctx, 'pick-dino');
  });
}

export function setupPickSpecies(species: Species) {
  const g = useGame.getState();
  if (g.setupStep !== 'dino') return;
  useSave.getState().setProfile({ species });
  sfx.play('pop');
  const a = lineup[species];
  play(a, 'roar', 1.4);
  sfx.play('roar', 0, 0.5);
  burst('confetti', a.pos.clone().setY(1.6), { count: 30 });
  void runCutscene('setup-picked', async (ctx) => {
    await say(ctx, `picked-${species}`, 0.3);
    useGame.getState().set({ setupStep: 'color' });
    shot(new THREE.Vector3(0, 1.7, -800 + 5.0), new THREE.Vector3(0, 0.95, -800), 3, 3.8);
    await say(ctx, 'pick-color');
  });
}

export function setupPickColor(color: number) {
  if (useGame.getState().setupStep !== 'color') return;
  useSave.getState().setProfile({ color });
  const sp = data().profile.species;
  play(lineup[sp], 'show', 1.6);
  sfx.play('sparkle');
  burst('sparkle', lineup[sp].pos.clone().setY(1.2), { count: 24 });
}

export function setupDone() {
  const g = useGame.getState();
  if (g.setupStep !== 'color') return;
  sfx.play('fanfare');
  void runCutscene('setup-done', async (ctx) => {
    play(lineup[data().profile.species], 'cheer', 1.6);
    await say(ctx, 'color-done', 0.2);
    g.set({ fade: 1 });
    await ctx.wait(0.5);
    g.set({ scene: 'board', setupStep: null });
    placeAt(useGame.getState().shownStars);
    boardCamera();
    cam.snap = true;
    await ctx.wait(0.3);
    g.set({ fade: 0 });
    await intro(ctx);
    useSave.getState().setProfile({ setupDone: true });
    g.set({ phase: data().records[today()] ? 'done' : 'ask' });
    if (!data().records[today()]) await say(ctx, 'ask');
  });
}

let meterTap: (() => void) | null = null;
let introRoarTap: (() => void) | null = null;

/** The meter at the top right, tapped during the intro. */
export function tapMeter() {
  if (useGame.getState().awaiting === 'intro-meter') meterTap?.();
}

/**
 * Coach Rex explains the mission, with the camera showing each part, and
 * Zef taps along: the star (his dino hops over and back), the treasure chest
 * (locked till he gets there), the meter (it fills up to show what full looks
 * like) and, at the end, his own dino for a big roar. Every tap has a friendly
 * time limit, so the intro never gets stuck.
 */
async function intro(ctx: Ctx) {
  const g = useGame.getState();
  g.set({ phase: 'event' });
  const rules = data().rules;
  const stars = g.shownStars;
  placeAt(stars);
  const meterLine = rules.meter === 'streak' ? 'intro-meter' : 'intro-meter-kind';
  prefetch(['intro-1', 'intro-2', 'intro-3', 'intro-tap-star', 'intro-yes', 'intro-prizes', 'intro-tap-chest', 'intro-chest-tease', 'intro-4', meterLine]);
  closeShot(2);
  play(coach, 'wave', 1.8);
  await say(ctx, 'intro-1');
  play(hero, 'cheer', 1.4);
  await say(ctx, 'intro-2');

  // the path and the stars: tap the star, and the dino hops over and back
  boardCamera(1.5);
  const next = spacePos(stars + 1, rules);
  hero.look = next.clone();
  await say(ctx, 'intro-3');
  fx.introStar.pos.copy(next).setY(next.y + 1.15);
  fx.introStar.visible = true;
  sfx.play('sparkle');
  sayAsync('intro-tap-star');
  await awaitTap(ctx, 'intro-star', 12, (fn) => onIntroStarTap(fn));
  onIntroStarTap(null);
  fx.introStar.visible = false;
  burst('sparkle', fx.introStar.pos.clone(), { count: 34, speed: 3.5 });
  sfx.play('star');
  voice.stop();
  const home = hero.pos.clone();
  await hopTo(ctx, hero, next.clone().setY(next.y - 0.12), 0.6);
  play(hero, 'cheer', 1.1);
  await say(ctx, 'intro-yes', 0.1);
  await hopTo(ctx, hero, home, 0.6);
  hero.look = null;
  faceCamera(hero);

  // the chest at the end of this land: prizes along the way (it's locked for now)
  prefetch(['intro-4', meterLine, 'intro-tap-meter', 'intro-meter-full', 'intro-store', 'intro-go', 'intro-roar']);
  const land = landOf(stars, rules);
  const c = chestPos(land, rules);
  shot(c.clone().add(new THREE.Vector3(3, 4, 7)), c.clone().setY(c.y + 1.2), 1.2);
  Object.assign(chestAnim, { land, open: 0, rise: 0, wiggle: 1 });
  g.set({ highlight: 'stars' });
  await say(ctx, 'intro-prizes');
  g.set({ highlight: null });
  sayAsync('intro-tap-chest');
  await awaitTap(ctx, 'intro-chest', 12, (fn) => onChestTap(fn));
  onChestTap(null);
  voice.stop();
  sfx.play('boing');
  chestAnim.wiggle = 2.4;
  chestAnim.open = 0.22;
  burst('sparkle', c.clone().setY(c.y + 1.3), { count: 20, speed: 2.5 });
  await ctx.wait(0.35);
  chestAnim.open = 0;
  await say(ctx, 'intro-chest-tease');
  chestAnim.wiggle = 0;
  chestAnim.land = -1;

  // not dry: a hug
  closeShot(2);
  play(coach, 'hug', 2.2);
  await say(ctx, 'intro-4');
  coach.action.name = 'none';

  // the meter: tap it to see what full looks like
  boardCamera(1.5);
  g.set({ highlight: 'meter' });
  await say(ctx, meterLine);
  sayAsync('intro-tap-meter');
  await awaitTap(ctx, 'intro-meter', 12, (fn) => (meterTap = fn));
  meterTap = null;
  voice.stop();
  const real = useGame.getState().shownMeter;
  const full = rules.goal;
  for (let m = real + 1; m <= full; m++) {
    g.set({ shownMeter: m });
    sfx.play('tick', Math.min(9, Math.round((m / full) * 9)));
    await ctx.wait(full > 12 ? 0.05 : 0.12);
  }
  sfx.play('fanfare');
  await say(ctx, 'intro-meter-full', 0.3);
  for (let m = full; m > real; m--) {
    g.set({ shownMeter: m - 1 });
    await ctx.wait(0.03);
  }
  g.set({ shownMeter: real, highlight: null });

  // the Underwear Store, far away
  const store = storeLandmarkPos(land, rules);
  shot(hero.pos.clone().add(new THREE.Vector3(2, 4, 8)), store.clone().add(new THREE.Vector3(0, 3, 0)), 1.0);
  await say(ctx, 'intro-store', 0.1);

  // ready? tap your dino for the biggest roar, and Coach Rex roars back
  closeShot(2);
  play(coach, 'cheer', 1.4);
  play(hero, 'cheer', 1.4);
  await say(ctx, 'intro-go', 0);
  sayAsync('intro-roar');
  await awaitTap(ctx, 'intro-roar', 10, (fn) => (introRoarTap = fn));
  introRoarTap = null;
  voice.stop();
  useGame.getState().set({ caption: null });
  play(hero, 'roar', 1.6);
  sfx.play('roar', 0, 0.8);
  cam.shake = 0.15;
  burst('sparkle', hero.pos.clone().setY(hero.pos.y + 1.0), { count: 26, speed: 3 });
  await ctx.wait(1.0);
  play(coach, 'roar', 1.8);
  sfx.play('roar', 1, 0.9);
  cam.shake = 0.28;
  await ctx.wait(1.8);
  boardCamera();
}

/**
 * A grown-up's "start over" for the current child: wipe their adventure and
 * go back to the name screen, so the dino picking and the intro play again.
 */
export function startOver() {
  cancelCutscene();
  previewRestore = null;
  clearProps();
  music.setMood('play');
  useSave.getState().startOver();
  syncBoard();
  useGame.getState().set({ previewUnderpants: null });
  beginSetup(false);
}

/** A grown-up removed the current child: back to the title screen. */
export function removeCurrentChild() {
  const id = useSave.getState().library.current;
  if (id) useSave.getState().removeChild(id);
  showTitle();
}

/** Re-place the dinos and camera after a grown-up resets or corrects things. */
export function resetBoardView() {
  const g = useGame.getState();
  putAwayWardrobe();
  placeAt(g.shownStars);
  boardCamera();
  cam.snap = true;
}

export function skipIntro() {
  const g = useGame.getState();
  if (!g.cutscene?.startsWith('setup-done') && g.preview?.kind !== 'intro') return;
  if (g.preview) {
    endPreview();
    return;
  }
  cancelCutscene();
  clearProps();
  useSave.getState().setProfile({ setupDone: true });
  g.set({ highlight: null, fade: 0, scene: 'board', setupStep: null });
  placeAt(g.shownStars);
  boardCamera();
  g.set({ phase: data().records[today()] ? 'done' : 'ask' });
}

