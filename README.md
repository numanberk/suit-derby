# Suit Derby

A browser game: four suit horses race through one shared deck. A run is 5 or 10 laps.
Every lap is a full race; you earn run cash, spend it on upgrades in a pit shop between laps,
and lose whatever is left when the run ends. Stable Points earned at the end of a run buy
permanent perks in The Stable.

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
Online: https://numanberk.github.io/suit-derby/

Or open `index.html` (same file as `dist/suit-derby.html`) in a browser. It is one self-contained file
(it only asks Google Fonts for typefaces; it works without them).

## Layout
    src/index.html   page structure: menu, setup, game, pit stop, run over, Stable, rules
    src/style.css    all styling
    src/engine.js    game rules: deck, laps, upgrades, cash, shop (no DOM, runs in Node)
    src/meta.js      Stable perks and saved progress (localStorage)
    src/app.js       screens, race rendering, input
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
    cp dist/suit-derby.html index.html   # index.html is what GitHub Pages serves
