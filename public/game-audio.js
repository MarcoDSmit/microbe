import { shipSoundPlayer } from "/ship-sounds.js";

const musicSlider = document.querySelector("#menu-music");
const effectsSlider = document.querySelector("#sound-effects");

const levels = new Map();

function track(name, volume) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = volume;
  levels.set(audio, volume);
  audio.src = `/audio/${name}.mp3`;
  return audio;
}

const menuVolume = 0.40;
const music = track("menu-loop", menuVolume);
const ambience = track("starship-engine-hum", 0.10);
const shipTracks = ["console-signal", "panel-buttons", "pressure-door", "sliding-door"].map(name => track(name, 0.075));
const shipSounds = shipSoundPlayer(shipTracks);
const click = track("button-click", 0.35 * 0.85);
const welcome = track("welcome", 0.65);
const faction = track("choose-faction", 0.65);
const start = track("game-start", 0.55);
const card = track("card-played", 0.5);
const tuck = track("card-played-tuck", 0.55);
const cues = [click, welcome, faction, start, card, tuck];
music.loop = true;
ambience.loop = true;

const welcomeKey = "microbe-wars.audio.welcomed";
let welcomed = false;
try { welcomed = localStorage.getItem(welcomeKey) === "yes"; } catch {}
let screen;
let playCount = 0;
let factionSpoken = false;
let referenceOpen = false;
let fade = null;

const gain = slider => Number(slider.value) / 100;
const volume = (audio, slider) =>
  levels.get(audio) * gain(slider) * (slider === musicSlider ? 1.05 * 1.1 : 0.9);

function restoreVolume(slider, update) {
  const key = `microbe-wars.audio.${slider.id}`;
  const output = document.getElementById(slider.id + "-value");
  try {
    const saved = localStorage.getItem(key);
    if (saved === "off") slider.value = 0;
    else if (saved !== null && saved !== "on" && Number.isFinite(Number(saved))) slider.value = saved;
  } catch {}
  const apply = () => {
    output.value = slider.value + "%";
    update();
  };
  slider.addEventListener("input", () => {
    try { localStorage.setItem(key, slider.value); } catch {}
    apply();
    syncBackgroundAudio();
  });
  apply();
}

restoreVolume(musicSlider, () => {
  music.volume = volume(music,musicSlider);
  ambience.volume = volume(ambience,musicSlider);
});
restoreVolume(effectsSlider, () => {
  for (const audio of [...cues,...shipTracks]) {
    audio.volume = volume(audio,effectsSlider);
    if (gain(effectsSlider) === 0) audio.pause();
  }
});

function stopMusic() {
  clearInterval(fade);
  fade = null;
  music.pause();
  music.volume = volume(music,musicSlider);
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

function syncBackgroundAudio() {
  const playing = screen === "playing" && !referenceOpen && !document.hidden;
  if (playing && gain(effectsSlider)) shipSounds.resume();
  else shipSounds.pause();
  if (playing && gain(musicSlider)) {
    if (ambience.paused) ambience.play().catch(() => {});
  } else {
    ambience.pause();
  }
  if (!gain(musicSlider)) {
    stopMusic();
  } else if (screen !== "lobby" || referenceOpen || document.hidden) {
    fadeMusic();
  } else {
    clearInterval(fade);
    fade = null;
    music.volume = volume(music,musicSlider);
    if (music.paused) music.play().catch(() => {});
  }
}

function cue(audio) {
  if (!gain(effectsSlider) || document.hidden) return;
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
  if (screen !== "playing") shipSounds.reset();
  if (screen !== "lobby") {
    welcome.pause();
    faction.pause();
    factionSpoken = false;
  }
  syncBackgroundAudio();
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
  syncBackgroundAudio();
  announceLobby();
}, true);

document.addEventListener("keydown", event => {
  if (!event.isTrusted || event.repeat) return;
  syncBackgroundAudio();
  announceLobby();
}, true);

window.addEventListener("focus", () => {
  referenceOpen = false;
  syncBackgroundAudio();
  announceLobby();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) referenceOpen = false;
  else cues.forEach(audio => audio.pause());
  syncBackgroundAudio();
  announceLobby();
});
