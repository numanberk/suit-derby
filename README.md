# Suit Derby: Gambler's Night

A browser game. You own no horse: you are a gambler at a card-driven horse race. Four suit horses
run through one shuffled deck, and **every card drawn is the only way time passes**. For each race you
call the full finishing order, lock your slip, and then bend the deck and the track with tools
without letting the stewards catch you. What you hold at the end of the night is your score, and it earns
Reputation Points for a permanent skill tree.

### v13: the horse game is gone
The old owner mode (laps, pit stops, Stable, Daily Derby, real-time Brace/Spur) was removed. Gambler's Night is now the
whole game: the menu is Gambler's Night / Reputation / Rules, the Rules page and a five-card first-run guide were rewritten
for it (English and Turkish), the Turkish dictionary and CSS were pruned to what is still used (page 515 KB to 195 KB).
The leftover horse save (`suitderby.run`) is deleted on load; the Reputation save (`suitderby.g1`) and night save (`suitderby.grun`) are unchanged.

### How it plays
- **Card time.** Every card drawn moves one horse (plain card 1 step, face card 2); the race ends when 3 horses cross the line (10 steps). Each race builds a fresh deck with uneven suit counts, shown on the deck sheet, so the deck is the form guide and card counting matters.
- **Read, Call, Rig.** Study the deck sheet and the odds board, call a horse for each place (full order for the perfect-order bonus, which pays more the longer the shot) and lock the slip before the first card. Odds come from simulating the rest of the deck and lock with the slip. After the lock a place can still be changed for a fee (20% of its stake) at the odds of that moment.
- **Tools** (cash plus Heat, limited uses per race): Peek, Burn, Stack, Mud, Swap, Tailwind, Shave, Hurdle, Riffle, Lane Swap. Four are open from the start; the rest are unlocked in Reputation. They nudge the odds but never decide a race.
- **Heat and stewards.** Every trick adds Heat; it cools a little per card and between races. From 5 Heat each trick risks a steward inspection (fine and the tool is confiscated). At 10 Heat you are caught: slip void and a fine.
- **Backroom.** Between races buy one favor out of three (12 favors that last the night), cool off, or borrow from the loan shark.
- **Reputation:** a fogged skill tree (25 nodes, 4 branches: Toolbox, Nerve, Bankroll, The Book), earned in RP at the end of a night. A night is saved after every move and resumes from the menu.
- Balance (`node simg.js`): plain likeliest-order play is about break-even (+0.6%); careful rigging at Heat 6 or less is about +21%; unrestricted rigging about +9% with roughly one inspection a night.
- **Open decision (revisit later):** how strong rigging should be (the "nudges" question).

## Play
Open `dist/suit-derby.html` in a browser. It is one self-contained file
(it only asks Google Fonts for typefaces in the artifact build; the standalone file embeds them).

## Layout
    src/index.html   page structure: menu, the six Gambler's Night screens, rules, guide
    src/style.css    all styling
    src/gamble.js    engine (pure JS, runs in Node): deck, quotes, tools, Heat, settle, Reputation tree
    src/gamble_ui.js the screens: setup, book, race, backroom, night over, Reputation
    src/app.js       shell: navigation, sound buttons, language switch, menu, rules, first-run guide
    src/audio.js     WebAudio engine (Sfx): effects, music, both switches
    src/i18n.js      translator: t('English text', {params}), language switch, saved choice
    src/lang_tr.js   Turkish dictionary
    src/fx.js        win effects: coins, confetti, banner, shake
    build.py         inlines everything into dist/suit-derby.html, dist/artifact.html and dist/site/ (offline-installable)
    fonts/ icons/    embedded fonts, app icons (make_icons.py redraws them)
    simg.js          balance simulation:  node simg.js plain|rig|rigmax|ceil [nights]
    testg.js         engine tests:        node testg.js
    gplaytest.py     browser test of a full night, Reputation, resume, phone (LANG_ID=tr for Turkish; needs python playwright + chromium)

## Tuning
All numbers live in `CFG`, `TOOLS` and `FAVORS` at the top of `src/gamble.js`, and the Reputation nodes in `Gamble.Meta`.
After changing them run `node testg.js` and `node simg.js`.

## Build
    python3 build.py
