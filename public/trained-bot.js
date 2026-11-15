import { chooseBotMove } from "./solo-bot.js";

// Outcome-trained checkpoint from the offline comparison at seed 49861.
const weights = {
  Bacteria: [1.1949950591765877,0.9760010366787593,1.9713329284865688,0.8196871073563063,5.249698636086261,-1.7370392746062693,0.7406796801507198,1.608270950660336,2.1699307944562456,1.3851813366837058,1.5565182196874985,1.4720463381505249,1.3778517290186976,1.283346208369641,1.2597083203041881,0.8487404242120038,-0.025558153206393708],
  Host: [1.1738295185029934,0.9181042188286466,1.3937569195516644,0.7464050599152338,5.377956674579968,-2.102201645529749,0.9144228301753394,1.0621719318758776,2.232850467528208,1.9739436321799044,2.406673523738984,0.712622703856536,1.2879817959731994,0.4978017446050816,0.8741335131707482,1.5627771707926676,-0.5467957078383598],
};

export function candidates(game, data) {
  const card = id => data.cards[id.split(":")[0]];
  const value = id => card(id).base * .6 - card(id).cost * .8 + (card(id).ability ? 1.7 : 0);
  const siteRules = Object.fromEntries(data.sites.map(site => [site.id, site]));
  const moves = [];
  const add = (action, terms) => {
    const features = Array(weights.Host.length).fill(0);
    for (const [i, v] of terms) features[i] = v;
    moves.push({action, features});
  };
  const sites = game.board.map(site => {
    const allies = site.slots.filter(piece => piece && card(piece.id).faction === game.faction).length;
    return {site, allies, rivals:site.slots.filter(Boolean).length - allies, rules:siteRules[site.id]};
  });
  const payOrder = [...game.hand].sort((a,b) => value(a) - value(b));
  for (const [id, legal] of Object.entries(game.legal)) {
    const c = card(id);
    for (const {site, allies, rivals, rules} of sites) {
      if (!legal.sites.includes(site.id)) continue;
      const slot = site.slots.indexOf(null);
      const tag = game.faction === "Host" ? rules.hostTag : rules.bacteriaTag;
      add({type:"play", card:id, site:site.id, slot:slot < 0 ? 6 : slot,
        pay:payOrder.filter(other => other !== id).slice(0,legal.cost)}, [
        [0,c.base], [1,-c.cost], [2,+!!c.ability], [3,-legal.cost],
        [4,+!!legal.tuckSites?.includes(site.id)], [5,+(!!legal.tuckSites && !legal.tuckSites.includes(site.id))],
        [6,+(allies <= rivals && allies + 1 >= rivals)], [7,+(allies === 2)],
        [8,+c.tags.includes(tag)], [9,+!!(rules.namedSite && c.synergy.toLowerCase().includes(rules.namedSite))],
        [10,+(c.id === "B18" && !game.extra)]
      ]);
    }
  }
  if (game.actionRules && game.slots > 0) {
    const n = game.hand.length;
    const draw = n <= 2 ? 5 : n <= 4 ? 3 : n < 10 ? 1 : -10;
    const top = game.discard.at(-1);
    if (game.deckCount) add({type:"drawCard"}, [[11,draw],[12,game.focusedDraw ? 3 : 0],[15,1]]);
    if (top) add({type:"takeDiscard"}, [[11,draw],[13,value(top)-3],[14,1]]);
  }
  if (!moves.length || !moves.some(move => move.action.type === "play")) add({type:"end"}, [[16,1]]);
  return moves;
}
export function choose(moves, weights) {
  let best = moves[0], maximum = -Infinity;
  for (const move of moves) {
    const score = move.features.reduce((sum, v, i) => sum + v * weights[i], 0);
    if (score > maximum) { maximum = score; best = move; }
  }
  return best.action;
}

export function chooseHardMove(game, data) {
  if (game.status === "playing" && !game.pending && game.slots > 0) {
    return choose(candidates(game, data), weights[game.faction]);
  }
  return chooseBotMove(game, data);
}
