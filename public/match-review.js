// Deterministic post-match observations, not an optimal-move or clinical assessment.
export const scoreCategories = [
  ['base', 'Base', 'Printed VP on cards still visible on the board.'],
  ['synergy', 'Synergy', 'Bacteria: +2 VP at a listed site. Host: each visible Immune card earns +2 VP per other allied Immune card at its site. Antibiotics earn no synergy VP.'],
  ['tuck', 'Tucked', 'Points from held captures and antibiotic match bonuses. Captures that no longer qualify at scoring do not count.'],
  ['territory', 'Site control', 'A strict majority with at least two allied cards earns 1 VP. Filling the site with your cards earns 3 VP instead. Ties earn none.'],
  ['objective', 'Objectives', 'Points from your secret objectives, evaluated against their conditions at the end.'],
];

export function matchReview(state, data) {
  if (state.status !== 'finished' || !state.scores || !Array.isArray(state.board)) return null;
  const card = id => data.cards[id?.split(':')[0]];
  const active = new Set(state.board.map(site => site.id));
  const visible = state.board.flatMap(site => site.slots.filter(Boolean).map(piece => ({...piece, site:site.id})));
  const controls = Object.fromEntries(['Bacteria','Host'].map(f => [f, state.board.filter(site => {
    const allies = site.slots.filter(p => p && card(p.id)?.faction === f).length;
    const rivals = site.slots.filter(p => p && card(p.id)?.faction !== f).length;
    return allies >= 2 && allies > rivals;
  }).length]));
  const result = {};
  for (const faction of ['Bacteria','Host']) {
    const own = visible.filter(p => card(p.id)?.faction === faction);
    const points = state.scores[faction];
    const comments = [];
    if (faction === 'Bacteria') {
      const plays = (state.playedPoints ?? []).filter(p => p.faction === faction &&
        card(p.id)?.siteSynergies?.some(bonus => active.has(bonus.site)));
      const matches = plays.filter(p => card(p.id).siteSynergies.some(bonus => bonus.site === p.site)).length;
      if (plays.length) {
        comments.push(`${matches} of ${plays.length} recorded Bacteria deployments with a matching site in this match used a listed synergy site. ` +
          (matches / plays.length >= .75 ? 'Good use of site bonuses. Keep weighing them against tucks and site control.' :
            'Look for those sites when space and cost allow: each qualifying visible bacterium earns +2 VP.'));
      } else {
        const matched = own.filter(p => card(p.id).siteSynergies?.some(bonus => bonus.site === p.site)).length;
        comments.push(`At the finish, ${matched} of your ${own.length} visible Bacteria cards earned a listed site bonus. ` +
          'This is a final-board snapshot; it does not show whether earlier well-placed cards were captured.');
      }
    } else {
      const immune = own.filter(p => card(p.id).type === 'Immune');
      const isolated = immune.filter(p => immune.filter(other => other.site === p.site).length === 1).length;
      comments.push(immune.length ?
        `At the finish, ${isolated} of your ${immune.length} visible Immune cards stood alone. ` +
          (isolated ? 'Grouping Immune cards can help: two together score 4 synergy VP total; three score 12. Spread them when site control matters more.' :
            'Your Immune cards were grouped to earn synergy. Protect those groups while contesting other sites.') :
        'You had no visible Immune cards at the finish. Host synergy needs grouped Immune cards; antibiotics score their captures under Tucked instead.');
      if (!points.tuck) comments.push('No tucked VP remained for Host at scoring. Check O/A/R matches and eligible targets, and try to protect valuable captors. Earlier captures may have been lost.');
    }
    comments.push(controls[faction] ?
      `You finished with a majority at ${controls[faction]} of ${state.board.length} sites, earning ${points.territory} site-control VP. Keep weighing those majorities and their boons against other scoring opportunities.` :
      'You finished without a site majority. Look for a site where you can have at least two cards and outnumber your opponent: control can earn both a start-of-turn boon and final points.');
    comments.push(points.objective ? `Your secret objectives contributed ${points.objective} VP. Keep checking their conditions as the board changes.` :
      'Your secret objectives scored no VP. Revisit them during play; a useful final move may be one that completes or preserves a goal.');
    result[faction] = {comments, controlledSites:controls[faction]};
  }
  return result;
}
