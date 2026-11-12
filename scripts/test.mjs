import assert from "node:assert/strict";
import data from "../worker/data.json" with { type: "json" };
import { act, newGame, view } from "../worker/game.js";
import { api } from "../worker/api.js";
import { nextPlayer, passPlayView } from "../public/pass-play.js";

const piece = (id) => ({id,tucked:[],guardUsed:false,refugeUsed:0});
const random = () => 0.19;
const db = new Map();
const store = {
  async get(code) { return db.get(code); },
  async create(row) { if (db.has(row.code)) return false; db.set(row.code, row); return true; },
  async update(code, revision, state, guest = null) {
    const r = db.get(code);
    if (r.revision !== revision) return false;
    db.set(code, { ...r, revision: revision + 1, state, guest_hash: guest ?? r.guest_hash, updated:Date.now() });
    return true;
  },
};
const hit = (url, method = "GET", body, token) => api(new Request("https://game.test" + url, {
  method, headers:token ? {Authorization:"Bearer " + token} : {},
  ...(body == null ? {} : {body:JSON.stringify(body)}),
}), store);

const created = await hit("/api/rooms", "POST", {faction:"Host"});
assert.equal(created.status, 201);
const { token: owner, invite, game: lobby } = await created.json();
const room = "/api/rooms/" + lobby.code;
assert.equal(lobby.hand.length, 6);
assert.equal(lobby.deckCount, 66);
assert.equal(lobby.board.length, 4);
assert.ok(lobby.board.every((node) => node.slots.length === 6));
assert.equal((await hit(room)).status, 403);
assert.equal((await hit(room + "/join", "POST", {invite: "0".repeat(48)})).status, 403);
const joins = await Promise.all([
  hit(room + "/join", "POST", {invite}), hit(room + "/join", "POST", {invite}),
]);
assert.deepEqual(joins.map((r) => r.status).sort(), [200,409]);
const {token:guest, game:visitor} = await joins.find((r) => r.ok).json();
assert.equal(visitor.faction, "Bacteria");
assert.equal(visitor.hand.length, 6);
assert.ok(visitor.hand.every((id) => id.startsWith("B")));
assert.ok(!("deck" in visitor) && !("opponentHand" in visitor));
assert.equal(visitor.opponentGoals, null);
assert.deepEqual(visitor.board, lobby.board);

const seats = {Host:owner, Bacteria:guest};
for (const f of ["Host","Bacteria"]) {
  const g = await (await hit(room, "GET", undefined, seats[f])).json();
  const result = await hit(room + "/action", "POST", {revision:g.revision,
    action:{type:"objectives",selected:g.offer.slice(0,2)}}, seats[f]);
  assert.ok(result.ok);
}
let start = await (await hit(room, "GET", undefined, owner)).json();
const current = start.turn;
start = await (await hit(room, "GET", undefined, seats[current])).json();
assert.equal(start.hand.length,6);
assert.equal(start.slots,3);
const [card, legal] = Object.entries(start.legal)[0];
const site = legal.sites[0];
const pay = start.hand.filter((id) => id !== card).slice(0,legal.cost);
const request = {revision:start.revision,action:{type:"play",card,site,slot:0,pay}};
assert.equal((await hit(room + "/action", "POST", request, seats[current === "Host" ? "Bacteria" : "Host"])).status, 400);
assert.equal((await hit(room + "/action", "POST", {...request,action:{...request.action,pay:[card]}}, seats[current])).status, 400);
assert.equal((await hit(room + "/action", "POST", request, seats[current])).status, 200);
assert.equal((await hit(room + "/action", "POST", request, seats[current])).status, 409);
const rival = await (await hit(room, "GET", undefined, seats[current === "Host" ? "Bacteria" : "Host"])).json();
assert.equal(rival.board.find((n) => n.id === site).slots[0].id, card);
assert.equal((await hit(room + "?since=" + rival.revision, "GET", undefined, owner)).status, 204);
assert.ok(Number.isFinite(rival.startedAt));
const row = db.get(lobby.code);
const ended = JSON.parse(row.state);
while (ended.pending) {
  const pending = ended.pending;
  if (pending.kind === "bonus") act(ended,pending.f,{type:"skipBonus"});
  else act(ended,pending.f,{type:"choose",selected:pending.choices.slice(0,pending.min)});
}
assert.equal(view(ended,current).playedPoints[0].id,card);
ended.players[ended.turn].deck = [];
act(ended,ended.turn,{type:"end"});
db.set(lobby.code,{...row,state:JSON.stringify(ended)});
const restart = {revision:row.revision,action:{type:"rematch"}};
const restarts = await Promise.all([hit(room+"/action","POST",restart,owner),hit(room+"/action","POST",restart,guest)]);
assert.deepEqual(restarts.map(r=>r.status).sort(),[200,409]);
const restarted = await (await hit(room,"GET",undefined,guest)).json();
assert.equal(restarted.status,"objectives");
assert.equal(restarted.faction,"Bacteria");
assert.deepEqual(restarted.series,ended.series);
assert.equal(restarted.startedAt,null);

function fixture(siteId, turn, board, hand) {
  const s = newGame(random);
  s.board = data.sites.slice(0,4).map(({id})=>({id,slots:Array(6).fill(null)}));
  s.status = "playing"; s.turn = turn; s.turnNumber = 5; s.slots = 1;
  const node = s.board.find((n) => n.id === siteId);
  node.slots = [...board.map(piece), ...Array(6-board.length).fill(null)];
  s.players[turn].hand = hand;
  return s;
}

const seenSites = new Set(), seenBoards = new Set();
let rngState = 80310;
const siteRandom = () => ((rngState = (Math.imul(rngState,1664525)+1013904223) >>> 0) / 4294967296);
for (let i=0; i<100; i++) {
  const match = newGame(siteRandom);
  const ids = new Set(match.board.map(site=>site.id));
  assert.equal(ids.size,4);
  assert.ok(match.board.every(site=>site.slots.length===6));
  for (const id of ids) seenSites.add(id);
  seenBoards.add([...ids].sort().join(","));
  for (const player of Object.values(match.players)) {
    assert.equal(player.offer.length,3);
    for (const goal of [...player.offer,...player.goalDeck]) {
      assert.ok((data.goals[goal].requiresSites ?? []).every(id=>ids.has(id)));
    }
  }
}
assert.equal(seenSites.size,12);
assert.ok(seenBoards.size>50);

assert.equal(new Set(data.sites.map(site=>site.boon)).size,12);
function boonFixture(id, faction="Bacteria") {
  const s = fixture("N01", faction==="Bacteria" ? "Host" : "Bacteria", [], []);
  const occupants = faction==="Bacteria" ? ["B04","B10","B12"] : ["H04","H10","H13"];
  s.board[0] = {id,slots:[...occupants.map(piece),null,null,null]};
  return s;
}

for (const [own, opponent, getsBoon] of [
  [0,0,false], [1,0,false], [2,0,false], [2,1,false], [2,3,false],
  [3,0,true], [3,1,true], [3,2,true], [3,3,false],
  [4,2,true], [5,1,true], [6,0,true],
]) {
  const bacteria = ["B04","B05","B06","B07","B10","B12"].slice(0,own);
  const host = ["H04","H10","H13"].slice(0,opponent);
  const match = fixture("N02","Host",[...bacteria,...host],[]);
  const deckCount = match.players.Bacteria.deck.length;
  act(match,"Host",{type:"end"});
  assert.equal(match.players.Bacteria.deck.length,deckCount-Number(getsBoon),own+"–"+opponent);
}
const cns = boonFixture("N05");
act(cns,"Host",{type:"end"});
const drawDeck = cns.players.Bacteria.deck.length;
assert.equal(view(cns,"Bacteria").focusedDraw,true);
act(cns,"Bacteria",{type:"drawCard"});
assert.equal(cns.slots,2);
assert.equal(cns.players.Bacteria.deck.length,drawDeck-2);
assert.equal(view(cns,"Bacteria").focusedDraw,false);
act(cns,"Bacteria",{type:"drawCard"});
assert.equal(cns.players.Bacteria.deck.length,drawDeck-3);

const heart = boonFixture("N06");
heart.players.Bacteria.hand = ["B04:2"];
heart.players.Bacteria.discard = ["B05","B06","B07"];
act(heart,"Host",{type:"end"});
assert.equal(heart.pending.kind,"recirculate");
act(heart,"Bacteria",{type:"choose",selected:["B04:2"]});
assert.deepEqual(heart.players.Bacteria.hand,["B06","B07"]);
assert.deepEqual(heart.players.Bacteria.discard,["B05","B04:2"]);

const gut = boonFixture("N07");
gut.players.Bacteria.deck = ["B05","B06","B07"];
act(gut,"Host",{type:"end"});
assert.deepEqual(gut.pending.choices,["B05","B06"]);
assert.throws(()=>act(gut,"Bacteria",{type:"choose",selected:[]}),/required number/);
act(gut,"Bacteria",{type:"choose",selected:["B06"]});
assert.equal(gut.players.Bacteria.hand.at(-1),"B06");
assert.deepEqual(gut.players.Bacteria.discard,["B05"]);

const genital = boonFixture("N08","Host");
genital.players.Host.hand = ["H05","H11","H06","H03","H01","H15"];
genital.players.Host.deck = ["H14","H13","H12","H10","H07"];
act(genital,"Bacteria",{type:"end"});
act(genital,"Host",{type:"play",card:"H05",site:"N08",slot:3,pay:[]});
assert.equal(genital.players.Host.deck.length,3);
act(genital,"Host",{type:"play",card:"H06",site:"N08",slot:4,pay:["H11","H01"]});
assert.equal(genital.players.Host.deck.length,2);
act(genital,"Host",{type:"play",card:"H03",site:"N08",slot:5,pay:["H15","H14"]});
assert.equal(genital.players.Host.deck.length,2);

const skin = boonFixture("N09");
skin.board[1].slots[0] = {...piece("B16"),tucked:[piece("H10")]};
act(skin,"Host",{type:"end"});
assert.deepEqual(skin.pending.choices,["B16"]);
act(skin,"Bacteria",{type:"choose",selected:["B16"]});
assert.equal(skin.board[1].slots[0],null);
assert.equal(skin.board[0].slots[3].tucked[0].id,"H10");

const eye = boonFixture("N10");
eye.players.Bacteria.deck = ["B05","B06","B07"];
act(eye,"Host",{type:"end"});
assert.deepEqual(eye.pending.choices,["B05","B06"]);
assert.equal(view(eye,"Host").pending.choices,undefined);
act(eye,"Bacteria",{type:"choose",selected:["B06"]});
assert.deepEqual(eye.players.Bacteria.deck,["B06","B07","B05"]);

const ear = boonFixture("N11");
ear.players.Bacteria.hand = ["B04:2"];
ear.players.Bacteria.deck = ["B05","B06","B07"];
act(ear,"Host",{type:"end"});
act(ear,"Bacteria",{type:"choose",selected:["B04:2"]});
assert.deepEqual(ear.players.Bacteria.hand,["B05","B06"]);
assert.deepEqual(ear.players.Bacteria.discard,["B04:2"]);

const liver = boonFixture("N12","Host");
liver.players.Host.hand = ["H17","H04:2","H07","H10"];
liver.players.Host.deck = ["H11","H12"];
liver.board[1].slots[0] = piece("B16");
liver.board[1].slots[1] = piece("B18");
act(liver,"Bacteria",{type:"end"});
act(liver,"Host",{type:"play",card:"H17",site:"N02",slot:2,pay:["H04:2","H07","H10"]});
assert.equal(liver.board[1].slots[2].tucked.length,2);
assert.deepEqual(liver.players.Host.hand,["H11"]);

const legacySite = boonFixture("N11");
delete legacySite.uniqueSiteBoons;
const legacyDeck = legacySite.players.Bacteria.deck.length;
act(legacySite,"Host",{type:"end"});
assert.equal(legacySite.players.Bacteria.deck.length,legacyDeck-1);
assert.equal(legacySite.pending,null);

const skinSynergy = fixture("N01","Host",[],[]);
skinSynergy.board[0]={id:"N09",slots:[piece("B16"),piece("H04"),null,null,null,null]};
skinSynergy.players.Host.deck=[];
act(skinSynergy,"Host",{type:"end"});
assert.equal(skinSynergy.scores.Bacteria.synergy,2);
assert.equal(skinSynergy.scores.Host.synergy,2);
const resistance = fixture("N01","Host",["B23"],["H22","H10","H11","H12"]);
act(resistance,"Host",{type:"play",card:"H22",site:"N01",slot:1,pay:["H10","H11","H12"]});
assert.equal(resistance.pending.kind,"resistance");
assert.equal(view(resistance,"Host").pending.kind,undefined);
act(resistance,"Bacteria",{type:"choose",selected:["tuck"]});
assert.equal(resistance.board.find((s) => s.id==="N01").slots[0].tucked[0].id,"H22");
assert.equal(view(resistance,"Host").spentReactions.B23,true);
const reactionDeck = resistance.players.Bacteria.deck.length;
resistance.players.Host.hand = ["H23","H07","H08","H10","H11"];
act(resistance,"Host",{type:"end"});
act(resistance,"Bacteria",{type:"end"});
act(resistance,"Host",{type:"play",card:"H23",site:"N01",slot:1,pay:["H07","H08","H10","H11"]});
assert.equal(resistance.pending,null);
assert.equal(resistance.players.Bacteria.deck.length,reactionDeck);

for (const refresh of [false,true]) {
  const match = fixture("N01","Host",["B03"],["H01","H01:2","H10","H11"]);
  match.slots = 2;
  act(match,"Host",{type:"play",card:"H01",site:"N01",slot:1,pay:["H10"]});
  assert.equal(nextPlayer(match),"Bacteria");
  assert.equal(passPlayView(match,"Host",view),null);
  assert.equal(passPlayView(match,"Bacteria",view).pending.kind,"refuge");
  assert.throws(()=>act(match,"Bacteria",{type:"refuge",destination:"N01"}),/different site/);
  act(match,"Bacteria",{type:"refuge",destination:"N02"});
  assert.equal(nextPlayer(match),"Host");
  assert.equal(match.slots,1);
  assert.equal(match.board.find(s=>s.id==="N02").slots[0].id,"B03");
  if (refresh) {
    act(match,"Host",{type:"end"});
    act(match,"Bacteria",{type:"end"});
  }
  act(match,"Host",{type:"play",card:"H01:2",site:"N02",slot:1,pay:["H11"]});
  if (refresh) assert.equal(match.pending.kind,"refuge");
  else {
    assert.equal(match.pending,null);
    assert.equal(match.board.find(s=>s.id==="N02").slots[1].tucked[0].id,"B03");
  }
}

const lung = fixture("N02","Host",["B12"],["H05"]);
const bacteriaDeck = lung.players.Bacteria.deck.length;
act(lung,"Host",{type:"play",card:"H05",site:"N02",slot:1,pay:[]});
assert.equal(lung.players.Bacteria.deck.length,bacteriaDeck);

const remoteRefuge = fixture("N02","Host",["B12"],["H37","H10","H11"]);
assert.ok(view(remoteRefuge,"Host").legal.H37.tuckSites.includes("N01"));
act(remoteRefuge,"Host",{type:"play",card:"H37",site:"N01",slot:0,pay:["H10","H11"]});
assert.equal(remoteRefuge.pending.kind,"refuge");
assert.equal(remoteRefuge.pending.job.id,"B12");
act(remoteRefuge,"Bacteria",{type:"refuge",destination:"N03"});
assert.equal(remoteRefuge.board.find(s=>s.id==="N03").slots[0].id,"B12");

const objectiveStatus = fixture("N01","Host",["B16"],["H01","H10"]);
objectiveStatus.players.Bacteria.goals = ["G09"];
objectiveStatus.board.find(s=>s.id==="N02").slots[0]=piece("B17");
objectiveStatus.board.find(s=>s.id==="N03").slots[0]=piece("B19");
assert.deepEqual(view(objectiveStatus,"Bacteria").objectivePoints,{G09:9});
assert.deepEqual(view(objectiveStatus,"Host").objectivePoints,{});
act(objectiveStatus,"Host",{type:"play",card:"H01",site:"N01",slot:1,pay:["H10"]});
assert.deepEqual(view(objectiveStatus,"Bacteria").objectivePoints,{G09:0});

const dryTuck = fixture("N01","Host",[],["H01","H10"]);
assert.deepEqual(view(dryTuck,"Host").legal.H01.tuckSites,[]);

for (const [drug, draws] of [["H22",1],["H16",0]]) {
  const match = fixture("N01","Host",["B22"],[drug,"H10","H11","H12"]);
  const deck = match.players.Bacteria.deck.length;
  act(match,"Host",{type:"play",card:drug,site:"N01",slot:1,pay:drug==="H22"?["H10","H11","H12"]:["H10"]});
  assert.equal(match.players.Bacteria.deck.length,deck-draws);
  assert.equal(match.board.find(s=>s.id==="N01").slots[0].id,"B22");
}

for (const visible of [false,true]) {
  const match = fixture("N01","Bacteria",[visible?"H36":"B04"],["B18","B05","B06"]);
  if (!visible) match.board.find(s=>s.id==="N01").slots[0].tucked.push(piece("H36"));
  act(match,"Bacteria",{type:"play",card:"B18",site:"N02",slot:0,pay:["B05","B06"]});
  act(match,"Bacteria",{type:"end"});
  assert.equal(match.turn,visible?"Host":"Bacteria");
  assert.equal(match.extra,!visible);
}

for (const destination of ["N01","N02"]) {
  const match = fixture("N01","Bacteria",["H34"],["B02","B01"]);
  act(match,"Bacteria",{type:"play",card:"B02",site:destination,slot:1,pay:[]});
  assert.equal(match.pending?.kind,destination==="N01"?undefined:"bonus");
}

const limit = fixture("N01","Bacteria",[],[]);
limit.players.Bacteria.hand = Array.from({length:13},(_,i)=>"B"+String(i+1).padStart(2,"0"));
act(limit,"Bacteria",{type:"end"});
assert.equal(limit.pending.kind,"trim");
act(limit,"Bacteria",{type:"choose",selected:["B01"]});
assert.equal(limit.players.Bacteria.hand.length,12);
assert.equal(limit.turn,"Host");
limit.players.Host.deck = [];
act(limit,"Host",{type:"end"});
assert.equal(limit.status,"finished");
assert.ok(Number.isInteger(limit.scores.Host.total));
assert.deepEqual(Object.keys(passPlayView(limit,null,view)),["status","scores","reason","series","startedAt","endedAt"]);
const seriesRematch = act(limit,"Host",{type:"rematch"});
assert.equal(seriesRematch.status,"objectives");
assert.deepEqual(seriesRematch.series,limit.series);
assert.equal(Object.values(seriesRematch.series).reduce((a,b)=>a+b,0),1);
assert.equal(seriesRematch.endedAt,undefined);

const local = newGame(random);
local.status = "objectives";
const firstLocal = nextPlayer(local);
assert.equal(passPlayView(local,null,view),null);
assert.equal(passPlayView(local,firstLocal,view).hand.length,6);
act(local,firstLocal,{type:"objectives",selected:local.players[firstLocal].offer.slice(0,2)});
const secondLocal = nextPlayer(local);
assert.notEqual(secondLocal,firstLocal);
assert.equal(passPlayView(local,firstLocal,view),null);
act(local,secondLocal,{type:"objectives",selected:local.players[secondLocal].offer.slice(0,2)});
assert.equal(nextPlayer(local),firstLocal);
assert.equal(passPlayView(local,secondLocal,view),null);
act(local,firstLocal,{type:"end"});
assert.equal(nextPlayer(local),secondLocal);
assert.equal(passPlayView(local,firstLocal,view),null);

const economy = fixture("N01","Bacteria",[],["B04","B04:2"]);
economy.slots = 3;
economy.players.Bacteria.discard = ["B01","B02"];
const initialDeck = economy.players.Bacteria.deck.length;
act(economy,"Bacteria",{type:"takeDiscard"});
assert.deepEqual(economy.players.Bacteria.discard,["B01"]);
assert.equal(economy.players.Bacteria.hand.at(-1),"B02");
act(economy,"Bacteria",{type:"drawCard"});
assert.equal(economy.players.Bacteria.deck.length,initialDeck-1);
act(economy,"Bacteria",{type:"play",card:"B04:2",site:"N01",slot:0,pay:[]});
assert.equal(economy.board.find((site) => site.id==="N01").slots[0].id,"B04:2");
assert.ok(economy.players.Bacteria.hand.includes("B04"));
assert.throws(() => act(economy,"Bacteria",{type:"drawCard"}),/No action/);
act(economy,"Bacteria",{type:"end"});
assert.equal(economy.turn,"Host");
assert.equal(economy.slots,3);
assert.equal(economy.players.Host.hand.length,6);

const duplicateResistance = fixture("N01","Host",["B23","B23:2"],["H22:2","H10","H11","H12"]);
act(duplicateResistance,"Host",{type:"play",card:"H22:2",site:"N01",slot:2,pay:["H10","H11","H12"]});
assert.equal(duplicateResistance.pending.kind,"resistance");
act(duplicateResistance,"Bacteria",{type:"choose",selected:["draw"]});
assert.equal(duplicateResistance.pending.id,"B23:2");
act(duplicateResistance,"Bacteria",{type:"choose",selected:["tuck"]});
assert.equal(duplicateResistance.board.find((site)=>site.id==="N01").slots[1].tucked[0].id,"H22:2");

for (const hostBalance of [false, true]) {
  const prices = fixture("N01","Host",[],["H02:2","H05","H04"]);
  if (!hostBalance) delete prices.hostBalance;
  assert.equal(view(prices,"Host").legal["H02:2"].cost,hostBalance ? 0 : 1);
  assert.equal(view(prices,"Host").legal.H05.cost,hostBalance ? 0 : 1);
  act(prices,"Host",{type:"play",card:"H05",site:"N01",slot:0,pay:hostBalance ? [] : ["H04"]});
  assert.equal(prices.players.Host.discard.length,hostBalance ? 0 : 1);

  const attack = fixture("N02","Host",["B31:2","B16"],["H16","H04"]);
  if (!hostBalance) delete attack.hostBalance;
  act(attack,"Host",{type:"play",card:"H16",site:"N01",slot:0,pay:["H04"]});
  if (hostBalance) {
    assert.deepEqual(attack.pending.choices,["B31:2"]);
    act(attack,"Host",{type:"choose",selected:["B31:2"]});
  } else assert.equal(attack.pending,null);
  assert.equal(attack.board.find(n=>n.id==="N02").slots[1].id,"B16");
  assert.equal(attack.board.find(n=>n.id==="N01").slots[0].tucked.length,hostBalance ? 1 : 0);
}

for (const selection of ["local","B31"]) {
  const attack = fixture("N01","Host",["B16","B18"],["H17","H04","H07","H10"]);
  const remote = attack.board.find(n=>n.id==="N02");
  remote.slots[0]=piece("B31");
  remote.slots[1]=piece("B03");
  act(attack,"Host",{type:"play",card:"H17",site:"N01",slot:2,pay:["H04","H07","H10"]});
  assert.deepEqual(attack.pending.choices,["local","B31"]);
  act(attack,"Host",{type:"choose",selected:[selection]});
  if (selection==="B31") {
    assert.equal(attack.pending,null);
    assert.equal(remote.slots[0],null);
    assert.equal(remote.slots[1].id,"B03");
  }
  assert.equal(attack.board.find(n=>n.id==="N01").slots[2].tucked.length,selection==="local" ? 2 : 1);
}

const displacement = fixture("N01","Bacteria",["H01","H02","H03","H04","H05","H06"],["B16","B04"]);
assert.ok(view(displacement,"Bacteria").legal.B16.sites.includes("N01"));
assert.ok(!view(displacement,"Bacteria").legal.B04.sites.includes("N01"));
assert.throws(()=>act(displacement,"Bacteria",{type:"play",card:"B16",site:"N01",slot:0,pay:[]}),/tuck space/);
act(displacement,"Bacteria",{type:"play",card:"B16",site:"N01",slot:6,pay:[]});
assert.equal(displacement.pending.min,1);
assert.throws(()=>act(displacement,"Bacteria",{type:"choose",selected:[]}),/required number/);
act(displacement,"Bacteria",{type:"choose",selected:["H01"]});
const displaced = displacement.board.find(s=>s.id==="N01");
assert.equal(displaced.slots.length,6);
assert.equal(displaced.slots[0].id,"B16");
assert.equal(displaced.slots[0].tucked[0].id,"H01");

const fullRefuge = fixture("N01","Host",["B12","H02","H03","H04","H05","H06"],["H37","H10","H11"]);
act(fullRefuge,"Host",{type:"play",card:"H37",site:"N01",slot:6,pay:["H10","H11"]});
assert.equal(fullRefuge.pending.kind,"refuge");
act(fullRefuge,"Bacteria",{type:"refuge",destination:"N02"});
assert.equal(fullRefuge.board.find(s=>s.id==="N01").slots.length,6);
assert.equal(fullRefuge.board.find(s=>s.id==="N01").slots[0].id,"H37");
assert.equal(fullRefuge.board.find(s=>s.id==="N02").slots[0].id,"B12");

const noDistantDisplacement = fixture("N01","Host",["H01","H02","H03","H04","H05","H06"],["H37","H10","H11"]);
noDistantDisplacement.board.find(s=>s.id==="N02").slots[0]=piece("B12");
assert.ok(!view(noDistantDisplacement,"Host").legal.H37.sites.includes("N01"));

for (let i = 0; i < 20; i++) {
  const match = newGame();
  match.status = "objectives";
  for (const f of ["Host", "Bacteria"]) act(match, f, {type:"objectives",selected:match.players[f].offer.slice(0,2)});
  let steps = 0;
  while (match.status !== "finished" && steps++ < 500) {
    const pending = match.pending, f = pending?.f ?? match.turn, state = view(match, f);
    if (pending?.kind === "refuge") {
      act(match, f, steps % 2 ? {type:"refuge"} : {
        type:"refuge",destination:pending.destinations[0],
      });
    } else if (pending && pending.kind !== "bonus") {
      act(match, f, {type:"choose",selected:pending.choices.slice(0, pending.max)});
    } else {
      const order = Object.entries(state.legal).sort(([,a],[,b]) => a.cost-b.cost);
      if (!order.length) act(match, f, {type:pending ? "skipBonus" :
        state.slots && state.deckCount ? "drawCard" : "end"});
      else {
        const [card, legal] = order[steps % Math.min(order.length, 3)];
        const site = legal.sites[steps % legal.sites.length];
        const open = state.board.find((n) => n.id === site).slots.indexOf(null);
        const slot = open < 0 ? 6 : open;
        act(match, f, {type:"play",card,site,slot,pay:state.hand.filter((k) => k !== card).slice(0,legal.cost)});
      }
    }
  }
  assert.equal(match.status, "finished");
  const physical = [];
  const collect = (o) => { physical.push(o.id); o.tucked.forEach(collect); };
  for (const node of match.board) node.slots.filter(Boolean).forEach(collect);
  for (const player of Object.values(match.players)) physical.push(...player.deck,...player.hand,...player.discard);
  assert.equal(physical.length, 144);
  assert.equal(new Set(physical).size, 144);
}

console.log("Verified two private seats, invite race, illegal payment, stale writes, resistance, Refuge, Suppress and final scoring.");
console.log("Verified three actions, top-discard recovery, separate copy abilities and 144 cards across 20 complete games.");
console.log("Verified Pass & Play privacy for objective selection, turn changes, reactions and final scoring.");
