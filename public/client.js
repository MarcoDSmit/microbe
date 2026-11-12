import { act, canReachOptimal, newGame, printedCost, view } from "/local-rules.js";
import { nextPlayer, passPlayView } from "/pass-play.js";

const app = document.querySelector("#app");
const safe = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
  {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const storeKey = "microbe-wars.seat";
const passKey = "microbe-wars.pass-play";
const saved = (() => { try { return JSON.parse(sessionStorage.getItem(storeKey)); } catch { return null; } })();
const fragment = new URLSearchParams(location.hash.slice(1));
const incoming = { code: fragment.get("room"), invite: fragment.get("invite") };
let data, game = null, seat = null, busy = false, error = "", notice = "";
let picked = null, payment = new Set(), selected = new Set(), inspect = null;
let paymentMode = false, refreshing = false;
let sidePanel = null, dragged = null, dropSpace = null;
let localMatch = null, revealed = null;
const other = (f) => f === "Host" ? "Bacteria" : "Host";
const cardOf = (id) => id && data.cards[id.split(":")[0]];
const copyLabel = (id) => id.endsWith(":2") ? " · Copy 2" : " · Copy 1";
const siteName = (id) => data.sites.find((s) => s.id === id)?.name || id;
const icon = (mark) => mark ? '<img alt="' + safe(mark) + '" src="/icons/' + safe(mark.toLowerCase()) + '.svg">' : "";
const button = (text, action, extra = "", cls = "secondary") =>
  '<button type="button" class="' + cls + '" data-action="' + action + '" ' + extra + '>' + safe(text) + '</button>';
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
    sessionStorage.setItem(passKey, JSON.stringify(localMatch));
  } catch {
    notice = "This browser could not save the match for refresh.";
  }
}

function syncLocal() {
  if (revealed !== nextPlayer(localMatch)) revealed = null;
  game = passPlayView(localMatch, revealed, view);
  picked = null; inspect = null; payment.clear(); selected.clear(); paymentMode = false;
  dropSpace = null; sidePanel = null;
  render();
}

function move(action) {
  if (!localMatch) return transact(room() + "/action", action, true);
  if (!revealed || revealed !== nextPlayer(localMatch)) return;
  error = "";
  try {
    const updated = structuredClone(localMatch);
    act(updated, revealed, action);
    localMatch = updated;
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
  const joining = Boolean(incoming.invite && incoming.code);
  const map = Array.from({length:4}, () => '<div class="sample-node">' + '<span></span>'.repeat(6) + '</div>').join("");
  return '<section class="lobby"><div class="lobby-copy"><span class="eyebrow">Field lab · two players</span>' +
    '<h1>One board. Two factions.</h1><p>Build a foothold as Bacteria or clear infection sites as Host. Play on one device or invite an opponent.</p>' +
    '<div class="sample-map" aria-hidden="true">' + map + '</div></div><div class="panel lobby-panel">' +
    (joining ? '<h2>Join a match</h2><p>You have an invitation to room <strong>' + safe(incoming.code) + '</strong>.</p>' +
      button("Take the open seat","join",busy ? "disabled" : "","primary") :
      '<h2>Create a match</h2><p class="meta">Each player gets a private six-card hand.</p>' +
      '<label for="faction">Your faction</label><select id="faction"><option>Bacteria</option><option>Host</option></select>' +
      button("Create private room","create",busy ? "disabled" : "","primary") +
      '<hr><h2>Same device</h2><p class="meta">Take turns passing the screen. Hands and objectives are hidden at each handoff.</p>' +
      button("Pass & Play","startLocal",busy ? "disabled" : "","primary")) + err() + '</div></section>';
}
const cardTitle = (c) => c.faction === "Bacteria" ? c.identity : c.name.split(" — ")[0];
const tagNames = { hospital:"Hospital-associated", uropathogen:"Uropathogen", skin_flora:"Skin flora",
  skin_associated:"Skin-associated", gut_flora:"Gut flora", ampc:"AmpC", vre:"VRE" };
const objectiveTags = new Set(["uropathogen","respiratory","hospital","staphylococcus"]);
function cardTags(card, compact = false) {
  const tags = card.tags.filter(tag => !compact || objectiveTags.has(tag));
  const classification = card.faction === "Bacteria" ? ["Gram-" + card.gram.toLowerCase()] :
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
    ["Resistance","R",card.resist,"Check the card’s Resistance reaction"],
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
function cardDetail() {
  const instance = inspect || picked;
  const card = cardOf(instance);
  if (!card) return '<div class="panel detail"><h2>Card inspector</h2><p class="meta">Select a card on the board or in your hand to read its ability.</p></div>';
  const site = game.board.find((s) => s.slots.some((o) => o?.id === instance));
  const onBoard = site?.slots.find((o) => o?.id === instance);
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
  return '<div class="panel detail"><h2>' + safe(cardTitle(card)) + '</h2><p>' + safe(card.name) + '</p>' +
    strip(card) + '<details><summary>Aligned match rail</summary>' + rail(card) + '</details>' +
    '<p class="meta">' + safe(cardTags(card).join(" · ") + " · cost " + printedCost(instance, game.hostBalance) +
      " · base " + card.base + " VP · tuck " + card.tuck + " VP") + '</p>' +
    (card.ability || "No additional ability.").split("\n").map(line => '<p>' + safe(line) + '</p>').join("") +
    ((card.id === "H39" && !game.board.some(s => s.id === "N02")) ||
     (card.id === "H42" && !game.board.some(s => s.id === "N03")) ?
      '<p class="meta">The site required for this antibiotic’s tuck ability is absent from this match.</p>' : "") +
    (card.synergy ? '<p><b>Synergy</b> · ' + safe(card.synergy) + '</p>' : "") +
    (onBoard?.tucked.length ? '<p><b>Tucked beneath</b> · ' + safe(onBoard.tucked.map((o) => cardOf(o.id).name).join(", ")) + '</p>' : "") +
    match + '<small class="card-id">' + safe(card.id + (game.actionRules ? copyLabel(instance) : "")) + '</small></div>';
}

function renderBoard() {
  const available = game.legal[picked];
  const ready = available && payment.size === available.cost && !busy;
  return '<details class="panel match-key"><summary>Match key · Optimal, Active, Resistance</summary>' +
    '<p>Find the antibiotic’s symbol on the bacterium. <b>Optimal (O)</b> qualifies for a local tuck or a single distant tuck instead of the on-play local attack. ' +
    '<b>Active (A)</b> qualifies for a local tuck. <b>Resistance (R)</b> prevents the antibiotic from tucking the bacterium and can trigger its printed reaction, such as drawing a card. ' +
    'A symbol absent from all three rows gives no tuck. Follow any limits printed on the card.</p></details>' +
    '<p class="meta">To unlock a site boon, start your turn with at least 3 of your cards there and more than your opponent.</p><div class="board">' + game.board.map((site) => {
    const occupied = site.slots.slice(0,6).filter(Boolean), b = occupied.filter((o) => cardOf(o.id).faction === "Bacteria").length;
    const h = occupied.length-b;
    const info = data.sites.find((s) => s.id === site.id);
    const cells = site.slots.map((piece, i) => {
      if (piece) {
        const c = cardOf(piece.id);
        return '<button class="slot ' + c.faction.toLowerCase() + '" data-action="inspect" data-id="' + piece.id +
          '" title="' + safe(c.name) + '">' + strip(c,true) + '<span class="slot-name">' + safe(cardTitle(c)) +
          '</span><span class="slot-note">' + safe(cardTags(c,true).join(" · ")) + '</span>' +
          (piece.tucked.length ? '<span class="slot-note">' + piece.tucked.length + ' tucked</span>' : "") +
          '<span class="card-id">' + safe(c.id) + '</span></button>';
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
    return '<section class="node"><div class="node-title"><h3>' + safe(info.name) + '</h3><span class="slot-note">' +
      control + ' · ' + occupied.length + '/6</span></div><div class="grid">' + cells + '</div>' + extraSpace + '<details><summary>Site boon &amp; scoring</summary><small>' +
      safe(game.uniqueSiteBoons ? info.power : info.legacyPower ?? info.power) + '</small><small>Majority +3 VP · Full control +5 VP</small><small>' +
      safe(info.bacteriaSynergy) + '<br>' + safe(info.hostSynergy) + '</small></details></section>';
  }).join("") + '</div>';
}

const objectiveValue = (g) => g.vp + (g.per ? " VP per qualifying entry" : " VP if met");
function cardFace(card, id, effectiveCost) {
  const cost = printedCost(id, game.hostBalance);
  const variant = card.name.split(" — ")[1];
  return strip(card) + '<span class="card-head"><strong>' + safe(cardTitle(card)) + '</strong>' +
    '<span class="cost" aria-label="Printed cost ' + cost + '">' + cost + '</span></span>' +
    (variant ? '<span class="card-variant">' + safe(variant) + '</span>' : '') +
    '<span class="card-tags">' + safe(cardTags(card).join(" · ")) + '</span><span class="card-stats">' +
    card.base + ' base VP · ' + card.tuck + ' VP per tuck' +
    (effectiveCost != null && effectiveCost !== cost ? ' · ' + effectiveCost + ' to play now' : '') + '</span>' +
    (card.ability || "No additional ability.").split("\n").map(line => '<span class="card-rule">' + safe(line) + '</span>').join("") +
    (card.synergy ? '<span class="card-rule"><b>Synergy</b> · ' + safe(card.synergy) + '</span>' : "");
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
      selected.has(id) + '">' + (c ? cardFace(c,id) + '<small class="card-id">' +
        safe(c.id + (game.actionRules ? copyLabel(id) : "")) + '</small>' : safe(name)) + (g ? '<small><strong>' + safe(objectiveValue(g)) + '</strong><br>' +
      safe(g.text) + '</small>' : targetSite ? '<small>' + safe(siteName(targetSite.id)) + '</small>' : "") + '</button>';
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
  return '<div class="panel choice"><h2>Resolve a choice</h2><p>' + safe(p.prompt) + '</p>' +
    options(p, p.kind === "draft") + button(skipBoon ? "Skip boon" : skipTuck ? "Skip tuck" : "Confirm choice","choose",
      selected.size < p.min || selected.size > p.max || busy ? "disabled" : "","primary") + '</div>';
}

function renderHand() {
  const legal = game.legal[picked];
  const recent = game.recentHand ?? [];
  const handOrder = [...recent, ...game.hand.filter(id => !recent.includes(id))];
  const caption = !game.hand.length ? "Your hand is empty." : legal ?
    legal.cost === 0 ? "Choose a highlighted space to play this card at cost 0." :
      payment.size === legal.cost ? (dropSpace ? "Payment ready. Confirm the destination below." : "Payment ready. Click an open space to play.") :
        "Select " + legal.cost + " other card" + (legal.cost === 1 ? "" : "s") + " to discard." :
    game.turn === game.faction ? "Drag a card to an open space, or choose Play on the card." : "Your opponent cannot see these cards.";
  return '<section class="panel hand-panel"><div class="hand-head"><div><h2>Your hand · ' + game.hand.length +
    '</h2><span class="meta">' + safe(caption) + '</span></div>' +
    (dropSpace && legal ? '<div class="card-controls">' + button("Play at " + siteName(dropSpace.site),"confirmDrop",
      payment.size !== legal.cost || busy ? "disabled" : "", "primary") + button("Cancel","clear") + '</div>' :
      legal ? button("Clear selection","clear") : "") + '</div><div class="hand-payment-layout"><div class="hand" data-recent="' +
    safe(recent.join(",")) + '">' + handOrder.map((id) => {
      const c = cardOf(id), paying = payment.has(id), active = picked === id;
      const idAttr = 'data-id="' + safe(id) + '" ';
      const canPay = paymentMode && !active;
      const playControl = !paymentMode && game.legal[id] ?
        button(active ? "Selected" : "Play","prepare",idAttr + (active || busy ? "disabled" : "")) : "";
      return '<article class="hand-card ' + c.faction.toLowerCase() + (active ? " selected" : "") + (paying ? " payment" : "") + '"' +
        (canPay ? ' data-payment-card="' + safe(id) + '" tabindex="0" aria-label="' +
          safe(c.name + (paying ? ", selected for payment" : ", select for payment")) + '"' : "") +
        ((canPay || game.legal[id]) && !busy ? ' draggable="true" data-drag-card="' + safe(id) + '"' : "") + '>' +
        cardFace(c,id,game.legal[id]?.cost) +
        '<div class="card-controls">' + button("Inspect","inspect",idAttr + 'title="' + safe(c.name) + '"') + playControl +
        '</div><small class="card-id">' + safe(c.id + (game.actionRules ? copyLabel(id) : "")) + '</small></article>';
    }).join("") + '</div>' + (paymentMode ? '<aside class="payment-zone" aria-label="Payment">' +
      '<h3>Payment <span aria-live="polite">' + payment.size + '/' + legal.cost + '</span></h3>' +
      '<p class="meta">Click cards or drag them here. Click selected cards to remove them.</p>' +
      (payment.size ? '<ul>' + [...payment].map(id => '<li>' + safe(cardOf(id).name) + '</li>').join("") + '</ul>' : '') +
      '</aside>' : '') + '</div></section>';
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
    }).join("") + '</div></section>';
}
function render() {
  if (!data) return;
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
    app.innerHTML = '<article class="game"><span class="eyebrow">Pass &amp; Play</span>' + renderScore() +
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
  const summary = '<div class="summary"><div><span class="eyebrow">' + (localMatch ? "Pass &amp; Play" : "Private room " + safe(game.code)) +
    '</span><h1>Infection board</h1></div><div class="badges">' + badge("You · " + game.faction,game.faction) +
    badge("Draw deck " + game.deckCount) + badge("Opponent hand " + game.opponentHandCount,other(game.faction)) +
    '</div></div>';
  const bar = '<div class="statusbar"><div><strong>' + safe(status) + '</strong>' +
    (game.turnNumber ? ' <span class="meta">· Turn ' + game.turnNumber + ' · ' + game.slots +
      (game.actionRules ? " actions left" : " normal plays left") + (game.jointPlay ? " · Site bonus play available" : "") + '</span>' : "") +
    (game.actionRules && topDiscard ? '<div class="meta">Top of your discard · ' + safe(topDiscard.name) + '</div>' : "") +
    '</div><div class="status-actions">' + actionButtons + (game.status === "playing" ? button("End turn","end",canEnd ? "" : "disabled","primary") : "") +
    (localMatch ? button("Hide hand","hideLocal","","plain") : "") +
    button(localMatch ? "Leave match" : "Leave this tab","leave","","plain") + '</div></div>';
  const invite = waiting && inv ? '<div class="panel choice"><h2>Invite the other player</h2><p>Share this single-use room link with your opponent. It gives them the second seat in this match.</p>' +
    '<div class="invite-row"><input id="invite" aria-label="Match invite link" readonly value="' + safe(inv) + '">' +
    button("Copy link","copy") + '</div></div>' : "";
  const objectives = '<div class="panel detail"><h2>Your objectives</h2>' +
    (game.goals.length ? game.goals.map((id) => {
      const goal = data.goals[id], points = game.objectivePoints?.[id] ?? 0;
      return '<article class="objective-card' + (points > 0 ? ' fulfilled' : '') + '"><h3>' + safe(goal.name) +
        '</h3><p><b>' + safe(objectiveValue(goal)) + '</b></p><p>' + safe(goal.text) + '</p><p class="objective-status">' +
        (goal.per ? points + ' VP currently' : points > 0 ? 'Condition met' : 'Condition open') + '</p></article>';
    }).join("") : '<p class="meta">Objectives are chosen when both seats are filled.</p>') + '</div>';
  const log = '<div class="panel"><h2>Match log</h2><ol class="log">' +
    game.log.slice().reverse().map((item) => '<li>' + safe(item) + '</li>').join("") + '</ol></div>';
  const previousHand = app.querySelector(".hand");
  const handScroll = previousHand?.dataset.recent === (game.recentHand ?? []).join(",") ? previousHand.scrollLeft : 0;
  const focused = document.activeElement?.dataset;
  const focusedAction = focused?.action, focusedId = focused?.id;
  const focusedPayment = focused?.paymentCard;
  const openedKey = app.querySelector(".match-key")?.open;
  app.innerHTML = '<article class="game">' + summary + bar + err() + (notice ? '<p class="notice" role="status">' + safe(notice) + '</p>' : "") +
    invite + renderScore() + decision() + '<nav class="side-menu" aria-label="Match information">' +
    [["inspector","Inspector"],["objectives","Objectives"],["log","Match log"]].map(([id,label]) =>
      button(label,"panel",'data-id="' + id + '" aria-expanded="' + (sidePanel === id) + '"')).join("") +
    '</nav><div class="layout' + (sidePanel ? ' panel-open' : '') + '"><section class="tabletop">' + renderBoard() +
    renderHand() + '</section>' + (sidePanel ? '<aside class="aside">' +
      (sidePanel === "inspector" ? cardDetail() : sidePanel === "objectives" ? objectives : log) + '</aside>' : '') + '</div></article>';
  app.querySelector(".hand").scrollLeft = handScroll;
  app.querySelector(".match-key").open = !!openedKey;
  if (focusedAction && focusedId) {
    [...app.querySelectorAll("button[data-action][data-id]")].find(node =>
      node.dataset.action === focusedAction && node.dataset.id === focusedId && !node.disabled)?.focus({preventScroll:true});
  }
  if (focusedPayment) {
    [...app.querySelectorAll("[data-payment-card]")].find(node =>
      node.dataset.paymentCard === focusedPayment)?.focus({preventScroll:true});
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
  if (event.target.closest("button")) { event.preventDefault(); return; }
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

app.addEventListener("keydown", event => {
  if (!event.target.matches("[data-payment-card]") || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  if (!event.repeat) togglePayment(event.target.dataset.paymentCard);
});

app.addEventListener("click", async (event) => {
  const node = event.target.closest("button[data-action]");
  if (!node) {
    const id = event.target.closest("[data-payment-card]")?.dataset.paymentCard;
    if (id) togglePayment(id);
    return;
  }
  if (node.disabled || node.getAttribute("aria-disabled") === "true") return;
  const {action,id,site,slot} = node.dataset;
  if (action === "startLocal") {
    localMatch = newGame();
    localMatch.status = "objectives";
    revealed = null; error = ""; notice = "";
    seat = null;
    history.replaceState(null, "", "#pass-play");
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
        !confirm(localMatch ? "End this Pass & Play match?" : "Leave this match in this tab? You will lose this tab’s saved seat.")) return;
    sessionStorage.removeItem(localMatch ? passKey : storeKey);
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
    picked = id; dropSpace = null; payment.clear(); paymentMode = game.legal[id].cost > 0;
    render(); return;
  }
});

try {
  data = await request("/api/cards");
  if (location.hash === "#pass-play") {
    try { localMatch = JSON.parse(sessionStorage.getItem(passKey)); } catch { localMatch = null; }
    if (localMatch) syncLocal();
  } else if (saved && !incoming.invite && (!incoming.code || incoming.code === saved.code)) {
    seat = saved; await update(false);
  }
  render();
  setInterval(() => {
    if (seat && !busy && game?.status !== "finished") update();
  }, 1200);
} catch (e) {
  app.innerHTML = '<p class="loading error" role="alert">' + safe(e.message) + '</p>';
}
