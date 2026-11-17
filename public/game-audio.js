const musicToggle = document.querySelector("#menu-music");
const effectsToggle = document.querySelector("#sound-effects");

function track(name, volume) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = volume;
  audio.src = `/audio/${name}.mp3`;
  return audio;
}

const menuVolume = 0.25;
const music = track("menu-loop", menuVolume);
const click = track("button-click", 0.35);
const welcome = track("welcome", 0.65);
const faction = track("choose-faction", 0.65);
const start = track("game-start", 0.55);
const card = track("card-played", 0.5);
const tuck = track("card-played-tuck", 0.55);
const cues = [click, welcome, faction, start, card, tuck];
music.loop = true;

const welcomeKey = "microbe-wars.audio.welcomed";
let welcomed = false;
try { welcomed = localStorage.getItem(welcomeKey) === "yes"; } catch {}
let screen;
let playCount = 0;
let factionSpoken = false;
let referenceOpen = false;
let fade = null;

function restoreToggle(toggle) {
  const key = `microbe-wars.audio.${toggle.id}`;
  try { toggle.checked = localStorage.getItem(key) !== "off"; } catch {}
  toggle.addEventListener("change", () => {
    try { localStorage.setItem(key, toggle.checked ? "on" : "off"); } catch {}
  });
}

restoreToggle(musicToggle);
restoreToggle(effectsToggle);

function stopMusic() {
  clearInterval(fade);
  fade = null;
  music.pause();
  music.volume = menuVolume;
}

function fadeMusic() {
  if (music.paused || fade !== null) return;
  const began = performance.now();
  const volume = music.volume;
  fade = setInterval(() => {
    const fraction = Math.min(1, (performance.now() - began) / 1000);
    music.volume = volume * (1 - fraction);
    if (fraction === 1) stopMusic();
  }, 25);
}

function syncMusic() {
  if (!musicToggle.checked) {
    stopMusic();
  } else if (screen !== "lobby" || referenceOpen || document.hidden) {
    fadeMusic();
  } else {
    clearInterval(fade);
    fade = null;
    music.volume = menuVolume;
    if (music.paused) music.play().catch(() => {});
  }
}

function cue(audio) {
  if (!effectsToggle.checked || document.hidden) return;
  audio.currentTime = 0;
  return audio.play();
}

function announceFaction() {
  const playing = cue(faction);
  if (!playing) return;
  factionSpoken = true;
  playing.catch(() => { factionSpoken = false; });
}

function announceLobby() {
  if (screen !== "lobby" || referenceOpen || factionSpoken) return;
  if (welcomed) {
    announceFaction();
  } else if (welcome.paused) {
    cue(welcome)?.catch(() => {});
  }
}

welcome.addEventListener("ended", () => {
  welcomed = true;
  try { localStorage.setItem(welcomeKey, "yes"); } catch {}
  announceLobby();
});

export function updateGameAudio(nextScreen, plays) {
  if (plays.length > playCount && (screen === nextScreen || screen === "playing")) {
    const latest = plays.at(-1);
    cue(latest.tucked ? tuck : card)?.catch(() => {});
  }
  playCount = plays.length;
  if (screen === nextScreen) return;
  const startsMatch = nextScreen === "objectives" && screen !== undefined && screen !== "playing";
  screen = nextScreen;
  if (screen !== "lobby") {
    welcome.pause();
    faction.pause();
    factionSpoken = false;
  }
  syncMusic();
  if (startsMatch) cue(start)?.catch(() => {});
  announceLobby();
}

document.addEventListener("click", event => {
  if (!event.isTrusted) return;
  if (event.target.closest('button:enabled:not([aria-disabled="true"]), summary, .reference-menu a[href]')) {
    cue(click)?.catch(() => {});
  }
  if (event.target.closest(".reference-menu a[href]")) {
    referenceOpen = true;
    welcome.pause();
    faction.pause();
  }
  syncMusic();
  announceLobby();
}, true);

document.addEventListener("keydown", event => {
  if (!event.isTrusted || event.repeat) return;
  syncMusic();
  announceLobby();
}, true);

window.addEventListener("focus", () => {
  referenceOpen = false;
  syncMusic();
  announceLobby();
});
musicToggle.addEventListener("change", syncMusic);
effectsToggle.addEventListener("change", () => {
  if (!effectsToggle.checked) cues.forEach(audio => audio.pause());
  else announceLobby();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) referenceOpen = false;
  else cues.forEach(audio => audio.pause());
  syncMusic();
  announceLobby();
});
