import { act, canReachOptimal, matchReplay, newGame, printedCost, score, view } from "/local-rules.js";
import { nextPlayer, passPlayView } from "/pass-play.js";
import { chooseBotMove } from "/solo-bot.js";
import { chooseHardMove } from "/trained-bot.js";
import mobileCatalog from "/mobile-catalog.js";
import { cardArtUrl, matchGlyphs, tuckScoreLabel } from "/card-display.js";
import { printedCardCopy } from "/printed-card-copy.js";
import { librarySession, libraryStorageKey, recordPlayedCards } from "/library-session.js";

const app = document.querySelector("#app");
const libraryId = librarySession();
const libraryKey = libraryStorageKey(libraryId);
if (libraryId) document.querySelector("#library-link").hash = libraryId;
const safe = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
  {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const storeKey = "microbe-wars.seat";
const passKey = "microbe-wars.pass-play";
const modeKey = "microbe-wars.mobile-mode";
const localSaves = mobileCatalog ? localStorage : sessionStorage;
const soloKey = "microbe-wars.solo";
const saved = (() => { try { return JSON.parse(sessionStorage.getItem(storeKey)); } catch { return null; } })();
const fragment = new URLSearchParams(location.hash.slice(1));
const incoming = { code: fragment.get("room"), invite: fragment.get("invite") };
let data, game = null, seat = null, busy = false, error = "", notice = "";
let picked = null, payment = new Set(), selected = new Set(), inspect = null;
let paymentMode = false, refreshing = false;
let sidePanel = null, dragged = null, dropSpace = null;
let handPreview = null, focusedSite = null, boardOverview = false;
let localMatch = null, revealed = null;
let soloFaction = null, soloDifficulty = "normal", botTimer;
const soloLabel = () => soloDifficulty === "hard" ? "Solo vs bot · Hard" : "Solo vs bot";
const other = (f) => f === "Host" ? "Bacteria" : "Host";
const cardOf = (id) => id && data.cards[id.split(":")[0]];
const copyLabel = (id) => id.endsWith(":2") ? " · Copy 2" : " · Copy 1";
const siteName = (id) => data.sites.find((s) => s.id === id)?.name || id;
const icon = mark => {
  const glyph = matchGlyphs[mark];
  return glyph ? '<i class="match-glyph" role="img" aria-label="' + safe(mark) +
    '" style="color:' + glyph[1] + '">' + glyph[0] + '\uFE0E</i>' : "";
};
const buttonArt = new Map([
  ["Draw 1 card", "draw-one"],
  ["Take top discard", "take-top-discard"],
  ["End turn", "end-turn"],
  ["Leave match", "leave-match"],
]);
const button = (text, action, extra = "", cls = "secondary") => {
  const art = buttonArt.get(text);
  const label = art ? '<img src="/button-art/' + art + '.webp" alt="' + safe(text) +
    '" width="854" height="270" draggable="false">' : safe(text);
  return '<button type="button" class="' + cls + (art ? " art-button" : "") +
    '" data-action="' + action + '" ' + extra + '>' + label + '</button>';
};
const badge = (text, f = "") => '<span class="badge ' + f.toLowerCase() + '">' + safe(text) + '</span>';
const err = () => error ? '<p class="error" role="alert">' + safe(error) + '</p>' : "";

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body != null) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers, cache:"no-store" });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const e = new Error(body?.error || "The site could not complete the request.");
    e.status = response.status;
    throw e;
  }
  return body;
}
const authorization = () => ({ Authorization: "Bearer " + seat.token });
const room = () => "/api/rooms/" + seat.code;
function setGame(next) {
  if (!next || (game && game.code === next.code && next.revision < game.revision)) return;
  if (game?.status === "finished" && next.status === "objectives") {
    inspect = null; sidePanel = null;
  }
  game = next;
  dropSpace = null;
  selected.clear();
  if (!game.legal?.[picked]) { picked = null; payment.clear(); paymentMode = false; }
  payment = new Set([...payment].filter((id) => game.hand.includes(id)));
}
function saveSeat(result) {
  seat = { code: result.game.code, token: result.token, invite: result.invite || null };
  sessionStorage.setItem(storeKey, JSON.stringify(seat));
  history.replaceState(null, "", "#room=" + seat.code);
  incoming.code = seat.code; incoming.invite = null;
  setGame(result.game);
}
async function update(since = true) {
  if (!seat || refreshing) return;
  refreshing = true;
  const current = seat;
  try {
    const state = await request(room() + (since && game ? "?since=" + game.revision : ""), { headers: authorization() });
    if (current !== seat) return;
    if (state) {
      const wasWaiting = !!game?.pending;
      setGame(state); notice = ""; render();
      if (wasWaiting) revealEndTurn();
    }
    else if (notice) { notice = ""; render(); }
  } catch (e) {
    if (current !== seat) return;
    notice = "Connection interrupted. Retrying…";
    if (e.status === 403 || e.status === 404) {
      seat = null; game = null; sessionStorage.removeItem(storeKey); error = e.message; notice = "";
    }
    render();
  } finally { refreshing = false; }
}
async function transact(path, body, isMove = false) {
  if (busy) return;
  let moved = false;
  busy = true; error = ""; notice = ""; render();
  try {
    const result = await request(path, { method:"POST", headers:isMove ? authorization() : {},
      body:JSON.stringify(isMove ? { revision:game.revision, action:body } : body) });
    if (isMove) {
      picked = null; payment.clear(); paymentMode = false; setGame(result);
      moved = true;
    } else saveSeat(result);
  } catch (e) {
    error = e.message;
    if (isMove && e.status === 409) await update(false);
  } finally {
    busy = false;
    render();
    if (moved) revealEndTurn();
  }
}
function saveLocal() {
  try {
    if (mobileCatalog) localSaves.setItem(modeKey, soloFaction ? "#solo" : "#pass-play");
    localSaves.setItem(soloFaction ? soloKey : passKey,
      JSON.stringify(soloFaction ? {match:localMatch, faction:soloFaction, difficulty:soloDifficulty} : localMatch));
  } catch {
    notice = "This browser could not save the match for refresh.";
  }
}

function syncLocal() {
  clearTimeout(botTimer);
  if (soloFaction) {
    revealed = soloFaction;
    game = view(localMatch, soloFaction);
    if (nextPlayer(localMatch) === other(soloFaction)) botTimer = setTimeout(playBot, 450);
  } else {
    if (revealed !== nextPlayer(localMatch)) revealed = null;
    game = passPlayView(localMatch, revealed, view);
  }
  picked = null; inspect = null; payment.clear(); selected.clear(); paymentMode = false;
  dropSpace = null; sidePanel = null; handPreview = null;
  render();
}

function playBot() {
  if (!localMatch || !soloFaction) return;
  const faction = other(soloFaction);
  if (nextPlayer(localMatch) !== faction) return;
  try {
    const updated = structuredClone(localMatch);
    const chooseMove = soloDifficulty === "hard" ? chooseHardMove : chooseBotMove;
    localMatch = act(updated, faction, chooseMove(view(updated, faction), data, score));
    saveLocal();
    syncLocal();
    revealEndTurn();
  } catch (e) {
    error = "The bot could not finish its move. " + e.message;
    render();
  }
}

function move(action) {
  if (!localMatch) return transact(room() + "/action", action, true);
  if (!revealed || revealed !== nextPlayer(localMatch)) return;
  error = "";
  try {
    const updated = structuredClone(localMatch);
    localMatch = act(updated, revealed, action);
    saveLocal();
    syncLocal();
    revealEndTurn();
  } catch (e) {
    error = e.message;
    render();
  }
}

function revealEndTurn() {
  if (game?.status !== "playing" || game.turn !== game.faction || game.pending || game.slots > 0) return;
  app.querySelector('[data-action="end"]:enabled')?.scrollIntoView({block:"center"});
}

function lobby() {
  const joining = !mobileCatalog && Boolean(incoming.invite && incoming.code);
  const map = Array.from({length:4}, () => '<div class="sample-node">' + '<span></span>'.repeat(6) + '</div>').join("");
  return '<section class="lobby"><div class="lobby-copy"><span class="eyebrow">Field lab · two players</span>' +
    '<h1>One board. Two factions.</h1><p>Build a foothold as Bacteria or clear infection sites as Host. ' +
    (mobileCatalog ? "Play Solo or Pass &amp; Play on this device." : "Play on one device or invite an opponent.") + '</p>' +
    '<div class="sample-map" aria-hidden="true">' + map + '</div></div><div class="panel lobby-panel">' +
    (joining ? '<h2>Join a match</h2><p>You have an invitation to room <strong>' + safe(incoming.code) + '</strong>.</p>' +
      button("Take the open seat","join",busy ? "disabled" : "","primary") :
      (mobileCatalog ? '<h2>Play solo</h2>' : '<h2>Create a match</h2><p class="meta">Each player gets a private six-card hand.</p>') +
      '<label for="faction">Your faction</label><select id="faction"><option>Bacteria</option><option>Host</option></select>' +
      (mobileCatalog ? "" : button("Create private room","create",busy ? "disabled" : "","primary")) +
      '<label for="solo-difficulty">Bot difficulty</label><select id="solo-difficulty"><option value="normal">Normal</option><option value="hard">Hard</option></select>' +
      button("Play solo vs bot","startSolo",busy ? "disabled" : "","primary") +
      '<hr><h2>Same device</h2><p class="meta">Take turns passing the screen. Hands and objectives are hidden at each handoff.</p>' +
      button("Pass & Play","startLocal",busy ? "disabled" : "","primary")) + err() + '</div></section>';
}
const cardTitle = (c) => c.faction === "Bacteria" ? c.identity : c.name.split(" — ")[0];
const tagNames = { hospital:"Hospital-associated", uropathogen:"Uropathogen", skin_flora:"Skin flora",
  skin_associated:"Skin-associated", gut_flora:"Gut flora", ampc:"AmpC", vre:"VRE" };
const objectiveTags = new Set(["uropathogen","respiratory","hospital","staphylococcus"]);
function cardTags(card, compact = false) {
  const tags = card.tags.filter(tag => !compact || objectiveTags.has(tag));
  const gram = card.gram === "Variable" ? "Gram-variable" :
    ["Positive","Negative"].includes(card.gram) ? "Gram-" + card.gram.toLowerCase() : "";
  const classification = card.faction === "Bacteria" ? [gram].filter(Boolean) :
    [card.type, ...(card.type === "Immune" ? [card.identity] : [])];
  if (card.type === "Antibiotic" && card.route !== "N/A") classification.push(card.route);
  return [...new Set([...classification, ...tags.map(tag => tagNames[tag] ||
    tag.charAt(0).toUpperCase() + tag.slice(1).replaceAll("_"," "))])];
}
function strip(card, compact = false) {
  if (card.faction === "Host") return card.rail ? '<span class="match-group" title="Antibiotic match symbol">' + icon(card.mark) + '</span>' : "";
  const lanes = [
    ["Optimal","O",card.optimal,"Local match or one distant on-play tuck"],
    ["Active","A",card.active,"Local tuck only"],
    ["Resistance","R",card.resist,"Local match · blocks tuck and can trigger a reaction"],
  ];
  return '<span class="match-strip' + (compact ? ' compact' : '') + '">' + lanes.filter(([, , marks])=>marks.length)
    .map(([label, initial, marks, hint]) => '<span class="match-group ' + label.toLowerCase() + '" title="' +
      safe(label + " · " + hint) + '"><span aria-hidden="true">' + (compact ? initial : label) +
      '</span><span class="sr-only">' + label + ': </span>' + marks.map(icon).join("") + '</span>').join("") + '</span>';
}
function rail(card) {
  const inv = card.faction === "Bacteria";
  const order = inv ? [...data.order].reverse() : data.order;
  const lanes = inv ? [card.optimal, card.active, card.resist] : [card.rail ? [card.mark] : []];
  return '<div class="rail ' + card.faction.toLowerCase() + '" aria-label="Antibiotic match rail">' +
    lanes.map((lane) => '<span class="lane">' + order.map((k) =>
      '<span>' + (lane.includes(k) ? icon(k) : "") + '</span>').join("") + '</span>').join("") + '</div>';
}
function cardArt(id, className = "", alt = "") {
  return '<img class="card-art ' + className + '" src="' + safe(cardArtUrl(id)) +
    '" alt="' + safe(alt) + '" width="750" height="1050" loading="lazy" decoding="async" draggable="false">';
}

function cardDetail() {
  const instance = inspect || picked;
  const card = cardOf(instance);
  if (!card) return '<div class="panel detail"><h2>Card inspector</h2><p class="meta">Select a card on the board or in your hand to read its ability.</p></div>';
  const site = game.board.find((s) => s.slots.some((o) => o?.id === instance));
  function findPiece(pieces) {
    for (const piece of pieces) {
      if (!piece) continue;
      if (piece.id === instance) return piece;
      const nested = findPiece(piece.tucked);
      if (nested) return nested;
    }
  }
  const onBoard = findPiece(game.board.flatMap(s => s.slots));
  const play = cardOf(picked);
  let match = "";
  if (play?.rail && card.faction === "Bacteria" && site) {
    const value = data.matrix[play.id]?.[card.id];
    const remote = game.hostBalance && value === "OPTIMAL" && canReachOptimal(play.id);
    const requiredSite = play.id === "H39" ? "N02" : play.id === "H42" ? "N03" : null;
    const outside = requiredSite && site.id !== requiredSite && !remote;
    match = '<p><b>Match preview</b> · ' + (outside ? "Treatment is outside its site scope." :
      value === "TRIGGER" ? "Resistance response." : ["OPTIMAL","ACTIVE"].includes(value) ?
        (remote ? "Optimal match. On play, you may choose one remote Optimal target instead of the local attack." +
          (requiredSite ? " Play the antibiotic at " + safe(siteName(requiredSite)) + "." : "") :
          safe(value[0] + value.slice(1).toLowerCase()) + " match. Check the ability and defenses.") : "No matching action.") + '</p>';
  }
  return '<div class="panel detail"><h2 class="sr-only">' + safe(card.name) + '</h2>' +
    cardFace(card, instance) + '<details><summary>Aligned match rail</summary>' + rail(card) + '</details>' +
    ((card.id === "H39" && !game.board.some(s => s.id === "N02")) ||
     (card.id === "H42" && !game.board.some(s => s.id === "N03")) ?
      '<p class="meta">The site required for this antibiotic’s tuck ability is absent from this match.</p>' : "") +
    (onBoard?.antibioticTuck ? '<p><b>Antibiotic tuck</b> · ' +
      (onBoard.antibioticTuck.match === "OPTIMAL" ? "Optimal" : "Active") +
      (onBoard.antibioticTuck.remote ? " · from another site" : " · local") + '</p>' : "") +
    (onBoard?.usedResistanceMatch ? '<p><b>R match triggered</b></p>' : "") +
    (game.spentReactions?.[instance] ? '<p><b>Antibiotic reaction spent</b></p>' : '') +
    (onBoard?.tucked.length ? '<h3>Tucked beneath</h3>' + inspectList(onBoard.tucked.map(o => o.id)) : "") +
    match + '</div>';
}

function inspectList(ids) {
  return ids.length ? '<div class="choices">' + ids.map(id => button(cardOf(id).name,"inspect",
    'data-id="' + safe(id) + '"')).join("") + '</div>' : '<p class="meta">Empty</p>';
}

function renderBoard() {
  if (!game.board.some(site => site.id === focusedSite)) focusedSite = game.board[0]?.id;
  const siteButtons = game.board.map(({id}) => button(siteName(id), "siteView",
    'data-id="' + safe(id) + '" aria-pressed="' + (!boardOverview && focusedSite === id) + '"')).join("");
  const navigation = '<nav class="site-navigation" aria-label="Site views">' + siteButtons +
    button("Overview", "siteView", 'data-id="overview" aria-pressed="' + boardOverview + '"') + '</nav>';
  const available = game.legal[picked];
  const ready = available && payment.size === available.cost && !busy;
  return navigation + '<details class="panel match-key"><summary>Match key · Optimal, Active, Resistance</summary>' +
    '<p>Find the antibiotic’s symbol on the bacterium. <b>Optimal (O)</b> qualifies for a local tuck or a single distant tuck instead of the on-play local attack. ' +
    '<b>Active (A)</b> qualifies for a local tuck. <b>Resistance (R)</b> blocks the tuck. In new matches, playing the matching antibiotic here can give Bacteria a once-per-copy reaction. ' +
    'A symbol absent from all three rows gives no tuck. Follow any limits printed on the card.</p></details>' +
    '<div class="board board-' + (boardOverview ? "overview" : "focus") + '" aria-label="Infection sites" tabindex="0">' + game.board.map((site) => {
    const occupied = site.slots.slice(0,6).filter(Boolean), b = occupied.filter((o) => cardOf(o.id).faction === "Bacteria").length;
    const h = occupied.length-b;
    const info = data.sites.find((s) => s.id === site.id);
    const cells = site.slots.map((piece, i) => {
      if (piece) {
        const c = cardOf(piece.id);
        return '<button class="slot ' + c.faction.toLowerCase() + '" data-action="inspect" data-id="' + piece.id +
          '" title="' + safe(c.name) + '">' + cardArt(piece.id,"board-card-art") + strip(c,true) + '<span class="sr-only">' + safe(cardTitle(c)) +
          '</span><span class="sr-only">' + safe(cardTags(c,true).join(" · ")) + '</span>' +
          (piece.tucked.length ? '<span class="slot-note">' + piece.tucked.length + ' tucked</span>' : "") +
          (game.spentReactions?.[piece.id] ? '<span class="slot-note">Reaction spent</span>' : '') +
          '</button>';
      }
      const legal = ready && available.sites.includes(site.id);
      return '<button class="slot empty ' + (legal ? "legal" : "") + '" data-action="place" data-site="' + site.id +
        '" data-slot="' + i + '" aria-label="' + safe(info.name + ", space " + (i+1)) + '" ' +
        (legal ? "" : 'aria-disabled="true" tabindex="-1"') + '>' + (legal ? "Play here" : "—") + '</button>';
    }).join("");
    const tuckSpace = occupied.length === 6 && site.slots.length === 6 &&
      Object.values(game.legal).some(play => play.sites.includes(site.id));
    const tuckReady = ready && available.sites.includes(site.id);
    const extraSpace = tuckSpace ? '<button class="slot empty tuck-space ' + (tuckReady ? "legal" : "") +
      '" data-action="place" data-site="' + safe(site.id) + '" data-slot="6" ' +
      (tuckReady ? "" : 'aria-disabled="true" tabindex="-1"') + '>Tuck play</button>' : "";
    const control = b === h ? (b ? "Contested" : "Unoccupied") :
      (b > h ? "Bacteria" : "Host") + (Math.max(b,h) === 6 ? " full control" : " majority");
    const points = game.sitePoints?.[site.id];
    const scoreLine = points ? '<p class="site-points">Bacteria ' + points.Bacteria + ' VP · Host ' + points.Host + ' VP</p>' : '';
    return '<section class="node" data-board-site="' + safe(site.id) + '"><div class="node-title"><h3>' + safe(info.name) + '</h3><span class="slot-note">' +
      control + ' · ' + occupied.length + '/6</span></div>' + scoreLine + '<div class="grid">' + cells + '</div>' + extraSpace + '<details><summary>Site boon &amp; scoring</summary><small>' +
      safe(game.uniqueSiteBoons ? info.power : info.legacyPower ?? info.power) + '</small><small>Majority +3 VP · Full control +5 VP</small><small>' +
      safe(info.bacteriaSynergy) + '<br>' + safe(info.hostSynergy) + '</small></details></section>';
  }).join("") + '</div>';
}

const objectiveValue = (g) => g.vp + (g.per ? " VP per qualifying entry" : " VP if met");
function objectiveFace(goal) {
  return cardArt(goal.id) + '<span class="sr-only">' +
    safe(goal.name + ". " + objectiveValue(goal) + ". " + goal.text) + '</span>';
}

function cardFace(card, id, effectiveCost) {
  const { ability, synergy } = printedCardCopy(card);
  const cost = printedCost(id, game.hostBalance);
  const variant = card.name.split(" — ")[1];
  const gram = card.faction === "Bacteria" && ["Positive","Negative","Variable"].includes(card.gram) ?
    "Gram-" + card.gram.toLowerCase() : "";
  return cardArt(id) + '<span class="sr-only">' + strip(card) + '<span class="card-head"><strong>' + safe(cardTitle(card)) + '</strong>' +
    '<span class="cost" aria-label="Printed cost ' + cost + '">' + cost + '</span></span>' +
    (variant ? '<span class="card-variant">' + safe(variant) + '</span>' : '') +
    '<span class="card-tags">' + safe(cardTags(card).filter(tag => tag !== gram).join(" · ")) + '</span><span class="card-stats">' +
    card.base + ' base VP' + tuckScoreLabel(card) +
    '</span>' +
    (ability ? ability.split("\n") : []).map(line => '<span class="card-rule">' + safe(line) + '</span>').join("") +
    (synergy ? '<span class="card-rule"><b>Synergy</b> · ' + safe(synergy.split("\n").join(" · ")) + '</span>' : "") + '</span>' +
    (gram ? '<span class="card-stats">' + safe(gram) + '</span>' : '') +
    (effectiveCost != null && effectiveCost !== cost ? '<span class="card-stats">' + effectiveCost + ' to play now</span>' : "");
}

function options(p, objective = false) {
  return '<div class="choices">' + p.choices.map((id) => {
    const g = objective ? data.goals[id] : null;
    const c = cardOf(id);
    const name = g?.name || (c ? c.name + (game.actionRules ? copyLabel(id) : "") : null) ||
      (id === "local" ? "Sweep this site" : id === "draw" ? "Draw a card" : "Tuck the antibiotic");
    const targetSite = ["attack","relocate"].includes(p.kind) && c &&
      game.board.find((site) => site.slots.some((piece) => piece?.id === id));
    return '<button type="button" class="choice-option ' + (g ? "goal-choice " : c ? "choice-card " + c.faction.toLowerCase() + " " : "") +
      (selected.has(id) ? "picked" : "") + '" data-action="option" data-id="' + safe(id) + '" aria-pressed="' +
      selected.has(id) + '">' + (g ? objectiveFace(g) : c ? cardFace(c,id) +
        (game.actionRules ? '<span class="sr-only">' + safe(copyLabel(id)) + '</span>' : '') : safe(name)) + (targetSite ? '<small>' + safe(siteName(targetSite.id)) + '</small>' : "") + '</button>';
  }).join("") + '</div>';
}
function decision() {
  if (game.status === "objectives") {
    if (!game.offer?.length) return '<div class="panel choice"><h2>Objectives locked</h2><p>Waiting for the other player to choose.</p></div>';
    return '<div class="panel choice"><h2>Keep two secret objectives</h2>' + options({choices:game.offer}, true) +
      button("Keep selected","objective",selected.size !== 2 || busy ? "disabled" : "","primary") + '</div>';
  }
  const p = game.pending;
  if (!p) return "";
  if (p.f !== game.faction) return '<div class="panel choice"><h2>Awaiting response</h2><p>' + safe(p.prompt) + '</p></div>';
  if (p.kind === "bonus") {
    return '<div class="panel choice"><h2>Bonus play</h2><p>Select a legal card from your hand, or skip this bonus.</p>' +
      button("Skip bonus","skipBonus",busy ? "disabled" : "") + '</div>';
  }
  if (p.kind === "refuge") {
    return '<div class="panel choice"><h2>Refuge</h2><p>' + safe(p.prompt) + '</p>' +
      (p.self ? "" : options(p)) + '<div class="choices">' + p.destinations.map((id) => button(siteName(id),"refugeMove",
        'data-id="' + id + '" ' + ((!p.self && selected.size !== 1) || busy ? "disabled" : ""))).join("") + '</div>' +
      button("Accept tuck","refugeDecline",busy ? "disabled" : "") + '</div>';
  }
  const skipBoon = !selected.size && ["recirculate","relocate","tradeDraw"].includes(p.kind);
  const skipTuck = !selected.size && p.kind === "attack" && p.min === 0;
  const preview = p.preview?.length ? '<div class="choices">' + p.preview.map(id =>
    '<article class="choice-card panel ' + cardOf(id).faction.toLowerCase() + '">' +
    cardFace(cardOf(id), id) + '</article>').join("") + '</div>' : "";
  const choiceKey = [game.faction, game.turnNumber, p.kind, ...(p.choices ?? [])].join(",");
  return '<div class="panel choice" data-choice-key="' + safe(choiceKey) + '"><h2>Resolve a choice</h2><p>' + safe(p.prompt) + '</p>' +
    preview + options(p, p.kind === "draft") + button(skipBoon ? "Skip boon" : skipTuck ? "Skip tuck" : "Confirm choice","choose",
      selected.size < p.min || selected.size > p.max || busy ? "disabled" : "","primary") + '</div>';
}

function renderHand() {
  const legal = game.legal[picked];
  const caption = !game.hand.length ? "Your hand is empty." : legal ?
    payment.size === legal.cost ? (dropSpace ? "Confirm the destination." : "Choose a highlighted space.") :
      "Select " + legal.cost + " other card" + (legal.cost === 1 ? "" : "s") + " to discard." :
    "Tap a card to view it.";
  const layout = 'style="--hand-peeks:' + Math.max(0, game.hand.length - 1) + '"';
  return '<section class="panel hand-panel"><div class="hand-head"><div><h2>Your hand · ' + game.hand.length +
    '</h2><span class="meta">' + safe(caption) + '</span></div>' +
    (dropSpace && legal ? '<div class="card-controls">' + button("Play at " + siteName(dropSpace.site),"confirmDrop",
      payment.size !== legal.cost || busy ? "disabled" : "", "primary") + button("Cancel","clear") + '</div>' :
      legal ? button("Clear selection","clear") : "") + '</div><div class="hand' +
    (game.hand.length === 1 ? ' one-card' : '') + '" ' + layout + '>' + game.hand.map((id) => {
      const card = cardOf(id), paying = payment.has(id), active = picked === id;
      const canPay = paymentMode && !active;
      const label = card.name + (game.actionRules ? copyLabel(id) : "") +
        (canPay ? (paying ? ", selected for payment" : ", select for payment") : ", view card");
      return '<article class="hand-card ' + card.faction.toLowerCase() + (active ? " selected" : "") + (paying ? " payment" : "") + '"' +
        ((canPay || game.legal[id]) && !busy ? ' draggable="true" data-drag-card="' + safe(id) + '"' : "") + '>' +
        '<button type="button" class="hand-peek" data-action="' + (canPay ? "payHand" : "previewHand") +
        '" data-id="' + safe(id) + '" aria-label="' + safe(label) + '" title="' + safe(label) + '"' +
        (canPay ? ' aria-pressed="' + paying + '"' : ' aria-haspopup="dialog"') + '>' +
        cardArt(id) + '<span class="hand-edge" aria-hidden="true">' + safe(cardTitle(card)) + '</span></button></article>';
    }).join("") + '</div></section>';
}

function renderPayment() {
  if (!paymentMode) return "";
  const cost = game.legal[picked].cost;
  return '<div class="payment-zone" aria-label="Payment"><h3>Payment <span aria-live="polite">' +
    payment.size + '/' + cost + '</span></h3><p class="meta">Tap cards or drag them here.</p></div>';
}

function renderHandPreview() {
  if (!game.hand.includes(handPreview)) handPreview = null;
  if (!handPreview) return "";
  const card = cardOf(handPreview), legal = game.legal[handPreview];
  return '<dialog class="hand-preview" aria-labelledby="hand-preview-title"><div class="preview-card">' +
    '<div class="card-controls">' + button("Close","closeHandPreview","","secondary") +
    (legal && !busy && !paymentMode ? button("Play this card","prepare",'data-id="' + safe(handPreview) + '"',"primary") : "") +
    '</div><h2 class="sr-only" id="hand-preview-title">' + safe(card.name) + '</h2>' +
    (legal && legal.cost !== printedCost(handPreview, game.hostBalance) ?
      '<p class="meta">' + legal.cost + ' to play now</p>' : '') + cardFace(card,handPreview) + '</div></dialog>';
}

function renderScore() {
  if (!game.scores) return "";
  const h = game.scores.Host.total, b = game.scores.Bacteria.total;
  const headline = b === h ? "The match is tied." : (b > h ? "Bacteria" : "Host") + " wins.";
  return '<section class="panel"><h2>' + headline + '</h2><p class="meta">' + safe(game.reason) +
    '</p><div class="score">' + ["Bacteria","Host"].map((f) => {
      const s=game.scores[f];
      return '<div><b>' + f + ' ' + s.total + '</b><p class="meta">Base ' + s.base + ' · synergy ' + s.synergy +
        ' · tucked ' + s.tuck + ' · territory ' + s.territory + ' · objectives ' + s.objective + '</p></div>';
    }).join("") + '</div>' + (game.series ? '<p class="series-score"><b>Series wins</b> · Bacteria ' + game.series.Bacteria +
      ' · Host ' + game.series.Host + ' · Ties ' + game.series.ties + '</p>' : '') +
    (game.startedAt ? '<p>Match time · ' + elapsedTime() + '</p>' : '') +
    '<p class="meta">Replay includes both players’ cards and objectives.</p>' +
    button("Download match replay","exportReplay",busy ? "disabled" : "") +
    button("Play again","rematch",busy ? "disabled" : "", "primary") + '</section>';
}
function elapsedTime() {
  if (!game?.startedAt) return "";
  const seconds = Math.max(0,Math.floor(((game.endedAt ?? Date.now()) - game.startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes + ":" + String(seconds % 60).padStart(2,"0");
}

function renderPublicPoints() {
  if (!game.sitePoints) return "";
  const sites = Object.values(game.sitePoints);
  const host = sites.reduce((sum,site) => sum + site.Host,0);
  const bacteria = sites.reduce((sum,site) => sum + site.Bacteria,0);
  return '<div class="panel public-points"><strong>Board points</strong>' +
    badge("Bacteria " + bacteria + " VP","Bacteria") + badge("Host " + host + " VP","Host") +
    '<small>Secret objectives score separately.</small></div>';
}

function render() {
  if (!data) return;
  recordPlayedCards(libraryKey, localMatch?.playedPoints ?? game?.playedPoints);
  if (localMatch && !game) {
    const faction = nextPlayer(localMatch);
    const prompt = localMatch.status === "objectives" ? "Choose your secret objectives when you’re ready." :
      localMatch.pending ? "A response needs your attention." : "Your turn is ready.";
    app.innerHTML = '<section class="panel handoff"><span class="eyebrow">Pass &amp; Play</span><h1>Pass to ' +
      safe(faction) + '</h1><p>' + safe(prompt) + '</p><p class="meta">Hand the device over before revealing the next hand.</p>' +
      button("I’m " + faction + " · Reveal my hand","revealLocal","","primary") +
      button("Leave match","leave","","plain") + (notice ? '<p class="notice">' + safe(notice) + '</p>' : "") + '</section>';
    return;
  }
  if (localMatch && game?.status === "finished") {
    app.innerHTML = '<article class="game"><span class="eyebrow">' + (soloFaction ? soloLabel() : "Pass &amp; Play") +
      '</span>' + renderScore() + err() +
      '<div>' + button("Back to lobby","leave") + '</div></article>';
    return;
  }
  if (!game) { app.innerHTML = lobby(); return; }
  const waiting = game.status === "waiting";
  const inv = seat?.invite ? location.origin + "/#room=" + seat.code + "&invite=" + seat.invite : "";
  const canEnd = game.status === "playing" && game.turn === game.faction && !game.pending && !busy;
  const topDiscard = cardOf(game.discard.at(-1));
  const canSpend = canEnd && game.actionRules && game.slots > 0;
  const actionButtons = game.status === "playing" && game.actionRules && game.turn === game.faction ?
    button(game.focusedDraw && game.deckCount > 1 ? "Draw 2 cards" : "Draw 1 card","drawCard",
      canSpend && game.deckCount ? "" : "disabled") +
    button("Take top discard","takeDiscard",canSpend && topDiscard ? 'title="' + safe(topDiscard.name) + '"' : "disabled") : "";
  const status = waiting ? "Waiting for your opponent" : game.status === "objectives" ? "Secret objective setup" :
    game.status === "finished" ? "Match complete" : game.turn === game.faction ? "Your turn" : other(game.faction) + "’s turn";
  const summary = '<div class="summary"><div><span class="eyebrow">' + (soloFaction ? soloLabel() :
    localMatch ? "Pass &amp; Play" : "Private room " + safe(game.code)) +
    '</span><h1>Infection board</h1></div><div class="badges">' + badge("You · " + game.faction,game.faction) +
    badge("Draw deck " + game.deckCount) + badge("Opponent hand " + game.opponentHandCount,other(game.faction)) +
    '</div></div>';
  const statusLine = '<div class="turn-status"><strong>' + safe(status) + '</strong>' +
    (game.turnNumber ? ' <span class="meta">· Turn ' + game.turnNumber + ' · ' + game.slots +
      (game.actionRules ? " actions left" : " normal plays left") + (game.jointPlay ? " · Site bonus play available" : "") + '</span>' : "") +
    (game.startedAt ? ' <span class="meta" aria-label="Match time">· <time id="match-timer">' + elapsedTime() + '</time></span>' : '') +
    (game.actionRules && topDiscard ? '<div class="meta">Top of your discard · ' + safe(topDiscard.name) + '</div>' : "") +
    '</div>';
  const turnControls = '<aside class="status-actions turn-controls" aria-label="Turn controls">' + renderPayment() +
    actionButtons + (game.status === "playing" ? button("End turn","end",canEnd ? "" : "disabled","primary") : "") +
    (localMatch && !soloFaction ? button("Hide hand","hideLocal","","plain") : "") +
    button(localMatch ? "Leave match" : "Leave this tab","leave","","plain") + '</aside>';
  const invite = waiting && inv ? '<div class="panel choice"><h2>Invite the other player</h2><p>Share this single-use room link with your opponent. It gives them the second seat in this match.</p>' +
    '<div class="invite-row"><input id="invite" aria-label="Match invite link" readonly value="' + safe(inv) + '">' +
    button("Copy link","copy") + '</div></div>' : "";
  const objectives = '<div class="panel detail"><h2>Your objectives</h2>' +
    (game.goals.length ? game.goals.map((id) => {
      const goal = data.goals[id], points = game.objectivePoints?.[id] ?? 0;
      return '<article class="objective-card' + (points > 0 ? ' fulfilled' : '') + '">' + objectiveFace(goal) + '<p class="objective-status">' +
        (goal.per ? points + ' VP currently' : points > 0 ? 'Condition met' : 'Condition open') + '</p></article>';
    }).join("") : '<p class="meta">Objectives are chosen when both seats are filled.</p>') + '</div>';
  const played = (game.playedPoints ?? []).slice().reverse();
  const log = '<div class="panel"><h2>Match log</h2><ol class="log">' +
    (played.length ? played.map(entry => '<li>Turn ' + entry.turn + ' · ' + safe(cardOf(entry.id).name) +
      ' · ' + entry.points + ' VP at play</li>').join("") : '') + '</ol><ol class="log">' +
    game.log.slice().reverse().map((item) => '<li>' + safe(item) + '</li>').join("") + '</ol></div>';
  const previousChoice = app.querySelector("[data-choice-key]")?.dataset.choiceKey;
  const previousBoard = app.querySelector(".board-focus");
  const boardScroll = previousBoard?.scrollTop ?? null;
  const focused = document.activeElement?.dataset;
  const focusedAction = focused?.action, focusedId = focused?.id;
  const openedKey = app.querySelector(".match-key")?.open;
  const discards = '<div class="panel detail"><h2>Your discard pile</h2>' + inspectList([...game.discard].reverse()) +
    '<h2>Opponent discard pile</h2>' + inspectList([...game.opponentDiscard].reverse()) + '</div>';
  app.innerHTML = '<article class="game match-screen">' + summary + err() + (notice ? '<p class="notice" role="status">' + safe(notice) + '</p>' : "") +
    invite + renderScore() + decision() + '<nav class="side-menu" aria-label="Match information">' +
    [["inspector","Inspector"],["objectives","Objectives"],["discards","Discards"],["log","Match log"]].map(([id,label]) =>
      button(label,"panel",'data-id="' + id + '" aria-expanded="' + (sidePanel === id) + '"')).join("") +
    '</nav><div class="layout' + (sidePanel ? ' panel-open' : '') + '"><section class="tabletop"><div class="board-content">' +
    renderBoard() + '</div><div class="hand-dock">' + statusLine + renderPublicPoints() +
    '<div class="hand-and-controls">' + renderHand() + turnControls + '</div></div></section>' + (sidePanel ? '<aside class="aside">' +
      (sidePanel === "inspector" ? cardDetail() : sidePanel === "objectives" ? objectives : sidePanel === "discards" ? discards : log) +
      '</aside>' : '') + '</div>' + renderHandPreview() + '</article>';
  const board = app.querySelector(".board-focus");
  if (board) {
    const nodes = [...board.querySelectorAll("[data-board-site]")];
    const position = node => node.offsetTop;
    board.scrollTop = boardScroll ?? position(nodes.find(node => node.dataset.boardSite === focusedSite) ?? nodes[0]);
    board.addEventListener("scroll", () => {
      const nearest = nodes.reduce((best, node) =>
        Math.abs(position(node) - board.scrollTop) < Math.abs(position(best) - board.scrollTop) ? node : best);
      focusedSite = nearest.dataset.boardSite;
      app.querySelectorAll('[data-action="siteView"]').forEach(tab =>
        tab.setAttribute("aria-pressed", String(tab.dataset.id === focusedSite)));
    }, {passive:true});
  }
  const preview = app.querySelector(".hand-preview");
  if (preview) {
    preview.addEventListener("cancel", event => { event.preventDefault(); closeHandPreview(); });
    preview.addEventListener("click", event => { if (event.target === preview) closeHandPreview(); });
    preview.showModal();
  }
  const nextChoice = app.querySelector("[data-choice-key]");
  if (nextChoice && nextChoice.dataset.choiceKey !== previousChoice) nextChoice.scrollIntoView({block:"nearest"});
  app.querySelector(".match-key").open = !!openedKey;
  if (focusedAction && focusedId) {
    [...app.querySelectorAll("button[data-action][data-id]")].find(node =>
      node.dataset.action === focusedAction && node.dataset.id === focusedId && !node.disabled)?.focus({preventScroll:true});
  }
}

function placeCard(site, slot) {
  const legal = game.legal[picked];
  if (!legal?.sites.includes(site) || payment.size !== legal.cost || busy) return;
  if (legal.tuckSites && !legal.tuckSites.includes(site) &&
      !confirm("There is no eligible tuck target from this site. Play the card anyway?")) return;
  return move({type:"play", card:picked, site, slot:Number(slot), pay:[...payment]});
}

function clearDrag() {
  dragged = null;
  app.querySelectorAll(".drop-target").forEach(node => node.classList.remove("drop-target"));
}

function isPaymentCard(id) {
  return !!id && !!game && paymentMode && id !== picked && game.hand.includes(id);
}

app.addEventListener("dragstart", event => {
  if (event.target.closest("button:not(.hand-peek)")) { event.preventDefault(); return; }
  const id = event.target.closest("[data-drag-card]")?.dataset.dragCard;
  if (!id || busy || (!isPaymentCard(id) && !game?.legal[id])) return;
  dragged = id;
  event.dataTransfer.setData("text/plain", id);
  event.dataTransfer.effectAllowed = "move";
  if (isPaymentCard(id)) {
    if (!payment.has(id) && payment.size < game.legal[picked].cost) {
      app.querySelector(".payment-zone")?.classList.add("drop-target");
    }
    return;
  }
  app.querySelectorAll('[data-action="place"]').forEach(node => {
    if (game.legal[id].sites.includes(node.dataset.site)) node.classList.add("drop-target");
  });
});
app.addEventListener("dragover", event => {
  if (!dragged || !event.target.closest(".drop-target")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});
app.addEventListener("dragend", clearDrag);
app.addEventListener("drop", event => {
  const target = event.target.closest(".drop-target");
  if (target?.matches(".payment-zone") && isPaymentCard(dragged) && !busy) {
    event.preventDefault();
    const id = dragged;
    clearDrag();
    if (!payment.has(id)) togglePayment(id);
    return;
  }
  const legal = dragged && game?.legal[dragged];
  if (!target || !legal || busy || !legal.sites.includes(target.dataset.site)) { clearDrag(); return; }
  event.preventDefault();
  const {site, slot} = target.dataset;
  if (picked !== dragged) payment.clear();
  picked = dragged;
  paymentMode = legal.cost > 0;
  dropSpace = null;
  clearDrag();
  if (payment.size !== legal.cost) dropSpace = {site, slot};
  render();
  if (!dropSpace) return placeCard(site, slot);
});

function togglePayment(id) {
  const cost = game.legal[picked]?.cost;
  if (busy || !isPaymentCard(id) || !cost) return;
  if (payment.has(id)) payment.delete(id);
  else if (payment.size < cost) payment.add(id);
  render();
}

function closeHandPreview() {
  const id = handPreview;
  handPreview = null;
  render();
  app.querySelector('.hand-peek[data-id="' + CSS.escape(id) + '"]')?.focus({preventScroll:true});
}

app.addEventListener("click", async (event) => {
  const node = event.target.closest("button[data-action]");
  if (!node) return;
  if (node.disabled || node.getAttribute("aria-disabled") === "true") return;
  const {action,id,site,slot} = node.dataset;
  if (action === "previewHand") { handPreview = id; render(); return; }
  if (action === "closeHandPreview") { closeHandPreview(); return; }
  if (action === "payHand") { togglePayment(id); return; }
  if (action === "siteView") {
    const wasOverview = boardOverview;
    boardOverview = id === "overview";
    if (!boardOverview) focusedSite = id;
    if (wasOverview !== boardOverview) render();
    if (!boardOverview) {
      const board = app.querySelector(".board-focus");
      const target = board?.querySelector('[data-board-site="' + CSS.escape(id) + '"]');
      if (target) board.scrollTo({top:target.offsetTop,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
    }
    return;
  }
  if (action === "exportReplay") {
    try {
      const replay = localMatch ? matchReplay(localMatch) : await request(room() + "/replay", { headers:authorization() });
      replay.mode = soloFaction ? "solo" : localMatch ? "pass-and-play" : "online";
      if (soloFaction) {
        replay.humanFaction = soloFaction;
        replay.botDifficulty = soloDifficulty;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(replay, null, 2)], {type:"application/json"}));
      const download = document.createElement("a");
      download.href = url;
      download.download = "microbe-wars-replay.json";
      download.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { error = e.message; render(); }
    return;
  }
  if (action === "rematch") {
    if (!localMatch) return move({type:"rematch"});
    localMatch = act(localMatch, null, {type:"rematch"});
    saveLocal();
    syncLocal();
    return;
  }
  if (action === "startLocal" || action === "startSolo") {
    soloFaction = action === "startSolo" ? document.querySelector("#faction").value : null;
    soloDifficulty = soloFaction ? document.querySelector("#solo-difficulty").value : "normal";
    localMatch = newGame();
    localMatch.status = "objectives";
    revealed = null; error = ""; notice = "";
    seat = null;
    history.replaceState(null, "", soloFaction ? "#solo" : "#pass-play");
    saveLocal(); syncLocal(); return;
  }
  if (action === "revealLocal" || action === "hideLocal") {
    revealed = action === "revealLocal" ? nextPlayer(localMatch) : null;
    syncLocal();
    if (revealed) revealEndTurn();
    return;
  }
  if (action === "create") return transact("/api/rooms", { faction:document.querySelector("#faction").value });
  if (action === "join") return transact("/api/rooms/" + incoming.code + "/join", { invite:incoming.invite });
  if (action === "copy") {
    const input = document.querySelector("#invite");
    try { await navigator.clipboard.writeText(input.value); notice = "Invite link copied."; render(); }
    catch { input.select(); }
    return;
  }
  if (action === "leave") {
    if ((localMatch?.status ?? game.status) !== "finished" &&
        !confirm(localMatch ? "End this match?" : "Leave this match in this tab? You will lose this tab’s saved seat.")) return;
    if (localMatch) {
      localSaves.removeItem(soloFaction ? soloKey : passKey);
      if (mobileCatalog) localSaves.removeItem(modeKey);
    } else sessionStorage.removeItem(storeKey);
    clearTimeout(botTimer);
    soloFaction = null;
    localMatch = null; revealed = null;
    seat = null; game = null; inspect = null; picked = null; payment.clear(); selected.clear();
    error = ""; notice = ""; incoming.code = null; incoming.invite = null;
    history.replaceState(null,"","/"); render(); return;
  }
  if (action === "end") return move({ type:"end" });
  if (action === "drawCard" || action === "takeDiscard") return move({ type:action });
  if (action === "skipBonus") return move({ type:"skipBonus" });
  if (action === "objective") return move({ type:"objectives", selected:[...selected] });
  if (action === "choose") {
    if (game.pending?.kind === "attack" && !selected.size && !confirm("Skip this tuck without choosing a target?")) return;
    return move({ type:"choose", selected:[...selected] });
  }
  if (action === "refugeDecline") return move({ type:"refuge" });
  if (action === "refugeMove") return move({ type:"refuge",
    ...(game.pending?.self ? {} : { protector:[...selected][0] }), destination:id });
  if (action === "place") return placeCard(site, slot);
  if (action === "confirmDrop" && dropSpace) return placeCard(dropSpace.site, dropSpace.slot);
  if (action === "panel") { sidePanel = sidePanel === id ? null : id; render(); return; }
  if (action === "inspect") { inspect = id; sidePanel = "inspector"; render(); return; }
  if (action === "clear") { picked = null; dropSpace = null; payment.clear(); paymentMode = false; render(); return; }
  if (action === "option") {
    const max = game.status === "objectives" ? 2 : game.pending?.max ?? 1;
    if (selected.has(id)) selected.delete(id);
    else if (max === 1) selected = new Set([id]);
    else if (selected.size < max) selected.add(id);
    render(); return;
  }
  if (action === "prepare" && game.legal[id]) {
    handPreview = null; picked = id; dropSpace = null; payment.clear(); paymentMode = game.legal[id].cost > 0;
    render(); return;
  }
});

try {
  data = mobileCatalog ?? await request("/api/cards");
  const mode = location.hash || (mobileCatalog ? localSaves.getItem(modeKey) : null);
  if (mode === "#solo") {
    try {
      const savedSolo = JSON.parse(localSaves.getItem(soloKey));
      if (savedSolo?.match && ["Host","Bacteria"].includes(savedSolo.faction)) {
        localMatch = savedSolo.match;
        soloFaction = savedSolo.faction;
        soloDifficulty = savedSolo.difficulty === "hard" ? "hard" : "normal";
        syncLocal();
      }
    } catch {}
  } else if (mode === "#pass-play") {
    try { localMatch = JSON.parse(localSaves.getItem(passKey)); } catch { localMatch = null; }
    if (localMatch) syncLocal();
  } else if (!mobileCatalog && saved && !incoming.invite && (!incoming.code || incoming.code === saved.code)) {
    seat = saved; await update(false);
  }
  render();
  setInterval(() => {
    if (seat && !busy) update();
    const timer = document.querySelector("#match-timer");
    if (timer) timer.textContent = elapsedTime();
  }, 1200);
} catch (e) {
  app.innerHTML = '<p class="loading error" role="alert">' + safe(e.message) + '</p>';
}
