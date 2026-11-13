import data from "./library-data.js";

const entries = [
  ...Object.values(data.cards).map(card => ({ ...card, group: card.faction })),
  ...data.sites.map(site => ({ ...site, group: "Site" })),
  ...Object.values(data.goals).map(goal => ({ ...goal, group: "Objective" })),
];
const defaultAtlas = "http://127.0.0.1:5180/pathogen-universe/";
const atlasAddress = document.querySelector("#atlas-address");
const search = document.querySelector("#search");
const group = document.querySelector("#group");
const cards = document.querySelector("#cards");
const status = document.querySelector("#atlas-status");

function parseAtlas(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Enter an HTTP or HTTPS atlas address.");
  }
  url.searchParams.delete("organism");
  url.searchParams.delete("search");
  return url;
}

let atlas = parseAtlas(defaultAtlas);
try {
  atlas = parseAtlas(localStorage.getItem("microbe-wars-atlas") || defaultAtlas);
} catch {
  // An unavailable or invalid saved address falls back to the local atlas.
}
atlasAddress.value = atlas.href;

function appendText(parent, tag, text) {
  if (!text) return;
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

function render() {
  document.querySelector("#atlas").href = atlas.href;
  const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = entries.filter(card => {
    const searchable = [card.name, card.id, card.identity, card.type, card.faction,
      card.abilityName, card.ability, card.synergy, card.tags?.join(" "), card.power,
      card.bacteriaSynergy, card.hostSynergy, card.text].join(" ").toLowerCase();
    return (!group.value || card.group === group.value) && words.every(word => searchable.includes(word));
  });
  document.querySelector("#count").textContent = matches.length
    ? `${matches.length} of ${entries.length} cards`
    : "No cards match your search.";
  cards.replaceChildren(...matches.map(card => {
    const article = document.createElement("article");
    article.className = "panel library-card";
    appendText(article, "small", [card.id, card.group, card.type, card.group === "Objective" ? card.faction : ""].filter(Boolean).join(" · "));
    appendText(article, "h2", card.name);
    appendText(article, "p", card.identity !== card.name ? card.identity : "");
    if (card.cost != null) appendText(article, "small", `Cost ${card.cost} · Base ${card.base} · Tuck ${card.tuck}`);
    if (card.vp != null) appendText(article, "small", `${card.vp} VP${card.per ? " per qualifying item" : ""}`);
    appendText(article, "strong", card.abilityName);
    for (const line of [card.ability, card.synergy, card.power, card.bacteriaSynergy, card.hostSynergy, card.text]) appendText(article, "p", line);
    if (card.group === "Bacteria") {
      const url = new URL(atlas);
      const related = { "Legionella spp.": "Legionella", "Enterobacter cloacae complex": "Enterobacter cloacae" }[card.identity];
      url.searchParams.set(related ? "search" : "organism", related || card.identity.toLowerCase().replaceAll(" ", "-"));
      const link = appendText(article, "a", related ? "Find related atlas entries" : "Open organism in Pathogen Universe");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener";
    }
    return article;
  }));
}

search.addEventListener("input", render);
group.addEventListener("change", render);
document.querySelector("#atlas-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    atlas = parseAtlas(atlasAddress.value);
  } catch (error) {
    status.textContent = error.message;
    return;
  }
  try {
    localStorage.setItem("microbe-wars-atlas", atlas.href);
    status.textContent = "Atlas address saved.";
  } catch {
    status.textContent = "Atlas address set for this visit.";
  }
  atlasAddress.value = atlas.href;
  render();
});
render();
