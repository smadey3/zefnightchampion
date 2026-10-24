// Zustand stores: the saved adventures and the transient game/UI state.

import { create } from 'zustand';
import {
  applyDerived,
  clampGoal,
  newQuest,
  seenFromRecords,
  startOver,
  withRecord,
  type Profile,
  type SaveData,
  type Seen,
  type Settings,
} from './save';
import {
  childOrder,
  loadLibrary,
  mergeCloud,
  newChildId,
  newChildSave,
  persistLibrary,
  sameContent,
  type CloudDoc,
  type Library,
} from './library';
import { FINAL_RUN, computeQuest, type DateKey, type MeterMode, type NightResult, type QuestState } from './progress';
import type { Prize, Slot } from '../game/rewards';

/**
 * Where progress is kept: `on` = online with the family's copy (follows the
 * grown-up's Claude account), `guest` = this person can look but not save
 * online (kept on this device), `off` = this device only, `connecting` =
 * still finding out.
 */
export type CloudStatus = 'off' | 'connecting' | 'on' | 'guest';

/** The cloud module plugs in here, so the store can ask it to send changes. */
export const cloudHooks = {
  upload: (_id: string) => undefined as void,
  tombstone: (_id: string) => undefined as void,
};

interface SaveStore {
  /** the current child's save, with this device's sound settings */
  data: SaveData;
  library: Library;
  storageOk: boolean;
  cloud: CloudStatus;
  record: (date: DateKey, result: NightResult | null) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setGoal: (goal: number) => void;
  /** what a not-dry night does to the meter */
  setMeterMode: (mode: MeterMode) => void;
  setFinalRun: (on: boolean) => void;
  setPrizes: (prizes: Prize[]) => void;
  setPrizeGiven: (i: number, given: boolean) => void;
  setOutfit: (slot: Slot, accessory: number) => void;
  pickUnderpants: (design: number) => void;
  undoUnderpants: () => void;
  markSeen: (patch: Partial<Seen>) => void;
  replace: (data: SaveData) => void;
  startNewQuest: () => void;
  startOver: () => void;
  /** play as this child from now on */
  selectChild: (id: string) => void;
  /** a new child, not set up yet, who becomes the current one */
  addChild: () => string;
  /** take a child out of the game (online too) */
  removeChild: (id: string) => void;
  /** fold in the online copies */
  applyCloud: (docs: CloudDoc[], definitive: boolean) => void;
  setCloud: (status: CloudStatus) => void;
  /** the online copy now has this version of a child */
  markUploaded: (id: string, updatedAt: string) => void;
  /** the online copy knows this child was removed */
  markTombstoned: (id: string) => void;
}

/** The save the game shows: the current child, or an empty one before any child exists. */
function currentData(lib: Library): SaveData {
  const c = lib.current ? lib.children[lib.current] : null;
  return { ...(c ? c.data : newChildSave()), settings: lib.settings };
}

/** Should this child go online yet? Not a blank one nobody has named. */
export function worthUploading(d: SaveData): boolean {
  return d.profile.name.trim() !== '' || Object.keys(d.records).length > 0;
}

const initialLibrary = loadLibrary();

export const useSave = create<SaveStore>((set, get) => {
  const commit = (library: Library, data?: SaveData) => set({ library, data: data ?? currentData(library), storageOk: persistLibrary(library) });
  const put = (next: SaveData) => {
    const { library } = get();
    const id = library.current;
    const prev = id ? library.children[id] : null;
    if (!id || !prev) {
      set({ data: { ...next, settings: library.settings } });
      return;
    }
    if (sameContent(prev.data, next)) {
      set({ data: { ...next, settings: library.settings } });
      return;
    }
    const stamped: SaveData = { ...next, updatedAt: new Date().toISOString(), settings: library.settings };
    commit({ ...library, children: { ...library.children, [id]: { ...prev, data: stamped, dirty: true } } }, stamped);
    if (worthUploading(stamped)) cloudHooks.upload(id);
  };
  return {
    data: currentData(initialLibrary),
    library: initialLibrary,
    storageOk: true,
    cloud: 'off',
    record(date, result) {
      const prev = get().data;
      const next = withRecord(prev, date, result);
      if (next !== prev) put(next);
    },
    setSettings(patch) {
      const { library } = get();
      const settings = { ...library.settings, ...patch };
      commit({ ...library, settings }, { ...get().data, settings });
    },
    setProfile(patch) {
      put({ ...get().data, profile: { ...get().data.profile, ...patch } });
    },
    setGoal(goal) {
      const d = get().data;
      put(applyDerived({ ...d, rules: { ...d.rules, goal: clampGoal(goal) } }));
    },
    setMeterMode(mode) {
      const d = get().data;
      put(applyDerived({ ...d, rules: { ...d.rules, meter: mode } }));
    },
    setFinalRun(on) {
      const d = get().data;
      put(applyDerived({ ...d, rules: { ...d.rules, finalRun: on ? FINAL_RUN : 0 } }));
    },
    setPrizes(prizes) {
      put({ ...get().data, prizes });
    },
    setPrizeGiven(i, given) {
      const d = get().data;
      const s = new Set(d.prizesGiven);
      if (given) s.add(i);
      else s.delete(i);
      put({ ...d, prizesGiven: [...s].sort((a, b) => a - b) });
    },
    setOutfit(slot, accessory) {
      const d = get().data;
      put({ ...d, outfit: { ...d.outfit, [slot]: accessory } });
    },
    pickUnderpants(design) {
      const d = get().data;
      put({ ...d, underpants: { ...d.underpants, pick: design } });
    },
    undoUnderpants() {
      const d = get().data;
      const next = applyDerived({ ...d, underpants: { earned: false, on: null, pick: null } });
      put({ ...next, seen: { ...next.seen, underpants: next.underpants.earned } });
    },
    markSeen(patch) {
      put({ ...get().data, seen: { ...get().data.seen, ...patch } });
    },
    replace(data) {
      put(applyDerived(data));
    },
    startNewQuest() {
      const next = newQuest(get().data);
      put({ ...next, seen: seenFromRecords(next) });
    },
    startOver() {
      put(startOver(get().data));
    },
    selectChild(id) {
      const { library } = get();
      if (!library.children[id]) return;
      commit({ ...library, current: id });
    },
    addChild() {
      const { library } = get();
      const id = newChildId();
      const data = { ...newChildSave(), settings: library.settings };
      commit({ ...library, current: id, children: { ...library.children, [id]: { data, dirty: true } } });
      return id;
    },
    removeChild(id) {
      const { library } = get();
      if (!library.children[id]) return;
      const children = { ...library.children };
      const wasOnline = worthUploading(children[id].data);
      delete children[id];
      const removed = wasOnline ? [...library.removed.filter((x) => x !== id), id].slice(-50) : library.removed;
      commit({ ...library, children, removed, current: library.current === id ? null : library.current });
      if (wasOnline) cloudHooks.tombstone(id);
    },
    applyCloud(docs, definitive) {
      const { library } = get();
      const res = mergeCloud(library, docs, definitive);
      const before = library.current ? library.children[library.current]?.data : null;
      const after = res.lib.current ? res.lib.children[res.lib.current]?.data : null;
      commit(res.lib, before === after ? get().data : undefined);
      for (const id of res.upload) if (worthUploading(res.lib.children[id].data)) cloudHooks.upload(id);
      for (const id of res.tombstones) cloudHooks.tombstone(id);
    },
    setCloud(status) {
      set({ cloud: status });
    },
    markUploaded(id, updatedAt) {
      const { library } = get();
      const c = library.children[id];
      if (!c || !c.dirty || c.data.updatedAt !== updatedAt) return;
      commit({ ...library, children: { ...library.children, [id]: { data: c.data, dirty: false } } }, get().data);
    },
    markTombstoned(id) {
      const { library } = get();
      if (!library.removed.includes(id)) return;
      commit({ ...library, removed: library.removed.filter((x) => x !== id) }, get().data);
    },
  };
});

/** The children on this device, oldest adventure first. */
export function childList(lib: Library): { id: string; data: SaveData }[] {
  return childOrder(lib).map((id) => ({ id, data: lib.children[id].data }));
}

/** What the morning screen and the 3D board are showing. */
export type Phase =
  | 'boot'
  | 'title' // the title screen: pick whose adventure (the tap also wakes the sound)
  | 'setup' // a new child: name, pick a dino, the mission
  | 'ask' // the two big buttons
  | 'event' // a celebration, hug, prize or store visit is playing
  | 'done'; // today is recorded: see you tomorrow

export type PreviewKind = 'dry' | 'wet' | 'prize' | 'store' | 'intro' | 'surprise';

export interface PreviewState {
  kind: PreviewKind;
  /** the child's own "Watch it again", not a grown-up's preview */
  replay?: boolean;
}

/** A line of text shown while the coach talks (also read to screen readers). */
export interface Caption {
  text: string;
  who: 'coach' | 'zef';
}

export type SceneId = 'board' | 'store' | 'setup' | 'title';
export type SetupStep = 'welcome' | 'name' | 'dino' | 'color';

interface GameStore {
  phase: Phase;
  scene: SceneId;
  setupStep: SetupStep | null;
  /** the setup can go back to the title screen (adding a child, not starting over) */
  setupBack: boolean;
  /** the "how it works" sheet for grown-ups is open */
  howItWorks: boolean;
  /** accessories the board shows as unlocked (the egg reveals the newest) */
  shownAccessories: number;
  /** chests the board shows as opened */
  openedChests: number;
  /** the dino wears its store underpants */
  showUnderpants: boolean;
  /** underwear picked during a preview (never saved) */
  previewUnderpants: number | null;
  /** the overlay piece Coach Rex is talking about */
  highlight: 'meter' | 'stars' | null;
  preview: PreviewState | null;
  /** name of the running event, null when idle */
  cutscene: string | null;
  parentOpen: boolean;
  caption: Caption | null;
  /** 0 = clear, 1 = covered (scene transitions) */
  fade: number;
  /** the 3D scene has built */
  ready: boolean;
  /** the board land in view */
  land: number;
  /** star count the board shows (animates up during a celebration) */
  shownStars: number;
  /** meter value the overlay shows (animates during events) */
  shownMeter: number;
  /** the store scene is showing instead of the board */
  inStore: boolean;
  /** dress-up shelf is open */
  dressUp: boolean;
  /** the hanger button wiggles: the wardrobe hasn't been opened yet on this device */
  dressHint: boolean;
  /** waiting for the child to tap something during an event */
  awaiting:
    | null
    | 'highfive'
    | 'egg'
    | 'collect'
    | 'roar'
    | 'chest'
    | 'store-pick'
    | 'hug-done'
    | 'balloons'
    | 'fireworks'
    | 'peekaboo'
    | 'tickle'
    | 'snack'
    | 'band'
    | 'intro-star'
    | 'intro-chest'
    | 'intro-meter'
    | 'intro-roar';
  /** increments to ask the director to re-check progress */
  checkToken: number;
  set: (patch: Partial<Omit<GameStore, 'set'>>) => void;
}

export const useGame = create<GameStore>((set) => ({
  phase: 'boot',
  scene: 'board',
  setupStep: null,
  setupBack: false,
  howItWorks: false,
  shownAccessories: 0,
  openedChests: 0,
  showUnderpants: true,
  previewUnderpants: null,
  highlight: null,
  preview: null,
  cutscene: null,
  parentOpen: false,
  caption: null,
  fade: 0,
  ready: false,
  land: 0,
  shownStars: 0,
  shownMeter: 0,
  inStore: false,
  dressUp: false,
  dressHint: false,
  awaiting: null,
  checkToken: 0,
  set: (patch) => set(patch),
}));

export function questOf(data: SaveData): QuestState {
  return computeQuest(data.records, data.rules);
}

/** React hook for the quest numbers. */
export function useQuest(): QuestState {
  const records = useSave((s) => s.data.records);
  const rules = useSave((s) => s.data.rules);
  return computeQuest(records, rules);
}
