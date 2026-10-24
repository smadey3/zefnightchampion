// The HTML layer over the 3D board, designed for a four-year-old who can't
// read yet: two giant picture buttons (a smiling sun for "dry", a hugging
// heart for "not dry"), the star counter, the meter of dry nights in a row
// with the underwear at the top, and Coach Rex's words as a caption. Grown-up
// controls hide behind the moon button.

import { useEffect, useRef, useState } from 'react';
import { childList, useGame, useQuest, useSave } from '../state/store';
import {
  addChildFromTitle,
  askForMoreClothes,
  closeWardrobe,
  collectPrize,
  openWardrobe,
  toggleOutfit,
  endPreview,
  playChild,
  pressDry,
  pressWet,
  replayToday,
  setupBack,
  setupDone,
  setupNameDone,
  setupPickColor,
  setupPickSpecies,
  setupWelcomeDone,
  skipIntro,
  tapCounter,
  tapMeter,
} from '../game/director';
import { DinoBadge } from './DinoBadge';
import { GoalChips } from './GoalChips';
import { HOW_LEAD, HowItWorksSheet, HowItWorksSteps } from './HowItWorks';
import { ParentButton, ParentPanel } from './ParentArea';
import { ArrowIcon, BigHeartIcon, ChestIcon, CheckIcon, HangerIcon, ReplayIcon, SoundOffIcon, SoundOnIcon, StarIcon, UnderpantsIcon, BigSunIcon } from './icons';
import { accessoryThumb } from './thumbs';
import { useOutfit } from '../board/Board';
import { finalStretch, landRange, landOf } from '../state/progress';
import { lastDotsSentence } from './meterWords';
import { ACCESSORIES, DINO_COLORS, SPECIES } from '../game/rewards';
import { setSoundOn } from '../audio/core';
import { sfx } from '../audio/sfx';

function Fade() {
  const fade = useGame((s) => s.fade);
  return <div className="fade" style={{ opacity: fade }} aria-hidden />;
}

function SoundToggle() {
  const on = useSave((s) => s.data.settings.sound);
  return (
    <button
      className={`corner-btn sound-btn${on ? ' on' : ''}`}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
      aria-pressed={on}
      onClick={() => {
        useSave.getState().setSettings({ sound: !on });
        setSoundOn(!on);
        if (!on) setTimeout(() => sfx.play('sparkle'), 60);
      }}
    >
      {on ? <SoundOnIcon /> : <SoundOffIcon />}
    </button>
  );
}

/** Stars so far, and how many more to the next treasure chest (tap it to hear Coach Rex say so). */
function StarCounter() {
  const shown = useGame((s) => s.shownStars);
  const scene = useGame((s) => s.scene);
  const highlight = useGame((s) => s.highlight);
  const rules = useSave((s) => s.data.rules);
  const [bump, setBump] = useState(false);
  const prev = useRef(shown);
  useEffect(() => {
    if (shown > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 700);
      prev.current = shown;
      return () => clearTimeout(t);
    }
    prev.current = shown;
  }, [shown]);
  if (scene !== 'board') return null;
  const land = landOf(shown, rules);
  const { start, end } = landRange(land, rules);
  const left = end - shown;
  const filled = end > start ? Math.round(((shown - start) / (end - start)) * 100) : 0;
  return (
    <button
      type="button"
      className={`star-counter${bump ? ' bump' : ''}${highlight === 'stars' ? ' glow' : ''}`}
      onClick={() => tapCounter()}
      aria-label={`${shown} ${shown === 1 ? 'star' : 'stars'} so far. ${left} more to the next treasure chest.`}
    >
      <span className="star-total">
        <StarIcon size={34} />
        <b>{shown}</b>
      </span>
      <span className="chest-left">
        <span className="chest-row">
          <ChestIcon size={24} />
          <span className="chest-more">
            <b>{left}</b> more
          </span>
        </span>
        <span className="chest-track" aria-hidden>
          <span style={{ width: `${filled}%` }} />
        </span>
      </span>
    </button>
  );
}

function UnderwearMeter() {
  const meter = useGame((s) => s.shownMeter);
  const scene = useGame((s) => s.scene);
  const highlight = useGame((s) => s.highlight);
  const rules = useSave((s) => s.data.rules);
  const goal = rules.goal;
  const earned = useSave((s) => s.data.underpants.earned);
  const tappable = useGame((s) => s.awaiting === 'intro-meter');
  if (scene !== 'board') return null;
  const filled = Math.min(goal, meter);
  const dots = Array.from({ length: goal }, (_, i) => goal - 1 - i);
  // the last dots that need dry nights in a row look different, with a little gap below them
  const { size, floor } = finalStretch(rules);
  const isFinal = (i: number) => size > 0 && floor > 0 && i >= floor;
  return (
    <div
      className={`meter${highlight === 'meter' ? ' glow' : ''}${earned ? ' earned' : ''}${tappable ? ' tappable' : ''}`}
      role={tappable ? 'button' : 'img'}
      aria-label={tappable ? 'Tap the underwear meter' : `Underwear meter: ${filled} of ${goal}${earned ? ' — ready for underwear at night!' : ''}`}
      onClick={tappable ? () => tapMeter() : undefined}
    >
      <div className="meter-top">
        <UnderpantsIcon size={46} gold={earned || filled >= goal} />
      </div>
      <div className="meter-track" style={{ ['--n' as string]: goal }}>
        {dots.map((i) => (
          <span
            key={i}
            className={`meter-dot${i < filled ? ' on' : ''}${i === filled - 1 ? ' newest' : ''}${isFinal(i) ? ' final' : ''}${isFinal(i) && i === floor ? ' final-start' : ''}`}
          />
        ))}
      </div>
      <div className="meter-count">
        {filled}/{goal}
      </div>
    </div>
  );
}

function Caption() {
  const caption = useGame((s) => s.caption);
  if (!caption) return null;
  return (
    <div className="caption" role="status" aria-live="polite">
      <p>{caption.text}</p>
    </div>
  );
}

/** "Zef's adventure!" (or "James' adventure!"). */
function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

/** The children on the title screen: everyone with a name. */
function useTitleKids() {
  const library = useSave((s) => s.library);
  return childList(library).filter((c) => c.data.profile.name.trim());
}

/** The name of the game, big, over the stage. */
function TitleLogo() {
  const phase = useGame((s) => s.phase);
  if (phase !== 'title') return null;
  return (
    <h1 className="title-logo">
      <span className="logo-dino" aria-hidden>
        {'Dino'.split('').map((ch, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.12}s` }}>
            {ch}
          </span>
        ))}
      </span>
      <span className="logo-quest" aria-hidden>
        Underwear Quest
      </span>
      <span className="sr-only">Dino Underwear Quest</span>
    </h1>
  );
}

/** Start (the very first time), or one button per child plus "Add new child". */
function TitleButtons() {
  const phase = useGame((s) => s.phase);
  const ready = useGame((s) => s.ready);
  const cloud = useSave((s) => s.cloud);
  const kids = useTitleKids();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 6000);
    return () => clearTimeout(t);
  }, []);
  if (phase !== 'title') return null;
  if (!kids.length && cloud === 'connecting' && !waited) {
    return <p className="title-note">Finding your adventures...</p>;
  }
  const howLink = (
    <button className="title-link" onClick={() => useGame.getState().set({ howItWorks: true })}>
      For grown-ups: how it works
    </button>
  );
  if (!kids.length) {
    return (
      <div className="title-buttons">
        <button className="title-btn start" disabled={!ready} onClick={() => addChildFromTitle()}>
          {ready ? 'Start!' : 'Waking up the dinos...'}
        </button>
        {howLink}
      </div>
    );
  }
  return (
    <div className="title-buttons" role="group" aria-label="Whose adventure?">
      {kids.map((k) => {
        const color = DINO_COLORS[k.data.profile.color] ?? DINO_COLORS[0];
        return (
          <button
            key={k.id}
            className="title-btn kid"
            disabled={!ready}
            style={{ ['--dino' as string]: color.body, ['--dino-belly' as string]: color.belly }}
            onClick={() => playChild(k.id)}
          >
            <span className="kid-badge">
              <DinoBadge species={k.data.profile.species} color={color} />
            </span>
            <span className="kid-name">{possessive(k.data.profile.name)} adventure!</span>
          </button>
        );
      })}
      <button className="title-btn add" disabled={!ready} onClick={() => addChildFromTitle()}>
        + Add new child
      </button>
      {howLink}
    </div>
  );
}

function MorningButtons() {
  const phase = useGame((s) => s.phase);
  const preview = useGame((s) => s.preview);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (phase === 'ask') setPressed(false);
  }, [phase]);
  if (phase !== 'ask' || preview) return null;
  return (
    <div className="morning" role="group" aria-label="How was last night?">
      <button
        className="big-btn dry"
        disabled={pressed}
        onClick={() => {
          if (pressed) return;
          setPressed(true);
          pressDry();
        }}
        aria-label="Dry! I stayed dry"
      >
        <span className="big-icon">
          <BigSunIcon />
        </span>
        <span className="big-label">Dry!</span>
      </button>
      <button
        className="big-btn wet"
        disabled={pressed}
        onClick={() => {
          if (pressed) return;
          setPressed(true);
          pressWet();
        }}
        aria-label="Not dry. Hug time"
      >
        <span className="big-icon">
          <BigHeartIcon />
        </span>
        <span className="big-label">Not dry</span>
      </button>
    </div>
  );
}

function Done() {
  const phase = useGame((s) => s.phase);
  const cutscene = useGame((s) => s.cutscene);
  const dressUp = useGame((s) => s.dressUp);
  const hint = useGame((s) => s.dressHint);
  const collected = useGame((s) => s.shownAccessories);
  const quest = useQuest();
  if (phase !== 'done' || cutscene || dressUp) return null;
  return (
    <div className="done">
      {collected > 0 && (
        <div className="round-wrap">
          <button className={`round-btn dress${hint ? ' call' : ''}`} onClick={() => openWardrobe()} aria-label="Dress up your dino">
            <HangerIcon />
          </button>
          <span className="round-label" aria-hidden>
            Dress up
          </span>
        </div>
      )}
      <div className="done-card">
        <span className="done-text">See you tomorrow!</span>
        <span className="done-sub">
          {quest.latest?.result === 'wet' ? 'Big hug! Tonight is a new try.' : 'Go potty before bed tonight!'}
        </span>
      </div>
      <div className="round-wrap">
        <button className="round-btn" onClick={() => replayToday()} aria-label="Watch it again">
          <ReplayIcon />
        </button>
        <span className="round-label" aria-hidden>
          Watch again
        </span>
      </div>
    </div>
  );
}

/** The wardrobe: pictures of everything collected; tap to put on or take off. */
function Wardrobe() {
  const open = useGame((s) => s.dressUp && s.phase === 'done' && s.scene === 'board' && !s.preview);
  const collected = useGame((s) => s.shownAccessories);
  const species = useSave((s) => s.data.profile.species);
  const outfit = useOutfit();
  // pictures by dino and item, so another child's wardrobe never shows the wrong dino
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    // draw the pictures one at a time so the wardrobe opens straight away
    let cancelled = false;
    let i = 0;
    const next = () => {
      if (cancelled || i >= collected) return;
      const url = accessoryThumb(i, species);
      const k = `${species}:${i}`;
      if (url) setThumbs((t) => (t[k] === url ? t : { ...t, [k]: url }));
      i++;
      setTimeout(next, 0);
    };
    const t = setTimeout(next, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, collected, species]);
  if (!open) return null;
  return (
    <div className="wardrobe" role="dialog" aria-label="Dress up">
      <p className="wardrobe-tip">Tap to put it on. Tap again to take it off.</p>
      <div className="wardrobe-grid">
        {ACCESSORIES.slice(0, collected).map((a, i) => {
          const worn = outfit[a.slot] === i;
          const thumb = thumbs[`${species}:${i}`];
          return (
            <button key={a.id} className={`wardrobe-item${worn ? ' worn' : ''}`} onClick={() => toggleOutfit(i)} aria-pressed={worn} aria-label={a.name}>
              {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="thumb-wait" />}
              {worn && (
                <span className="worn-badge" aria-hidden>
                  <CheckIcon />
                </span>
              )}
            </button>
          );
        })}
        {collected < ACCESSORIES.length && (
          <button className="wardrobe-item mystery" onClick={() => askForMoreClothes()} aria-label="More to find in mystery eggs">
            ?
          </button>
        )}
      </div>
      <button className="wardrobe-done" onClick={() => closeWardrobe()} aria-label="Done dressing up">
        <CheckIcon />
      </button>
    </div>
  );
}

/** The big button under the prize that floats out of the egg. */
function CollectButton() {
  const awaiting = useGame((s) => s.awaiting);
  if (awaiting !== 'collect') return null;
  return (
    <button className="collect-btn" onClick={() => collectPrize()} aria-label="Collect the prize">
      <StarIcon size={40} />
      <span>Collect!</span>
    </button>
  );
}

/** Only for a grown-up's preview: a "Watch it again" replay is just the game. */
function PreviewBanner() {
  const preview = useGame((s) => s.preview);
  const setupStep = useGame((s) => s.setupStep);
  if (!preview || preview.replay || preview.kind === 'intro' || setupStep) return null;
  return (
    <div className="preview-banner" role="status">
      <span>Grown-up preview</span>
      <button className="btn small" onClick={() => endPreview()}>
        Stop
      </button>
    </div>
  );
}

function SkipIntro() {
  const cut = useGame((s) => s.cutscene);
  const preview = useGame((s) => s.preview);
  if (!(cut?.startsWith('setup-done') || preview?.kind === 'intro')) return null;
  return (
    <button className="skip-btn" onClick={() => skipIntro()}>
      Skip intro <ArrowIcon />
    </button>
  );
}

// ----------------------------------------------------------- setup steps

function SetupName() {
  const name = useSave((s) => s.data.profile.name);
  const canGoBack = useGame((s) => s.setupBack);
  const setupRules = useSave((s) => s.data.rules);
  const meterMode = setupRules.meter;
  const [value, setValue] = useState(name);
  const ok = value.trim().length > 0;
  return (
    <form
      className="setup-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) setupNameDone(value);
      }}
    >
      <h1>A new adventure</h1>
      <p className="muted">For grown-ups: who's going on this adventure?</p>
      <label className="name-field">
        <span>Your child's name</span>
        <input value={value} placeholder="Name" onChange={(e) => setValue(e.target.value)} maxLength={24} autoComplete="off" />
      </label>
      <div className="name-field">
        <span>How many dry nights fill the underwear meter?</span>
        <GoalChips label="Dry nights to fill the meter" />
      </div>
      <p className="muted small">
        {meterMode === 'streak' ? 'The meter fills with dry nights in a row.' : `Each dry night adds a dot, and a not-dry night only takes one away. ${lastDotsSentence(setupRules)}`.trim()} Tip:
        if dry nights are still rare, start small. A goal they can reach feels great, and you can change it any time behind the moon button.
      </p>
      <div className="row setup-actions">
        {canGoBack && (
          <button className="btn big" type="button" onClick={() => setupBack()}>
            Back
          </button>
        )}
        <button className="btn primary big" type="submit" disabled={!ok}>
          Next <ArrowIcon />
        </button>
      </div>
    </form>
  );
}

function SetupDino() {
  return (
    <div className="setup-bottom" role="group" aria-label="Pick your dino">
      <p className="setup-hint">Pick your dino!</p>
      <div className="species-row">
        {SPECIES.map((s) => (
          <button key={s.id} className="btn chip-btn" onClick={() => setupPickSpecies(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SetupColor() {
  const color = useSave((s) => s.data.profile.color);
  const busy = useGame((s) => s.cutscene !== null);
  return (
    <div className="setup-bottom" role="group" aria-label="Pick a color">
      <div className="swatches">
        {DINO_COLORS.map((c, i) => (
          <button
            key={c.name}
            className={`swatch${i === color ? ' on' : ''}`}
            style={{ background: c.body }}
            aria-label={c.name}
            aria-pressed={i === color}
            onClick={() => setupPickColor(i)}
          />
        ))}
      </div>
      <button className="btn primary big go-btn" disabled={busy} onClick={() => setupDone()}>
        Let's go! <ArrowIcon />
      </button>
    </div>
  );
}

/** Before the very first child: what this game is, for grown-ups. */
function SetupWelcome() {
  return (
    <div className="setup-card welcome" role="group" aria-labelledby="welcome-title">
      <h1 id="welcome-title">Hi, grown-ups!</h1>
      <p className="how-lead">{HOW_LEAD}</p>
      <h2 className="how-sub">Here's how it works</h2>
      <HowItWorksSteps />
      <p className="muted small">
        It takes about a minute a day. Next, you'll add your child's name and pick a goal. Then hand over the phone so they can choose their very own
        dino!
      </p>
      <div className="row setup-actions sticky-actions">
        <button className="btn big" type="button" onClick={() => setupBack()}>
          Back
        </button>
        <button className="btn primary big" type="button" onClick={() => setupWelcomeDone()}>
          Set it up <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

function useSetupStep() {
  const step = useGame((s) => s.setupStep);
  const scene = useGame((s) => s.scene);
  return step && scene === 'setup' ? step : null;
}

function Setup() {
  const step = useSetupStep();
  if (step === 'welcome') return <SetupWelcome />;
  return step === 'name' ? <SetupName /> : null;
}

/** The setup choices that sit along the bottom edge. */
function SetupBottom() {
  const step = useSetupStep();
  if (step === 'dino') return <SetupDino />;
  if (step === 'color') return <SetupColor />;
  return null;
}

export function Overlay() {
  const parentOpen = useGame((s) => s.parentOpen);
  return (
    <>
      <Fade />
      <div className="hud" aria-hidden={parentOpen}>
        <SoundToggle />
        <ParentButton />
        <StarCounter />
        <UnderwearMeter />
        <SkipIntro />
        <Setup />
        <TitleLogo />
        <div className="dock">
          <Caption />
          <TitleButtons />
          <CollectButton />
          <MorningButtons />
          <Done />
          <Wardrobe />
          <SetupBottom />
        </div>
      </div>
      <PreviewBanner />
      <ParentPanel />
      <HowItWorksSheet />
    </>
  );
}
