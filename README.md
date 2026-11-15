# Microbe Wars Online

A browser alpha for solo play or two human players. The lobby is open to anyone with the site link. Online matches are invite-only.

## Play

Choose **Pass & Play** for two people on one device. Pass the device at each handoff screen, then the next player reveals their hand. The game also uses this screen for secret-objective setup and reactions that need the other player. Refreshing the same tab resumes behind the handoff screen. This mode runs in the browser after the game loads and uses the same rules as online play.

Use **Tutorial** to practice the core decisions, **Glossary** to look up a term, and **Settings** for night mode and text size. Hand cards show their ability, synergy, cost and tags. **Inspect** opens a card's details. **Play** arms the card for placement. The six spaces in each site grid belong to that site. The match key explains the O, A and R strips on bacterial cards. Your private objectives show their point values and update as the board changes.

### Play from separate devices

1. Open the site and choose **Create private room**. Choose either faction.
2. Share the single-use room link with your opponent so they can claim the second seat.
3. Both players keep two of three secret objectives. The first player is chosen at random.
4. Choose **Play** on a hand card. For a paid play, mark the required number of **other** hand cards as payment. Choose a highlighted open space to commit the play. The server validates the price, location and turn.
5. Follow prompts for targets, bonus plays, Refuge and other reactions. End your turn when done. If over 12 cards, choose which to discard.

New matches start with six cards. Bacteria draws from 94 cards, including one copy of each of the 22 expansion designs. Host draws from 72 cards. Each turn gives three actions. Spend each action to play a card at its usual cost, draw one card from your deck, or take the face-up top card of your discard. Repeat any action you can afford, in any order. There is no automatic turn draw. You may end early and discard down to 12 if needed. The game scores at the end of the turn when either draw deck is empty, or when a board end condition is met. Saved matches keep their original decks.

Each new match draws four different sites from a pool of twelve, with six shared spaces apiece. To unlock a site's boon, start your turn with at least three of your visible cards there and more than your opponent. A 3–3 tie grants neither player a boon. The board lists each site's boon and faction synergies.

| Site | Majority boon |
| --- | --- |
| Peripheral IV Site | Recover one card of your choice from your discard pile. |
| Lung | Draw one extra card at the start of your turn. |
| Urinary Tract | Your first normal play costs one fewer discard. |
| Prosthetic Joint | Make one extra play at its usual cost. |
| Central Nervous System | Your first draw action draws two cards. |
| Heart | You may discard one hand card to recover the two cards already on top of your discard pile. |
| Gastrointestinal Tract | Look at the top two cards of your deck. Keep one and discard the other. |
| Genital Tract | Draw a card after your first paid play at this site. |
| Skin & Soft Tissue | You may move one of your cards here from another site, along with its tucked cards. |
| Eye | Look at the top two cards of your deck. Put one back on top and the other on the bottom. |
| Middle Ear | You may discard one hand card to draw two cards. |
| Liver | Draw one card the first time you tuck an opposing card this turn. |

Secret objectives that require an absent site are excluded from both the opening offer and later drafts. Card abilities and printed synergies that name a site still refer to that site. Both copies of a card have independent abilities and can be paid, played, or tucked separately. When a Host action can trigger several responses, it resolves the printed play and its tuck choices first, then the bacterial reactions.

In new matches, Neutrophil Recruitment (H02) and Macrophage Antigen Presentation (H05) are free to play. An antibiotic with an on-play attack can use its normal local effect or tuck one Optimal target at another site. Active matches and recurring attacks stay local. Printed placement and target restrictions still apply. Site scoring awards 3 VP for a majority or 5 VP if all six spaces belong to you.

**Refuge** is a reaction on B01, B03, B12 and B13. When one of those cards would be tucked, you may move that card to an open space at a different site and cancel its tuck. Moving spends no action and triggers no on-play effects. Each copy can use Refuge once between the starts of your turns.

At a full site, an on-play tuck card can use the temporary seventh space if it has an eligible local target. You must choose a local attack. The played card moves into the space opened by the tuck or by the target moving with Refuge.

**Resistance** applies when an antibiotic played at the same site has a Resistance match with B22 or B23. Each copy gets one antibiotic reaction per game. On a Resistance match it draws after the attack, and B23 can tuck an antibiotic that caught nothing instead. B23 can also spend its reaction to draw after another Host antibiotic play if B23 is still visible.

**Suppress** is persistent while the antibiotic remains visible. H34 stops bonus plays granted by Bacteria played at its site. H36 stops Bacteria from using Go Again anywhere on the board.

Keep the same browser tab open or reload it to retain its saved seat. There is no account-based seat recovery. Rooms expire after 14 days without a move. Use a separate tab or browser profile for the second seat when testing alone.

## Playtest replays and bug reports

After a match ends, choose **Download match replay** before starting a rematch. The JSON includes the starting game state, accepted actions in order, and the final score breakdown. A match already in progress when recording began is marked partial. A finished match saved before recording was added has a result and any available played-card history.

The starting state includes both players’ hidden cards and objective data. Share replays only with people who should see that information. Online downloads require a valid seat and become available only once the match ends.

For bot training, load the replay’s recording start state and feed each recorded faction and action through the matching version of `act` in `worker/game.js`. Before each action, use `view` for the acting faction as the model input. Use the action as the target and the result as an optional outcome label. Solo exports identify which faction the human controlled.

**Report a bug** opens a public GitHub issue draft. A GitHub account is required to submit it. Include the mode, turn, cards involved and steps to reproduce.

## Run your own copy

### Publish on Netlify

Open PowerShell in the extracted project folder, where package.json and netlify.toml are located. Run:

~~~powershell
npm.cmd install
npx.cmd netlify-cli deploy --prod
~~~

Authorize the Netlify CLI in your browser if prompted. Select the existing Microbe Wars project if you already created it. The CLI builds the site and deploys the game API alongside it. Open the production URL it prints and create a private room. Send your opponent the match invite from that room.

For a Git-connected project, connect a repository containing this folder and set the base directory to this folder if it is nested. The checked-in netlify.toml supplies the build, publish, and Functions settings. Netlify Blobs stores the rooms.

### Play on your computer

Requires Node.js 22.13 or later. The app uses built-in SQLite locally. There are no dependencies to install.

On Windows, double-click `Start-Microbe-Wars.cmd`. Or run these commands from this folder:

```powershell
node scripts/test.mjs
node scripts/build.mjs
node server.mjs
```

The test command is optional. Open `http://127.0.0.1:4178` once the server starts and leave its terminal open while playing. For another device on your own network, set `HOST=0.0.0.0` when starting it and use your computer's LAN address. To use a standalone instance across the internet, run it on an HTTPS web host you control. The Sites build uses D1 for room storage.
