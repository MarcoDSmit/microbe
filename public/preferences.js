const key = "microbe-wars.preferences";
const root = document.documentElement;
const night = document.querySelector("#night-mode");
const size = document.querySelector("#text-size");
const value = document.querySelector("#text-value");

function load() {
  try { return JSON.parse(localStorage.getItem(key)) ?? {}; }
  catch { return {}; }
}

function apply(preferences) {
  const dark = preferences.dark ?? matchMedia("(prefers-color-scheme: dark)").matches;
  const scale = Math.max(90, Math.min(150, Number(preferences.size) || 100));
  root.dataset.theme = dark ? "dark" : "light";
  root.style.fontSize = (15 * scale / 100) + "px";
  if (night) night.checked = dark;
  if (size) size.value = scale;
  if (value) value.textContent = scale + "%";
}

function update() {
  const preferences = { dark: night.checked, size: Number(size.value) };
  apply(preferences);
  try { localStorage.setItem(key, JSON.stringify(preferences)); } catch {}
}

apply(load());
night?.addEventListener("change", update);
size?.addEventListener("input", update);
window.addEventListener("storage", event => { if (event.key === key) apply(load()); });
