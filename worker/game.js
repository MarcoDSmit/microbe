import data from "./data.json" with { type: "json" };

const { cards: catalog, matrix, sites, goals } = data;
const siteRules = Object.fromEntries(sites.map(site => [site.id, site]));
const cardTypeId = (id) => id.split(":")[0];
const cards = { ...catalog, ...Object.fromEntries(Object.entries(catalog).map(([id, card]) => [id + ":2", card])) };
export const sides = ["Bacteria", "Host"];
const opposite = (f) => f === "Bacteria" ? "Host" : "Bacteria";
const tagged = (id, tag) => cards[id].tags.includes(tag);
const capacity = s => s.siteCapacity ?? 6;
const hasSynergy = (id, site) => cards[id].siteSynergies?.some(bonus => bonus.site === site) ?? false;
const stackSize = piece => piece.tucked.reduce((n, child) => n + 1 + stackSize(child), 0);
const holdsOptimal = piece => piece.tucked.some(child => child.antibioticTuck?.match === "OPTIMAL");
const tuckPoints = piece => cards[piece.id].type === "Antibiotic"
  ? 2 * (stackSize(piece) + piece.tucked.filter(child => child.antibioticTuck?.match === "OPTIMAL").length)
  : cards[piece.id].tuck * stackSize(piece);
const hiddenAntibioticPoints = piece => piece.tucked.reduce((n, child) => n +
  (cards[piece.id].faction === "Bacteria" && cards[child.id].type === "Antibiotic" ? stackSize(child) : 0) +
  hiddenAntibioticPoints(child), 0);
const refugeCards = new Set(Object.values(catalog).filter(card => card.effects.evade).map(card => card.id));
export const printedCost = id => cards[id].cost;
export const canReachOptimal = id => !!cards[id]?.effects.attack?.onPlayDrug;

export class RuleError extends Error {}
function requireRule(ok, message) { if (!ok) throw new RuleError(message); }

function shuffle(array, random) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const log = (s, text) => { s.log.push(text); if (s.log.length > 48) s.log.shift(); };
const location = (s, id) => {
  for (const site of s.board) {
    const index = site.slots.findIndex((o) => o?.id === id);
    if (index >= 0) return { site, index, piece: site.slots[index] };
  }
  return null;
};
const siteAt = (s, id) => s.board.find((site) => site.id === id);
const visible = (s, f) => s.board.flatMap((site) => site.slots.filter(Boolean)
  .filter((o) => !f || cards[o.id].faction === f).map((o) => ({ site, ...o })));
const siteCards = (site, f) => site.slots.filter((o) => o && (!f || cards[o.id].faction === f));
const majority = (site) => {
  const b = siteCards(site, "Bacteria").length, h = siteCards(site, "Host").length;
  return b >= 2 && b > h ? "Bacteria" : h >= 2 && h > b ? "Host" : null;
};
const space = (site) => site.slots.indexOf(null);
const task = (s, ...jobs) => s.queue.unshift(...jobs);

export function newGame(random = secureRandom) {
  const players = {};
  const board = shuffle(sites, random).slice(0, 4).map(({id}) => ({ id, slots: Array(4).fill(null) }));
  const activeSites = new Set(board.map(site => site.id));
  for (const f of sides) {
    const deck = shuffle(Object.keys(catalog).filter((id) => catalog[id].faction === f)
      .flatMap((id) => [id, id + ":2"].slice(0, catalog[id].copies ?? 2)), random);
    const goalDeck = shuffle(Object.keys(goals).filter((id) => goals[id].faction === f &&
      (goals[id].requiresSites ?? []).every(site => activeSites.has(site))), random);
    players[f] = { deck, hand: deck.splice(0, 6), discard: [], goalDeck, goals: [],
      offer: goalDeck.splice(0, 3), goalDiscard:[], turns: 0 };
  }
  const first = sides[Math.floor(random() * sides.length)];
  return {
    status: "waiting", siteCapacity: 4, first, turn: first, turnNumber: 0, players,
    board, series:{Bacteria:0, Host:0, ties:0}, playedPoints:[], spentReactions:{},
    queue: [], pending: null, log: ["The two decks are shuffled."],
    actionRules: true, hostBalance: true, uniqueSiteBoons: true, expandedResistance: true, slots: 0, jointPlay: false, discount: 0, nextExtra: false, extra: false, exhausted: false, scores: null,
  };
}

function draw(s, f, n) {
  if (n && s.sitePerks?.discardDraw && s.turn === f && s.players[f].discard.length) {
    task(s, ...Array.from({length:n}, () => ({kind:"discardDraw", f})));
    return n;
  }
  return drawDeck(s, f, n);
}
function drawDeck(s, f, n) {
  const drawn = s.players[f].deck.splice(0, n);
  gainCards(s.players[f], drawn);
  if (drawn.length) log(s, f + " drew " + drawn.length + (drawn.length === 1 ? " card." : " cards."));
  return drawn.length;
}
function gainCards(player, ids) {
  if (!ids.length) return;
  player.hand.unshift(...ids);
  player.recentHand = ids;
}
function take(s, captor, target, remote = false) {
  const a = location(s, captor), b = location(s, target);
  if (!a || !b) return false;
  const drug = cards[captor];
  if (drug.rail && cards[target].faction === "Bacteria") {
    const match = matrix[cardTypeId(captor)]?.[cardTypeId(target)];
    if (match === "OPTIMAL" || match === "ACTIVE") {
      b.piece.antibioticTuck = { match, remote };
    }
  }
  a.piece.tucked.push(b.piece);
  b.site.slots[b.index] = null;
  const play = s.queue.find((job) => job.kind === "recordPlay" && job.id === captor);
  if (play) play.tucked = true;
  log(s, cards[target].name + " tucked beneath " + cards[captor].name + ".");
  if (s.sitePerks?.tuckDraw && cards[captor].faction === s.turn && cards[target].faction !== s.turn) {
    s.sitePerks.tuckDraw = false;
    draw(s, s.turn, 1);
  }
  return true;
}

function begin(s, f, extra = false) {
  s.startedAt ??= Date.now();
  s.turn = f; s.turnNumber++; s.players[f].turns++;
  s.extra = extra; s.nextExtra = false; s.exhausted = false;
  s.slots = s.actionRules ? 3 : 1; s.discount = 0; s.jointPlay = false;
  log(s, f + (extra ? " takes an extra turn." : " begins turn " + s.turnNumber + "."));
  const controlledBoons = s.board.filter((site) => majority(site) === f).map(({id}) => {
    const rules = siteRules[id];
    return [s.uniqueSiteBoons ? rules.boon : rules.legacyBoon ?? rules.boon, id];
  });
  const boons = new Map(controlledBoons);
  s.sitePerks = { discardDraw: boons.has("retrieve"), focusedDraw: boons.has("focusedDraw"), rebateSite: boons.get("rebate") ?? null, tuckDraw: boons.has("tuckDraw") };
  if (boons.has("discount")) s.discount = 1;
  if (boons.has("extraPlay")) {
    if (s.actionRules) s.jointPlay = true;
    else s.slots++;
  }
  const jobs = [];
  const drawCount = controlledBoons.filter(([boon]) => boon === "draw").length;
  if (drawCount) jobs.push({ kind: "draw", f, count: drawCount });
  if (boons.has("recirculate")) jobs.push({ kind: "recirculate", f });
  if (boons.has("digest")) jobs.push({ kind: "filter", f, count: 2, required: true });
  if (boons.has("relocate")) jobs.push({ kind: "relocate", f, site: boons.get("relocate") });
  if (boons.has("survey")) jobs.push({ kind: "survey", f });
  if (boons.has("tradeDraw")) jobs.push({ kind: "tradeDraw", f });
  if (!s.actionRules) jobs.push({ kind: "turnDraw", f });
  task(s, ...jobs);
}

function tuckTargets(s, id, mode, remote = false, site = location(s, id)?.site) {
  if (!site) return [];
  const type = cardTypeId(id);
  const opponent = opposite(cards[id].faction);
  const candidates = remote ? visible(s, opponent).filter((o) => o.site !== site) : siteCards(site, opponent);
  return candidates.filter((o) => {
    if (cards[o.id].type === "Antibiotic" && holdsOptimal(o)) return false;
    if (mode === "ambush") return true;
    const target = cardTypeId(o.id);
    if (mode === "immune") return stackSize(o) <= 1;
    const activity = matrix[type]?.[target];
    return activity === "OPTIMAL" || (!remote && activity === "ACTIVE");
  }).map((o) => o.id);
}

function onPlayAttack(type) {
  return cards[type].effects.attack ?? null;
}

function stageAttack(s, job, targets) {
  const attacker = location(s, job.id);
  if (!attacker || !targets.length) return;
  task(s, ...targets.map((id) => ({
    kind: "capture", id, captor: job.id,
    remote: !!job.onPlayDrug && attacker.site !== location(s, id)?.site,
  })));
}

function resolveCapture(s, job) {
  const a = location(s, job.captor), b = location(s, job.id);
  if (!a || !b || (a.site !== b.site && !job.remote)) return;
  if (cards[job.captor].faction === "Host" && refugeCards.has(cardTypeId(job.id)) &&
      b.piece.refugeTurn !== s.players.Bacteria.turns) {
    const destinations = s.board.filter((site) => site.id !== b.site.id && space(site) >= 0);
    if (destinations.length) {
      s.pending = { kind: "refuge", f: "Bacteria", self: true,
        destinations: destinations.map((site) => site.id), job,
        prompt: "Move " + cards[b.piece.id].name + " to another site to evade the tuck, or accept the tuck." };
      return;
    }
  }
  take(s, job.captor, job.id, job.remote);
}

const goAgainSuppressed = s => visible(s, opposite(s.turn)).some(o => cards[o.id].effects.blockGoAgain);

function scoreMatch(s, reason) {
  s.status = "finished"; s.pending = null; s.queue = [];
  s.scores = { Bacteria: score(s, "Bacteria"), Host: score(s, "Host") };
  s.endedAt = Date.now();
  s.series = countSeriesResult(s.series, s.scores);
  s.reason = reason;
  log(s, "Match ended: " + reason + ".");
}
function countSeriesResult(series, scores) {
  const result = {Bacteria:0, Host:0, ties:0, ...series};
  const margin = scores.Bacteria.total - scores.Host.total;
  result[margin === 0 ? "ties" : margin > 0 ? "Bacteria" : "Host"]++;
  return result;
}
function shouldEnd(s) {
  if (s.board.every((site) => space(site) < 0)) return "all "+s.board.reduce((n,site)=>n+site.slots.length,0)+" spaces filled";
  if (sides.some((f) => s.board.filter((site) => siteCards(site, f).length === capacity(s)).length >= 2)) {
    return "a faction filled two sites";
  }
  if (s.actionRules ? sides.some((f) => !s.players[f].deck.length) : s.exhausted) return "deck exhaustion";
  return null;
}
function finishTurn(s) {
  updatePatientHealth(s);
  const reason = shouldEnd(s);
  if (reason) { scoreMatch(s, reason); return; }
  const extra = s.nextExtra && !s.extra && !goAgainSuppressed(s);
  begin(s, extra ? s.turn : opposite(s.turn), extra);
}

function updatePatientHealth(s) {
  if (!s.players[opposite(s.turn)].turns) return;
  const margin = Object.values(liveSitePoints(s)).reduce((sum, site) => sum + site.Host - site.Bacteria, 0);
  const band = Math.sign(margin) * Math.min(4, Math.floor(Math.abs(margin) / 10)) || 0;
  s.patientHealth = {band, leftCenter:!!(s.patientHealth?.leftCenter || band)};
}

function pump(s) {
  while (s.status === "playing" && !s.pending && s.queue.length) {
    const job = s.queue.shift();
    switch (job.kind) {
      case "draw": draw(s, job.f, job.count); break;
      case "discardDraw": {
        const player = s.players[job.f];
        if (!player.discard.length) drawDeck(s, job.f, 1);
        else s.pending = { ...job, choices:[...player.discard], min:player.deck.length ? 0 : 1, max:1,
          prompt:"Peripheral IV · Choose a discard or confirm with no selection to draw from the deck." };
        break;
      }
      case "turnDraw": {
        const n = s.turnNumber === 1 ? 1 : 2;
        s.exhausted = draw(s, job.f, n) < n;
        break;
      }
      case "retrieve": {
        const choices = [...s.players[job.f].discard];
        if (choices.length) s.pending = { kind: "retrieve", f: job.f, choices,
          min: job.optional ? 0 : 1, max: 1, prompt: "Choose a card to retrieve from your discard." };
        break;
      }
      case "draft": {
        const choices = s.players[job.f].goalDeck.splice(0, job.count);
        if (choices.length === 1) s.players[job.f].goals.push(choices[0]);
        else if (choices.length) s.pending = { kind: "draft", f: job.f, choices, min: 1, max: 1,
          prompt: "Choose one secret objective to keep." };
        break;
      }
      case "filter": {
        const p = s.players[job.f], choices = p.deck.splice(0, job.count ?? 3);
        if (job.required && choices.length === 1) gainCards(p, choices);
        else if (choices.length) s.pending = { kind: "filter", f: job.f, choices,
          min: job.required ? 1 : 0, max: job.required ? 1 : Math.min(2, choices.length),
          prompt: job.required ? "Gastrointestinal Tract · Keep one card and discard the other." :
            "Keep up to two of these three cards." };
        break;
      }
      case "recirculate":
      case "tradeDraw": {
        const p = s.players[job.f], heart = job.kind === "recirculate";
        if (p.hand.length && (heart ? p.discard.length >= 2 : p.deck.length >= 2)) s.pending = {
          ...job, choices: [...p.hand], min: 0, max: 1,
          ...(heart ? { preview: p.discard.slice(-2) } : {}),
          prompt: heart ? "Heart · Discard one card to recover the two cards shown, or skip." :
            "Ear · Discard one card from your hand to draw two, or skip.",
        };
        break;
      }
      case "relocate": {
        const choices = visible(s, job.f).filter(o => o.site.id !== job.site).map(o => o.id);
        if (choices.length && space(siteAt(s, job.site)) >= 0) s.pending = {
          ...job, choices, min: 0, max: 1, prompt: "Skin & Soft Tissue · Move one of your cards here, or skip.",
        };
        break;
      }
      case "survey": {
        const deck = s.players[job.f].deck;
        if (deck.length >= 2) s.pending = { ...job, choices: deck.slice(0, 2), min: 1, max: 1,
          prompt: "Eye · Choose the card to put on top. The other goes to the bottom." };
        break;
      }
      case "bonus": {
        const canPlay = s.players[job.f].hand.some((id) => s.board.some((site) =>
          !playProblem(s, job.f, id, site, job)));
        if (canPlay) s.pending = { ...job, kind: "bonus", prompt: "Take the bonus play or skip it." };
        break;
      }
      case "attack": {
        const targets = tuckTargets(s, job.id, job.mode);
        const remote = s.hostBalance && job.onPlayDrug && !job.fullSite ? tuckTargets(s, job.id, job.mode, true) : [];
        if (remote.length && (job.mode === "sweep" || job.limit > 1)) {
          s.pending = { kind: "attack", f: "Host", job, localSweep: targets,
            choices: [...(targets.length ? ["local"] : []), ...remote], min: 1, max: 1,
            prompt: "Choose the local sweep or one Optimal target at another site." };
          break;
        }
        targets.push(...remote);
        if (!targets.length) break;
        if (job.mode === "sweep") stageAttack(s, job, targets);
        else {
          const max = Math.min(job.limit, targets.length);
          if (targets.length === 1 && !job.optional) stageAttack(s, job, targets);
          else s.pending = { kind: "attack", f: cards[job.id].faction, job, choices: targets,
            min: job.optional ? 0 : 1, max, prompt: "Choose which cards to tuck." };
        }
        break;
      }
      case "capture": resolveCapture(s, job); break;
      case "settleTuckPlay": {
        const site = siteAt(s, job.site);
        if (site.slots[capacity(s)] === null) {
          site.slots.pop();
          break;
        }
        if (site.slots[capacity(s)] === null) {
          site.slots.pop();
          break;
        }
        const vacated = site.slots.indexOf(null);
        requireRule(vacated >= 0 && vacated < capacity(s), "A tuck play must clear a space at this site.");
        site.slots[vacated] = site.slots.pop();
        break;
      }
      case "resistPlay": {
        const choices = job.choices.filter(id => location(s, id));
        if (choices.length === 1) resistPlay(s, choices[0], job.antibiotic);
        else if (choices.length > 1) s.pending = { ...job, choices, f:"Bacteria", min:1, max:1,
          prompt:"Choose the resistant bacterium that tucks this antibiotic." };
        break;
      }
      case "recordPlay": {
        const entry = location(s, job.id);
        const own = visible(s, job.f);
        const card = own.find(o => o.id === job.id);
        const points = card ? cards[job.id].base + cardSynergy(card, own) +
          tuckPoints(card) : 0;
        (s.playedPoints ??= []).push({id:job.id, faction:job.f, site:entry?.site.id ?? job.site,
          turn:s.turnNumber, points, tucked:job.tucked ?? false});
        break;
      }
      case "finish": finishTurn(s); break;
    }
  }
}

const playCost = (s, id, bonus) => Math.max(0, printedCost(id, s.hostBalance) - (bonus?.discount ?? s.discount));

function resistanceTargets(id, site) {
  const drug = cards[id];
  if (drug.type !== "Antibiotic" || !drug.mark) return [];
  return siteCards(site, "Bacteria").filter(piece => cards[piece.id].resist.includes(drug.mark)).map(piece => piece.id);
}

function resistPlay(s, bacterium, antibiotic) {
  const target = location(s, bacterium);
  if (!target || !take(s, bacterium, antibiotic)) return;
  target.piece.usedResistanceMatch = true;
  drawDeck(s, "Bacteria", 1);
}

function playProblem(s, f, id, site, bonus) {
  if (!s.players[f].hand.includes(id)) return "Choose a card from your hand.";
  if (!site) return "Choose a site.";
  if (space(site) < 0) {
    const attack = onPlayAttack(cardTypeId(id));
    if (!resistanceTargets(id, site).length &&
        (!attack || !tuckTargets(s, id, attack.mode, false, site).length)) return "This site has no eligible tuck target.";
  }
  if (bonus?.site && bonus.site !== site.id) return "The bonus card must be played at the same site.";
  if (bonus?.tag && !tagged(id, bonus.tag)) return "That card lacks the required tag for the bonus play.";
  if (bonus?.type && cards[id].type !== bonus.type) return "That card has the wrong type for the bonus play.";
  if (playCost(s, id, bonus) >= s.players[f].hand.length) {
    return "You do not have enough cards to pay for this play.";
  }
  return null;
}

function performPlay(s, f, action) {
  const bonus = s.pending?.kind === "bonus" ? s.pending : null;
  requireRule(f === s.turn && (!s.pending || bonus?.f === f), "Wait for the pending choice.");
  requireRule(bonus || s.slots > 0 || s.jointPlay, "You have no plays left this turn.");
  const { card: id, site: siteId, slot, pay } = action;
  const site = siteAt(s, siteId), error = playProblem(s, f, id, site, bonus);
  requireRule(!error, error);
  const fullSite = space(site) < 0;
  const validSlot = fullSite ? slot === capacity(s) && site.slots.length === capacity(s) :
    Number.isInteger(slot) && slot >= 0 && slot < capacity(s) && site.slots[slot] === null;
  requireRule(validSlot, "Choose an open space or the tuck space at a full site.");
  const player = s.players[f];
  const cost = playCost(s, id, bonus);
  requireRule(Array.isArray(pay) && pay.length === cost && new Set(pay).size === cost &&
    pay.every((k) => k !== id && player.hand.includes(k)), "Select exactly " + cost + " other cards to discard.");
  player.hand = player.hand.filter((k) => k !== id && !pay.includes(k));
  player.discard.push(...pay);
  site.slots[slot] = { id, tucked: [] };
  log(s, f + " played " + cards[id].name + " at " + sites.find((x) => x.id === siteId).name + ".");
  if (bonus) s.pending = null;
  else {
    if (s.slots > 0) s.slots--;
    else s.jointPlay = false;
    s.discount = 0;
  }
  const type = cardTypeId(id);
  const resist = resistanceTargets(id, site);
  if (resist.length) {
    task(s, {kind:"resistPlay", choices:resist, antibiotic:id},
      ...(fullSite ? [{kind:"settleTuckPlay", site:siteId}] : []),
      {kind:"recordPlay", id, f, site:siteId});
    return;
  }
  const jobs = [];
  if (s.sitePerks?.rebateSite === siteId && cost > 0) {
    s.sitePerks.rebateSite = null;
    jobs.push({ kind: "draw", f, count: 1 });
  }
  const effects = cards[id].effects;
  if (effects.draw) jobs.push({ kind:"draw", f, count:effects.draw });
  if (effects.draft) jobs.push({ kind:"draft", f, count:effects.draft });
  if (effects.goAgain && !s.extra && !goAgainSuppressed(s)) s.nextExtra = true;
  const attack = onPlayAttack(type);
  if (attack) jobs.push({ kind:"attack", id, ...attack, fullSite, optional:!fullSite && attack.optional });
  if (fullSite) jobs.push({ kind:"settleTuckPlay", site:siteId });
  jobs.push({kind:"recordPlay", id, f, site:siteId});
  if (effects.bonus) jobs.push({ kind:"bonus", f, site:null, discount:0 });
  task(s, ...jobs);
}

function choices(p, selected) {
  requireRule(Array.isArray(selected) && selected.length >= p.min && selected.length <= p.max &&
    new Set(selected).size === selected.length && selected.every((id) => p.choices.includes(id)), "Choose the required number of valid options.");
}

const replayFields = ["type", "card", "site", "slot", "pay", "selected", "protector", "destination"];

export function matchReplay(s) {
  if (s.status !== "finished") throw new RuleError("Finish the match before exporting it.");
  return {
    format: "microbe-wars-replay", version: 1, recording: s.recording ?? null,
    result: { scores: s.scores, reason: s.reason, turns: s.turnNumber },
    played: s.playedPoints ?? [], log: s.log ?? [],
    timing: { startedAt: s.startedAt ?? null, endedAt: s.endedAt ?? null },
  };
}

function canUndo(s, f) {
  const checkpoint = s.undoCheckpoint;
  return s.status === "playing" && s.turn === f && (!s.pending || s.pending.f === f) &&
    checkpoint?.faction === f &&
    checkpoint.turn === s.turnNumber;
}

export function act(s, f, action) {
  if (action?.type === "undo") {
    requireRule(canUndo(s, f), "There is no action to undo this turn.");
    const { boardState, actionCount } = s.undoCheckpoint;
    const recording = s.recording;
    recording.actions.length = actionCount;
    for (const key of Object.keys(s)) delete s[key];
    Object.assign(s, boardState, { recording });
    return s;
  }
  if (action?.type === "rematch") return applyAction(s, f, action);
  const start = s.recording ? null : structuredClone(s);
  const pending = s.pending?.kind ?? null;
  const checkpoint = s.status === "playing" && s.turn === f &&
    ["play", "drawCard", "takeDiscard"].includes(action?.type) ?
    structuredClone(Object.fromEntries(Object.entries(s).filter(([key]) =>
      key !== "recording" && key !== "undoCheckpoint"))) : null;
  const result = applyAction(s, f, action);
  const recording = result.recording ??= { start, actions: [], partial: start.turnNumber > 0 ||
    sides.some(side => start.players[side].goals.length > 0) };
  const move = {};
  for (const field of replayFields) {
    const value = action[field];
    if (typeof value === "string" || Number.isInteger(value)) move[field] = value;
    else if (Array.isArray(value) && ["pay", "selected"].includes(field)) {
      move[field] = value.filter(id => typeof id === "string");
    }
  }
  if (action.type === "end" || result.status !== "playing" || result.turnNumber !== s.undoCheckpoint?.turn) {
    delete result.undoCheckpoint;
  }
  if (checkpoint && result.status === "playing" && result.turnNumber === checkpoint.turnNumber) {
    result.undoCheckpoint = { faction:f, turn:result.turnNumber, boardState:checkpoint, actionCount:recording.actions.length };
  }
  recording.actions.push({ faction: f, pending, action: move });
  return result;
}

function applyAction(s, f, action) {
  requireRule(action && typeof action === "object" && !Array.isArray(action), "Choose an action.");
  if (action.type === "rematch") {
    requireRule(s.status === "finished", "Finish the match before starting a rematch.");
    return { ...newGame(), creatorFaction:s.creatorFaction, status:"objectives",
      series:s.series ?? countSeriesResult(null, s.scores) };
  }
  requireRule(s.status === "playing" || s.status === "objectives", "The match is not ready for a move.");
  const player = s.players[f];
  if (s.status === "objectives") {
    requireRule(action.type === "objectives" && player.offer?.length, "Waiting for the other player.");
    choices({ choices: player.offer, min: 2, max: 2 }, action.selected);
    player.goals.push(...action.selected);
    player.offer = [];
    if (sides.every((side) => s.players[side].goals.length === 2)) {
      s.status = "playing";
      begin(s, s.first);
    }
  } else if (action.type === "play") {
    performPlay(s, f, action);
  } else if (action.type === "drawCard" || action.type === "takeDiscard") {
    requireRule(s.actionRules && f === s.turn && !s.pending && s.slots > 0, "No action is available right now.");
    if (action.type === "drawCard") {
      requireRule(player.deck.length > 0 || (s.sitePerks?.discardDraw && player.discard.length > 0), "Your deck is empty.");
      draw(s, f, s.sitePerks?.focusedDraw ? 2 : 1);
      if (s.sitePerks) s.sitePerks.focusedDraw = false;
    } else {
      requireRule(player.discard.length > 0, "Your discard pile is empty.");
      const id = player.discard.pop();
      gainCards(player, [id]);
      log(s, f + " took " + cards[id].name + " from the top of discard.");
    }
    s.slots--;
  } else if (action.type === "end") {
    requireRule(f === s.turn && !s.pending, "Resolve the current choice before ending your turn.");
    const excess = player.hand.length - 12;
    if (excess > 0) s.pending = { kind: "trim", f, min: excess, max: excess,
      choices: [...player.hand], prompt: "Discard down to 12 cards." };
    else task(s, { kind: "finish" });
  } else if (action.type === "skipBonus") {
    requireRule(s.pending?.kind === "bonus" && s.pending.f === f, "No bonus play to skip.");
    s.pending = null;
  } else if (action.type === "refuge") {
    const p = s.pending;
    requireRule(p?.kind === "refuge" && p.f === f, "No Refuge choice is pending.");
    if (action.protector || action.destination) {
      requireRule(p.destinations.includes(action.destination), "Choose a different site with room.");
      const target = location(s, p.job.id), dest = siteAt(s, action.destination);
      if (p.self) {
        target.piece.refugeTurn = player.turns;
      } else {
        // A saved match may still have a Refuge prompt from the previous rules.
        requireRule(p.choices.includes(action.protector), "Choose a Refuge card.");
        const protection = location(s, action.protector).piece;
        protection.refugeUsed = (protection.refugeUsed ?? 0) + 1;
      }
      dest.slots[space(dest)] = target.piece; target.site.slots[target.index] = null;
      log(s, cards[p.job.id].name + " evaded the tuck and moved to " + sites.find((x) => x.id === dest.id).name + ".");
    } else take(s, p.job.captor, p.job.id, p.job.remote);
    s.pending = null;
  } else if (action.type === "choose") {
    const p = s.pending;
    requireRule(p && p.f === f && p.choices && p.kind !== "refuge", "There is no choice for you to resolve.");
    choices(p, action.selected);
    const selected = action.selected;
    s.pending = null;
    switch (p.kind) {
      case "discardDraw":
        if (!selected.length) drawDeck(s, f, 1);
        // Selected discards use the same transfer as retrieval.
      case "retrieve":
        if (selected.length) {
          gainCards(player, selected); player.discard.splice(player.discard.indexOf(selected[0]), 1);
          log(s, f + " retrieved a card from discard.");
        }
        break;
      case "resistPlay": resistPlay(s, selected[0], p.antibiotic); break;
      case "draft":
        player.goals.push(selected[0]);
        (player.goalDiscard ??= []).push(...p.choices.filter(id => id !== selected[0]));
        break;
      case "filter":
        gainCards(player, selected); player.discard.push(...p.choices.filter((id) => !selected.includes(id))); break;
      case "recirculate":
      case "tradeDraw":
        if (selected.length) {
          player.hand.splice(player.hand.indexOf(selected[0]), 1);
          if (p.kind === "recirculate") gainCards(player, player.discard.splice(-2));
          player.discard.push(selected[0]);
          if (p.kind === "tradeDraw") draw(s, f, 2);
        }
        break;
      case "relocate":
        if (selected.length) {
          const from = location(s, selected[0]), to = siteAt(s, p.site);
          to.slots[space(to)] = from.piece;
          from.site.slots[from.index] = null;
          log(s, cards[selected[0]].name + " moved to " + siteRules[p.site].name + ".");
        }
        break;
      case "survey": {
        const top = player.deck.splice(0, 2);
        player.deck.unshift(selected[0]);
        player.deck.push(top.find(id => id !== selected[0]));
        break;
      }
      case "attack":
        if (selected[0] === "local" && p.job.mode !== "sweep") {
          s.pending = {kind:"attack", f, job:p.job, choices:p.localSweep,
            min:p.job.optional ? 0 : 1, max:Math.min(p.job.limit,p.localSweep.length),
            prompt:"Choose up to "+p.job.limit+" matching bacteria here."};
        } else stageAttack(s, p.job, selected[0] === "local" ? p.localSweep : selected);
        break;
      case "guard":
        // A saved match may still have a Guard choice pending.
        take(s, selected[0], p.attacker); break;
      case "resistance":
        if (selected[0] === "tuck") take(s, p.id, p.antibiotic);
        else draw(s, f, 1);
        break;
      case "trim":
        player.hand = player.hand.filter((id) => !selected.includes(id)); player.discard.push(...selected);
        task(s, { kind: "finish" }); break;
    }
  } else throw new RuleError("Unknown action.");
  pump(s);
  return s;
}

function goalScore(s, f, id) {
  const own = visible(s, f), unique = (os) => new Set(os.map((o) => cards[o.id].identity)).size;
  const across = (predicate) => new Set(own.filter(predicate).map((o) => o.site.id)).size;
  const at = site => own.filter(o => o.site.id === site && hasSynergy(o.id, site)).length;
  const controls = (site) => majority(siteAt(s, site)) === f;
  const countTucks = (type) => own.filter((o) => cards[o.id].type === type)
    .reduce((sum, o) => sum + o.tucked.filter((t) => cards[t.id].faction === "Bacteria").length, 0);
  const tuckedBy = (type) => own.filter((o) => cards[o.id].type === type)
    .flatMap((o) => o.tucked.filter((t) => cards[t.id].faction === "Bacteria"));
  const antibioticTucks = () => tuckedBy("Antibiotic").map((t) => t.antibioticTuck);
  const b = own.filter((o) => cards[o.id].identity === "B lymphocyte");
  const t = own.filter((o) => cards[o.id].identity === "T lymphocyte");
  const map = {
    G01: () => unique(own.filter((o) => cards[o.id].identity.startsWith("Staphylococcus "))),
    G02: () => across((o) => cards[o.id].gram === "Negative") === 4,
    G03: () => at("N03") >= 3,
    G04: () => at("N02") >= 3,
    G05: () => controls("N01") && controls("N04"),
    G06: () => unique(own) >= 6,
    G07: () => own.filter(o => cards[o.id].resist.length > 0).length >= 3,
    G08: () => own.some((o) => own.filter((x) => cards[o.id].identity === cards[x.id].identity).length >= 3),
    G09: () => across((o) => cards[o.id].gram === "Positive") >= 3,
    G10: () => countTucks("Immune"),
    G11: () => unique(own.filter((o) => cards[o.id].type === "Antibiotic")) >= 3,
    G12: () => ["Neutrophil", "Macrophage", "Complement"].every((name) => own.some((o) => cards[o.id].identity === name)),
    G13: () => b.some((o) => t.some((x) => o.site !== x.site)),
    G14: () => s.board.filter((site) => majority(site) === f).length >= 3,
    G15: () => s.board.some((site) => siteCards(site, f).filter((o) => cards[o.id].type === "Immune").length >= 4),
    G16: () => unique(own.filter((o) => cards[o.id].type === "Antibiotic" && cards[o.id].route.toLowerCase().includes("oral"))) >= 2,
    G17: () => countTucks("Antibiotic"),
    G18: () => s.board.every((site) => majority(site) !== "Bacteria"),
    G19: () => own.some((o) => o.usedResistanceMatch),
    G20: () => unique(own.filter(o => hasSynergy(o.id, "N05"))) >= 2,
    G21: () => own.some(o => o.site.id === "N08" && hasSynergy(o.id, "N08") &&
      own.some(other => other.site === o.site && cards[other.id].identity !== cards[o.id].identity)),
    G22: () => {
      const matches = new Set(antibioticTucks().map((t) => t?.match));
      return matches.has("OPTIMAL") && matches.has("ACTIVE");
    },
    G23: () => antibioticTucks().some((t) => t?.match === "OPTIMAL" && t.remote),
    G24: () => unique(tuckedBy("Immune").filter((o) => cards[o.id].resist.length > 0)) >= 2,
  };
  return Number(map[id]()) * goals[id].vp;
}
function cardSynergy(o, own) {
  const card = cards[o.id];
  if (card.faction === "Bacteria") return hasSynergy(o.id, o.site.id) ? 2 : 0;
  if (card.type === "Immune") return 2 * own.filter(other =>
    other.id !== o.id && other.site === o.site && cards[other.id].type === "Immune").length;
  return 0;
}
function territoryPoints(s, site, f) {
  return majority(site) === f ? (siteCards(site, f).length === capacity(s) ? 3 : 1) : 0;
}
export function score(s, f) {
  const own = visible(s, f);
  const base = own.reduce((n, o) => n + cards[o.id].base, 0);
  const synergy = own.reduce((n, o) => n + cardSynergy(o, own), 0);
  const tuck = own.reduce((n, o) => n + tuckPoints(o), 0) +
    (f === "Host" ? visible(s, "Bacteria").reduce((n, piece) => n + hiddenAntibioticPoints(piece), 0) : 0);
  const territory = s.board.reduce((n, site) => n + territoryPoints(s, site, f), 0);
  const objective = s.players[f].goals.reduce((n, id) => n + goalScore(s, f, id), 0);
  return { base, synergy, tuck, territory, objective, total: base + synergy + tuck + territory + objective };
}

function liveSitePoints(s) {
  const owners = Object.fromEntries(sides.map(f => [f, visible(s, f)]));
  return Object.fromEntries(s.board.map(site => [site.id, Object.fromEntries(sides.map(f => {
    const own = owners[f];
    const atSite = own.filter(o => o.site === site);
    const cardPoints = atSite.reduce((sum,o) => sum + cards[o.id].base + cardSynergy(o, own) +
      tuckPoints(o), 0);
    const hidden = f === "Host" ? siteCards(site, "Bacteria").reduce((n, piece) => n + hiddenAntibioticPoints(piece), 0) : 0;
    return [f, cardPoints + hidden + territoryPoints(s, site, f)];
  }))]));
}

export function view(s, f) {
  const player = s.players[f], rival = s.players[opposite(f)];
  const pending = s.pending?.f === f ? s.pending : s.pending ? { f: s.pending.f, prompt: "Waiting for the other player’s choice." } : null;
  const bonus = pending?.kind === "bonus" ? pending : null;
  const legal = {};
  if (s.status === "playing" && f === s.turn && (!pending || bonus) && (bonus || s.slots || s.jointPlay)) {
    for (const id of player.hand) {
      const valid = s.board.filter((site) => !playProblem(s, f, id, site, bonus));
      if (!valid.length) continue;
      const type = cardTypeId(id);
      const attack = onPlayAttack(type);
      legal[id] = { sites: valid.map(site => site.id), cost: playCost(s, id, bonus) };
      if (attack || cards[id].type === "Antibiotic") legal[id].tuckSites = valid.filter(site =>
        resistanceTargets(id, site).length || (attack && (tuckTargets(s, id, attack.mode, false, site).length ||
        (attack.onPlayDrug && s.hostBalance && tuckTargets(s, id, attack.mode, true, site).length)))).map(site => site.id);
    }
  }
  return {
    faction:f, status:s.status, first:s.first, turn:s.turn, turnNumber:s.turnNumber,
    extra:s.extra, slots:s.slots, actionRules:!!s.actionRules, hostBalance:!!s.hostBalance, jointPlay:!!s.jointPlay,
    uniqueSiteBoons:!!s.uniqueSiteBoons, focusedDraw:!!s.sitePerks?.focusedDraw, discardDraw:!!s.sitePerks?.discardDraw,
    discount:s.discount, siteCapacity:capacity(s), board:s.board, log:s.log,
    tuckPoints:Object.fromEntries(visible(s, "Host").map(piece => [piece.id, tuckPoints(piece)])),
    sitePoints:liveSitePoints(s), patientHealth:s.patientHealth ?? {band:0, leftCenter:false},
    playedPoints:s.playedPoints ?? [], spentReactions:s.spentReactions ?? {},
    startedAt:s.startedAt ?? null, endedAt:s.endedAt ?? null,
    series:s.series ?? (s.scores ? countSeriesResult(null,s.scores) : {Bacteria:0, Host:0, ties:0}),
    hand:player.hand, recentHand:(player.recentHand ?? []).filter(id => player.hand.includes(id)),
    deckCount:player.deck.length, discard:player.discard, goals:player.goals,
    objectivePoints:Object.fromEntries(player.goals.map(id => [id, goalScore(s, f, id)])),
    opponentHandCount:rival.hand.length, opponentDeckCount:rival.deck.length, opponentDiscard:rival.discard,
    opponentGoals:s.status === "finished" ? rival.goals : null, offer:player.offer,
    pending, legal, canUndo:canUndo(s,f), scores:s.scores, reason:s.reason ?? null,
  };
}
