# Suit Derby

A browser game: four suit horses race through one shared deck. A run is 5 or 10 laps.
Every lap is a full race; you earn run cash, spend it on upgrades in a pit shop between laps,
and lose whatever is left when the run ends. Stable Points earned at the end of a run buy
permanent perks in The Stable.

### v7: sound
All sound is synthesized live with WebAudio (no audio files). Every card drawn is a soft mallet note on a
pentatonic scale, so the race plays a little tune; a next-card hit streak climbs the scale; wins escalate
from a coin ping to a coin shower, a brass fanfare and a jackpot siren; misses are a soft low blip. A quiet
crowd and a galloping hoofbeat sit under the race and swell when something happens. Buttons tick, chips click,
buying goes cha-ching, and the lap payout counts up with rising ticks. Sound starts after your first tap,
the speaker button (menu and race screen) or the **M** key mutes it, and the choice is saved.

### v6: Turkish language
Pick **English** or **Türkçe** with the switch at the top of the menu. The choice is remembered in this
browser (and defaults to Turkish on Turkish-language browsers). Every screen, upgrade, perk, the rules
and the canvas labels are translated. To add a language, copy `src/lang_tr.js`, translate the values
(the English text is the key), and add it to `LANGS` in `src/i18n.js`.

### v5: a race you play, not just watch
- **Stamina Spur for every horse.** Stamina refills all lap; a Spur spends it all and the surge grows faster than the stamina (full bar is about 3x a half bar), so waiting pays but going early works. Rivals spur too, each with its own patience.
- **Hazards.** Every horse meets 3 per lap. Tap Brace (Space or B) when it lights up: gold zone = perfect jump (surge and $8), miss = stumble. The game slows while a hazard is open.
- **Next-card bets.** Bet on the suit of the next card at the exact odds of the cards left. Hit streaks refill your stamina. Scout Lens marks suits that will not come next.
- **Underdog fund.** At every pit stop a suit under 22% of the deck gets free cards, so no horse is starved out of a run.
- **Stadium view and win effects.** Canvas race scene with a following camera, crowd, hazards, dust and speed lines; coins, confetti, shockwaves, a BIG WIN banner and screen shake (`src/scene.js`, `src/fx.js`).

### v4: longer races, small deck
- The deck is 40 cards (10 per suit, ranks 5 to Ace) and cards are drawn without being put back, so a suit that has come up a lot runs dry and trailing horses get the next cards.
- Each card is a small push (`surgeBase` + rank x `surgeVal`), draws come every 2.4 s, and a lap takes about a minute.
- Every upgrade was re-tuned for the small deck (card counts roughly halved) and checked with `node sim.js iso`.

### What v3 adds
- **Level start.** Every horse begins with 26 cards and no upgrades. The shop opens after lap 1.
- **Call the order.** Before every lap, pick a horse for 1st, 2nd, 3rd and 4th with a stake each.
  Odds come from a Monte-Carlo bookie (`quote()` in the engine) and lock when the lap starts.
  Combos on total winnings for 2, 3 or 4 correct calls; every correct call also earns a Stable Point.
- **Locked 1st call.** Your own horse is always your 1st-place call (stake adjustable, can't be removed). 2nd to 4th are optional.
- **Luck.** Horseshoe, Jackpot, Coin of Fate, Loaded Dice and Chaos Cards, plus a higher/lower card table.
- **Tiered upgrades.** Common $50, Rare $110, Epic $210, Legendary $380. The shop shows the rarity odds.
- **Rival AI** buys upgrades too, and you see what they took.

## Play
Open `dist/suit-derby.html` in a browser. It is one self-contained file
(it only asks Google Fonts for typefaces; it works without them).

## Layout
    src/index.html   page structure: menu, setup, game, pit stop, run over, Stable, rules
    src/style.css    all styling
    src/engine.js    game rules: deck, laps, upgrades, cash, shop (no DOM, runs in Node)
    src/audio.js     WebAudio sound engine (Sfx): every effect, crowd, hoofbeats, mute
    src/i18n.js      translator: t('English text', {params}), language switch, saved choice
    src/lang_tr.js   Turkish dictionary and Turkish rules page
    src/meta.js      Stable perks and saved progress (localStorage)
    src/scene.js     the canvas race scene (camera, crowd, horses, hazards)
    src/fx.js        win effects: coins, confetti, banner, shake
    src/app.js       screens, input, HUD, bets
    build.py         inlines everything into dist/suit-derby.html
    sim.js           balance simulation:  node sim.js
    playtest.py      headless full-run test (calls, shop, card table) (needs python playwright + chromium)

## Tuning
All numbers live in `CFG` at the top of `src/engine.js` (lap length, prizes, points, AI upgrade
chance, shop size) and in the `UPGRADES` list below it. Stable perks and their costs are in
`ITEMS` in `src/meta.js`. After changing them, run `node sim.js` to see champion rates for
a no-purchase, a random-buyer and a greedy-buyer player.

## Build
    python3 build.py
