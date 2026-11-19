export const firstGameSteps = [
  { type:"objectives", hint:"Choose any two of these three Bacteria objectives. They’re secret in a regular match." },
  { type:"play", card:"B02", site:"N09", pay:[],
    hint:"This is your hand. The four sites change each game. Drag Staphylococcus epidermidis from your hand to an open space at Skin & Soft Tissue. Tap a card to enlarge it, then tap it again to return it to your hand. It costs 0 cards and uses one action." },
  { type:"play", card:"B32", site:"N06", pay:["B40","B25"],
    hint:"Staphylococcus epidermidis grants a bonus play at the usual discard cost. Drag MRSA to Heart for its synergy. Then tap Serratia and Klebsiella, in that order, to pay." },
  { type:"drawCard",
    hint:"Check the O, A and R strips on the cards. Different bacteria match different antibiotics. Now spend an action to draw from your deck." },
  { type:"takeDiscard",
    hint:"Carbapenem-resistant Pseudomonas aeruginosa arrived on the left. Its black frame marks it as Legendary. Some Legendary cards can score more than 8 VP. Now take the top card of your discard." },
  { type:"end",
    hint:"Klebsiella is back at the left of your hand. You’ve tried all three actions. End your turn and take over as Host." },
  { type:"play", card:"H19", site:"N06", pay:["H01","H04","H07","H10"],
    hint:"This is the Host hand. Drag Vancomycin IV standard to an open space at Heart, then tap Neutrophil, Macrophage, Complement and B lymphocyte to pay. The square in MRSA’s O column lets vancomycin tuck it." },
];

const seed = 1879;

export function createFirstGame(newGame, data) {
  let randomState = seed;
  const match = newGame(() => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  });
  const siteIds = ["N09","N06","N02","N01"];
  match.board = siteIds.map(id => ({id, slots:Array(match.siteCapacity).fill(null)}));
  match.status = "objectives";
  match.first = match.turn = "Bacteria";
  for (const [faction, hand, firstDraw, offer] of [
    ["Bacteria",["B02","B32","B40","B25","B04","B16"],"B36",["G01","G06","G09"]],
    ["Host",["H19","H01","H04","H07","H10","H22"],null,["G10","G11","G12"]],
  ]) {
    const player = match.players[faction];
    const used = new Set([...hand, firstDraw]);
    player.deck = [...(firstDraw ? [firstDraw] : []), ...[...player.hand, ...player.deck].filter(id => !used.has(id))];
    player.hand = hand;
    player.offer = offer;
    const carried = [...player.goalDeck].filter(id => !offer.includes(id));
    player.goalDeck = [...new Set([...carried, ...Object.keys(data.goals)])].filter(id => {
      const goal = data.goals[id];
      return goal.faction === faction && !offer.includes(id) && (goal.requiresSites ?? []).every(site => siteIds.includes(site));
    });
  }
  match.log = ["My first game uses fixed starting hands and site order."];
  return match;
}

export function firstGameAllows(step, action) {
  if (!step || step.type !== action.type) return false;
  if (step.type !== "play") return true;
  return step.card === action.card && step.site === action.site &&
    step.pay.length === action.pay.length && step.pay.every(id => action.pay.includes(id));
}
