import data from "./library-data.js";
import { tuckScoreLabel } from "./card-display.js";
import { libraryStorageKey, readPlayedCards } from "./library-session.js";
import retiredCards from "./retired-cards.js";

const entries = [
  ...Object.values(data.cards).filter(card => card.copies !== 0).sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric:true}))
    .map((card,index) => ({ ...card, group: card.faction, number:index+1 })),
  ...data.sites.map(site => ({ ...site, group: "Site" })),
  ...Object.values(data.goals).map(goal => ({ ...goal, group: "Objective" })),
];
const defaultAtlas = "http://127.0.0.1:5180/pathogen-universe/";
const atlasAddress = document.querySelector("#atlas-address");
const search = document.querySelector("#search");
const group = document.querySelector("#group");
const cards = document.querySelector("#cards");
const reserve = Object.values(data.cards).filter(card => card.copies === 0).map(card => ({...card, group:card.faction}));
const retiredList = document.querySelector("#retired-cards");
const status = document.querySelector("#atlas-status");
const inspector = document.querySelector("#card-inspector");
const inspectedCard = document.querySelector("#inspected-card");
const playedKey = libraryStorageKey(location.hash.slice(1));
let played = readPlayedCards(playedKey);
let inspected = null;

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
  const available = entries.filter(card => group.value ? card.group === group.value : card.number);
  const matchesSearch = card => {
    const searchable = [card.name, card.id, card.identity, card.type, card.faction,
      card.abilityName, card.ability, card.synergy, card.tags?.join(" "), card.power,
      card.bacteriaSynergy, card.hostSynergy, card.text].join(" ").toLowerCase();
    return words.every(word => searchable.includes(word) || word === String(card.number));
  };
  const matches = available.filter(matchesSearch);
  document.querySelector("#count").textContent = matches.length
    ? `${matches.length} of ${available.length} cards`
    : "No cards match your search.";
  const groups = new Map();
  for (const card of matches) {
    const key = card.identity ? card.group + ":" + card.identity : card.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  cards.replaceChildren(...[...groups.values()].map(variants => {
    if (variants.length === 1) return cardFace(variants[0], true);
    const cluster = document.createElement("div");
    cluster.className = "library-variants";
    cluster.setAttribute("role", "group");
    cluster.setAttribute("aria-label", variants[0].identity + " variants");
    cluster.append(...variants.map(card => cardFace(card, true)));
    return cluster;
  }));
  const reserves = reserve.filter(card => (!group.value || group.value === card.group) && matchesSearch(card));
  document.querySelector("#reserve-section").hidden = !reserves.length;
  document.querySelector("#reserve-cards").replaceChildren(...reserves.map(card => cardFace(card, true)));
  const retired = retiredCards.filter(card =>
    (!group.value || group.value === card.group) && matchesSearch(card));
  retiredList.replaceChildren(...retired.map(card => cardFace(card, true)));
  document.querySelector("#retired-empty").hidden = retired.length > 0;
}

function cardFace(card, expandable) {
    const article = document.createElement("article");
    article.className = "panel library-card";
    if (expandable && card.number && !played.has(card.id)) article.classList.add("unplayed");
    appendText(article, "small", [card.number && String(card.number).padStart(2,"0"), card.id, card.group, card.type,
      card.group === "Objective" ? card.faction : ""].filter(Boolean).join(" · "));
    const title = document.createElement("h2");
    article.append(title);
    if (expandable) {
      const button = appendText(title, "button", card.name);
      button.type = "button";
      button.className = "library-inspect";
      button.setAttribute("aria-haspopup", "dialog");
      article.addEventListener("click", event => {
        if (event.target.closest("a")) return;
        inspected = card;
        inspectedCard.replaceChildren(cardFace(card, false));
        inspector.showModal();
      });
    } else title.textContent = card.name;
    appendText(article, "p", card.identity !== card.name ? card.identity : "");
    if (card.cost != null) {
      if (card.number) appendText(article, "span", played.has(card.id) ? "Played this session" : "Unplayed this session").className = "library-played";
      appendText(article, "small", `Cost ${card.cost} · ${card.base} base VP${tuckScoreLabel(card)}`);
      if (card.copies === 0) appendText(article, "p", "Reserve · Outside the draw deck");
      appendText(article, "p", [card.gram && card.gram !== "N/A" && "Gram-" + card.gram.toLowerCase(),
        card.route !== "N/A" && card.route, ...card.tags.map(tag => tag.replaceAll("_", " "))].filter(Boolean).join(" · "));
      appendText(article, "small", card.timing?.replaceAll("_", " ").toLowerCase());
      const strips = card.group === "Bacteria"
        ? [["Optimal",card.optimal],["Active",card.active],["Resistance",card.resist]]
        : [["Antibiotic symbol",card.mark ? [card.mark] : []]];
      for (const [label,symbols] of strips) {
        if (!symbols?.length) continue;
        const row = appendText(article, "div", label);
        row.className = "library-spectrum";
        for (const symbol of symbols) {
          const icon = document.createElement("img");
          icon.src = "/icons/" + symbol.toLowerCase() + ".svg";
          icon.alt = symbol;
          row.append(icon);
        }
      }
    }
    if (card.vp != null) appendText(article, "small", `${card.vp} VP${card.per ? " per qualifying item" : ""}`);
    appendText(article, "strong", card.abilityName);
    for (const line of [card.ability, card.synergy, card.power, card.bacteriaSynergy, card.hostSynergy, card.text]) appendText(article, "p", line);
    if (card.replacementId) {
      appendText(article, "p", "Replaced by " + card.replacementId + " · " + card.replacement);
      appendText(article, "p", card.reason);
    }
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
}

document.querySelector("#close-inspector").addEventListener("click", () => inspector.close());
inspector.addEventListener("click", event => { if (event.target === inspector) inspector.close(); });
window.addEventListener("scroll", () => { if (inspector.open) inspector.close(); }, {passive:true});
for (const eventName of ["wheel","touchmove"]) {
  inspector.addEventListener(eventName, event => {
    if (event.target === inspector || inspector.scrollHeight <= inspector.clientHeight) inspector.close();
  }, {passive:true});
}
window.addEventListener("storage", event => {
  if (event.key !== playedKey) return;
  played = readPlayedCards(playedKey);
  render();
  if (inspector.open) inspectedCard.replaceChildren(cardFace(inspected, false));
});

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
