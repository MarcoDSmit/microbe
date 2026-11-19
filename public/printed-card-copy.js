export function printedCardCopy(card) {
  const response = card.resist?.length ? "R here: Tuck the antibiotic, then draw 1." : "";
  return {
    ability:[card.ability,response].filter(Boolean).join("\n"),
    synergy:card.synergy ?? "",
  };
}
