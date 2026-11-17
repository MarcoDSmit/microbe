const exit = document.querySelector("#exit-reference");
if (new URLSearchParams(location.search).get("from") === "game") {
  try {
    const saved = sessionStorage.getItem("microbe-wars.reference-return");
    if (saved) {
      const target = new URL(saved, location.origin);
      if (target.origin === location.origin && ["/", "/index.html"].includes(target.pathname)) exit.href = target.href;
    }
  } catch {}
}
