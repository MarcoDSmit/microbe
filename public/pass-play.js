export function nextPlayer(state) {
  if (state.status === "objectives") {
    return [state.first, state.first === "Host" ? "Bacteria" : "Host"]
      .find((faction) => state.players[faction].offer.length) ?? null;
  }
  return state.status === "playing" ? (state.pending?.f ?? state.turn) : null;
}

export function passPlayView(state, revealed, view) {
  const faction = nextPlayer(state);
  if (state.status === "finished") {
    return { status: "finished", scores: state.scores, reason: state.reason,
      series: view(state, "Host").series, startedAt: state.startedAt, endedAt: state.endedAt };
  }
  return revealed === faction && faction ? view(state, faction) : null;
}
