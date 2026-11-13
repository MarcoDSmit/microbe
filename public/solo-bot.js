// The bot receives the same faction view as a human player.
export function chooseBotMove(game, data) {
  const card = id => data.cards[id.split(":")[0]];
  const value = id => {
    const c = card(id);
    return c.base * .6 - c.cost * .8 + (c.ability ? 1.7 : 0);
  };
  if (game.status === "objectives") {
    return {type:"objectives", selected:game.offer.slice(0, 2)};
  }
  const pending = game.pending;
  if (pending?.kind === "refuge") {
    const destination = pending.destinations.map(id => game.board.find(site => site.id === id))
      .sort((a,b) => a.slots.filter(Boolean).length - b.slots.filter(Boolean).length)[0];
    return {type:"refuge", destination:destination.id, ...(pending.self ? {} : {protector:pending.choices[0]})};
  }
  if (pending && pending.kind !== "bonus") {
    let choices = [...pending.choices];
    if (pending.kind === "resistance") choices = ["tuck"];
    if (pending.kind === "attack") {
      const targetValue = id => id === "local" ? pending.localSweep.reduce((sum,target) => sum + targetValue(target),0) :
        3 + card(id).base + (game.board.flatMap(site => site.slots).find(piece => piece?.id === id)?.tucked.length ?? 0) * 2;
      choices.sort((a,b) => targetValue(b) - targetValue(a));
    }
    if (["trim","tradeDraw","recirculate"].includes(pending.kind)) choices.sort((a,b) => value(a) - value(b));
    if (["filter","survey","retrieve"].includes(pending.kind)) choices.sort((a,b) => value(b) - value(a));
    if (pending.kind === "relocate") choices = [];
    return {type:"choose", selected:choices.slice(0,pending.max)};
  }

  let best, bestScore = -Infinity;
  for (const [id, legal] of Object.entries(game.legal)) {
    const c = card(id);
    for (const site of game.board) {
      if (!legal.sites.includes(site.id)) continue;
      const allies = site.slots.filter(piece => piece && card(piece.id).faction === game.faction).length;
      const rivals = site.slots.filter(Boolean).length - allies;
      const rules = data.sites.find(entry => entry.id === site.id);
      const tag = game.faction === "Host" ? rules.hostTag : rules.bacteriaTag;
      const tuck = legal.tuckSites?.includes(site.id);
      const score = value(id) - legal.cost * .6 + (tuck ? 5 : legal.tuckSites ? -2 : 0) +
        (allies <= rivals && allies + 1 >= rivals ? 1.5 : 0) + (allies === 2 ? 1 : 0) +
        (c.tags.includes(tag) ? 1.8 : 0) +
        (rules.namedSite && c.synergy.toLowerCase().includes(rules.namedSite) ? 1.5 : 0) +
        (c.id === "B18" && !game.extra ? 2 : 0);
      if (score <= bestScore) continue;
      const slot = site.slots.indexOf(null);
      bestScore = score;
      best = {type:"play", card:id, site:site.id, slot:slot < 0 ? 6 : slot,
        pay:game.hand.filter(other => other !== id).sort((a,b) => value(a)-value(b)).slice(0,legal.cost)};
    }
  }
  if (pending) return best ?? {type:"skipBonus"};
  if (game.actionRules && game.slots > 0 && game.hand.length < 10) {
    const top = game.discard.at(-1);
    const drawScore = game.hand.length <= 2 ? 5 : game.hand.length <= 4 ? 3 : 1;
    const recoverScore = top ? drawScore + value(top) - 3 : -Infinity;
    const deckScore = game.deckCount ? drawScore + (game.focusedDraw ? 3 : 0) : -Infinity;
    if (Math.max(recoverScore,deckScore) > bestScore) {
      return {type:recoverScore > deckScore ? "takeDiscard" : "drawCard"};
    }
  }
  return best ?? {type:"end"};
}
