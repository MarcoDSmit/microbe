const musicToggle = document.querySelector("#menu-music");
const effectsToggle = document.querySelector("#sound-effects");

function track(name, volume) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = volume;
  audio.src = `/audio/${name}.mp3`;
  return audio;
}

const music = track("menu-loop", 0.25);
const click = track("button-click", 0.35);
const faction = track("choose-faction", 0.65);
const start = track("game-start", 0.55);
music.loop = true;

let screen;
let activated = false;
let factionPromptPlayed = false;

function restoreToggle(toggle) {
  const key = `microbe-wars.audio.${toggle.id}`;
  try { toggle.checked = localStorage.getItem(key) !== "off"; } catch {}
  toggle.addEventListener("change", () => {
    try { localStorage.setItem(key, toggle.checked ? "on" : "off"); } catch {}
  });
}

restoreToggle(musicToggle);
restoreToggle(effectsToggle);

function syncMusic() {
  if (screen === "lobby" && activated && musicToggle.checked && !document.hidden) {
    if (music.paused) music.play().catch(() => {});
  } else {
    music.pause();
  }
}

function cue(audio) {
  if (!activated || !effectsToggle.checked || document.hidden) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function updateGameAudio(nextScreen) {
  if (screen === nextScreen) return;
  const startsMatch = screen === "objectives" && nextScreen === "playing";
  screen = nextScreen;
  if (screen !== "lobby") {
    factionPromptPlayed = false;
    faction.pause();
  }
  syncMusic();
  if (startsMatch) cue(start);
}

document.addEventListener("click", event => {
  if (!event.isTrusted) return;
  activated = true;
  syncMusic();
  if (event.target.closest("button:enabled, summary")) cue(click);
  if (event.target.closest("#faction")) promptForFaction();
}, true);

function promptForFaction() {
  if (screen !== "lobby" || factionPromptPlayed || !effectsToggle.checked) return;
  factionPromptPlayed = true;
  cue(faction);
}

document.addEventListener("keydown", event => {
  if (!event.isTrusted || event.repeat) return;
  activated = true;
  syncMusic();
  if (event.target.id === "faction" && ["Enter", " ", "ArrowUp", "ArrowDown"].includes(event.key)) promptForFaction();
}, true);

musicToggle.addEventListener("change", syncMusic);
function stopCues() {
  for (const audio of [click, faction, start]) audio.pause();
}
effectsToggle.addEventListener("change", () => {
  if (!effectsToggle.checked) stopCues();
});
document.addEventListener("visibilitychange", () => {
  syncMusic();
  if (document.hidden) stopCues();
});
