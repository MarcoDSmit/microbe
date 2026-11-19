export const cardArtUrl = id => "/card-art/" + id.split(":")[0] + ".webp";

export function tuckScoreLabel(card) {
  const canTuck = !!card.effects?.attack || ["Ambush", "Inducible Response"].includes(card.abilityName);
  return card.tuck > 0 || canTuck ? " · " + card.tuck + " VP per tuck" : "";
}

export const matchGlyphs = {
  CIRCLE: ["♥", "#A61B29"], HEXAGON: ["≋", "#08685F"], SQUARE: ["■", "#0055B8"],
  DIAMOND: ["◆", "#965800"], TRIANGLE: ["▲", "#A84600"], MOON: ["☾", "#00723E"],
  STAR: ["★", "#806200"], PENTAGON: ["⬟", "#34611F"], PLUS: ["✚", "#006383"],
  BOLT: ["↯", "#96236D"], DONUT: ["◎", "#814737"], DROP: ["♠", "#303B46"],
  INFINITY: ["∞", "#62564A"], CHEVRON: ["❯", "#D02F5B"],
};
