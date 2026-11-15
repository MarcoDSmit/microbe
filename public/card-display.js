export function tuckScoreLabel(card) {
  const canTuck = ["Ambush", "Inducible Response"].includes(card.abilityName);
  return card.tuck > 0 || canTuck ? " · " + card.tuck + " VP per tuck" : "";
}
