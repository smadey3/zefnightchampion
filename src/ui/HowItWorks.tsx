// What this game is for, in plain words, for grown-ups who didn't set it
// up: shown before the first child is added, and any time from the title
// screen ("For grown-ups: how it works") and the grown-up corner.

import { useEffect, useRef } from 'react';
import { useGame, useSave } from '../state/store';
import { BigHeartIcon, BigSunIcon, ChestIcon, HangerIcon, StarIcon, UnderpantsIcon } from './icons';
import { lastDotsSentence } from './meterWords';

export const HOW_LEAD =
  'Dino Underwear Quest is a quick morning game for kids who are learning to stay dry at night. It turns every morning into a little celebration, so your child gets excited about wearing underwear to bed instead of diapers.';

export function HowItWorksSteps() {
  const rules = useSave((s) => s.data.rules);
  const kind = rules.meter !== 'streak';
  const lastDots = lastDotsSentence(rules);
  return (
    <ol className="how-steps">
      <li>
        <span className="how-icon pair" aria-hidden>
          <span className="mini">
            <BigSunIcon />
          </span>
          <span className="mini">
            <BigHeartIcon />
          </span>
        </span>
        <p>
          <strong>Every morning</strong>, your child taps one big button: the sun if they woke up dry, or the heart if they didn't.
        </p>
      </li>
      <li>
        <span className="how-icon" aria-hidden>
          <StarIcon size={30} />
        </span>
        <p>
          <strong>A dry night</strong> earns a star. Their dino hops ahead on the game board, and a fun surprise pops up.
        </p>
      </li>
      <li>
        <span className="how-icon" aria-hidden>
          <span className="mini">
            <BigHeartIcon />
          </span>
        </span>
        <p>
          <strong>Not dry?</strong> No big deal. Coach Rex, a friendly T. rex, gives them a big hug, and stars are never taken away.
        </p>
      </li>
      <li>
        <span className="how-icon" aria-hidden>
          <ChestIcon size={30} />
        </span>
        <p>
          <strong>Treasure chests</strong> along the way hold real prizes that you hand out, like a movie night or a treat. The first one is just 5 dry
          nights away, and you choose the prizes. The top of the screen shows the stars so far and how many more until the next chest (tap it to hear
          Coach Rex say it).
        </p>
      </li>
      <li>
        <span className="how-icon" aria-hidden>
          <span className="how-hanger">
            <HangerIcon />
          </span>
        </span>
        <p>
          <strong>Dress-up:</strong> every other dry night, a mystery egg hatches something for their dino to wear, like a cap or sunglasses. After the
          morning, the purple hanger button opens the dress-up closet: tap a picture to put it on, and tap it again to take it off.
        </p>
      </li>
      <li>
        <span className="how-icon" aria-hidden>
          <UnderpantsIcon size={34} />
        </span>
        <p>
          <strong>The underwear meter</strong>{' '}
          {kind
            ? `gets a dot for every dry night, and a not-dry night only takes one away, so a few accidents never undo all their hard work.${lastDots ? ` ${lastDots}` : ''} When it's full,`
            : "fills up with dry nights in a row. When it's full,"}{' '}
          your child is ready to wear underwear at night, and picks out a pair for their dino too!
        </p>
      </li>
    </ol>
  );
}

/** The same explanation as a sheet over the title screen or the grown-up corner. */
export function HowItWorksSheet() {
  const open = useGame((s) => s.howItWorks);
  const sheet = useRef<HTMLDivElement>(null);
  // focus the sheet itself (not its button at the bottom), so it opens at the top
  useEffect(() => {
    if (open) sheet.current?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  const close = () => useGame.getState().set({ howItWorks: false });
  return (
    <div
      className="modal-backdrop top"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet how-sheet" ref={sheet} tabIndex={-1}>
        <h2 id="how-title">How Dino Underwear Quest works</h2>
        <p className="how-lead">{HOW_LEAD}</p>
        <HowItWorksSteps />
        <p className="muted small">
          It takes about a minute each morning. To fix a tap, or change the prizes or the goal, press and hold the moon button in the corner.
        </p>
        <div className="row end sticky-actions">
          <button className="btn primary" onClick={close}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
