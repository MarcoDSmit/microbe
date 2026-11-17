const windowLength = 300_000;
const plannedSpacing = 40_000;
const quietGap = 30_000;

export function shipSoundPlayer(tracks) {
  let queue = [];
  let windowStart = 0;
  let elapsed = 0;
  let runningSince = null;
  let quietUntil = 0;
  let timer;
  let current;

  const now = () => elapsed + (runningSince === null ? 0 : performance.now() - runningSince);

  function fillWindow() {
    const order = [...tracks];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const slack = windowLength - order.length * plannedSpacing;
    const offsets = order.map(() => Math.random() * slack).sort((a, b) => a - b);
    queue = order.map((track, i) => ({ track, at: windowStart + offsets[i] + i * plannedSpacing }));
    windowStart += windowLength;
  }

  function schedule() {
    if (runningSince === null || current) return;
    if (!queue.length) fillWindow();
    timer = setTimeout(playNext, Math.max(queue[0].at, quietUntil) - now());
  }

  function finish(track) {
    if (current !== track) return;
    current = null;
    quietUntil = now() + quietGap;
    schedule();
  }

  function playNext() {
    if (now() < quietUntil) return schedule();
    const {track} = queue.shift();
    current = track;
    track.currentTime = 0;
    track.play().catch(() => finish(track));
  }

  for (const track of tracks) {
    track.addEventListener("ended", () => finish(track));
    track.addEventListener("error", () => finish(track));
  }

  function pause() {
    if (runningSince === null) return;
    elapsed = now();
    runningSince = null;
    clearTimeout(timer);
    if (current) {
      current.pause();
      finish(current);
    }
  }

  return {
    resume() {
      if (runningSince !== null) return;
      runningSince = performance.now();
      schedule();
    },
    pause,
    reset() {
      pause();
      queue = [];
      windowStart = elapsed = quietUntil = 0;
    },
  };
}
