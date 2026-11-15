const lessons = [
  {
    title: "Read a card safely",
    prompt: "You’re Host and have three actions. You want to read Flucloxacillin — Oral before deciding where to play it.",
    choices: ["Inspect the card", "Play and choose a space"],
    answer: 0,
    success: "Inspect shows the full name, tags, ability and scoring. It leaves your three actions and hand intact.",
    hint: "Look for the control that shows details without selecting the card for deployment.",
  },
  {
    title: "Pay for a play",
    prompt: "Flucloxacillin — Oral costs 1. You’ve chosen Play. What do you do before selecting an open space?",
    choices: ["Discard Flucloxacillin", "Mark one other hand card as payment", "Spend a separate action to discard"],
    answer: 1,
    success: "Play and payment resolve together. You have two actions left.",
    hint: "The cost is paid with other cards from your hand as part of the play.",
  },
  {
    title: "Read an Optimal match",
    prompt: "The antibiotic has a matching symbol under Optimal on Staphylococcus aureus at another site. Its on-play attack can reach that target.",
    choices: ["Choose one distant Optimal target instead of the local tuck", "Tuck at both sites", "Treat the match as Resistance"],
    answer: 0,
    success: "Optimal can reach one distant target instead of the local attack. Active matches are local. Resistance may trigger the bacterium’s printed reaction.",
    hint: "A distant tuck replaces the local attack.",
  },
  {
    title: "Check Resistance before playing",
    prompt: "Host plays flucloxacillin at the same site as B32 MRSA. The flucloxacillin symbol sits in MRSA’s Resistance row, and its reaction is unused.",
    choices: ["Tuck MRSA", "MRSA stays visible and Bacteria draws 1 after the attack", "Host takes the card back"],
    answer: 1,
    success: "A Resistance match blocks the tuck. A matching local antibiotic play can trigger one draw per bacterial copy per game.",
    hint: "Check the R row before committing cards to payment.",
  },
  {
    title: "Use a bonus play",
    prompt: "Later, you play Neutrophil — Recruitment at cost 0. Its card reads “Bonus play · 1 Immune card.” The Immune card you want costs 1.",
    choices: ["Spend another action and discard one card", "Spend no additional action and discard one card", "Spend no action and discard nothing"],
    answer: 1,
    success: "The bonus saves an action. The Immune card still costs one discard.",
    hint: "Separate the number of actions from the number of payment cards.",
  },
  {
    title: "Read a compact tuck",
    prompt: "You play B16. It reads “Tuck · Up to 1 opponent card here with no cards beneath it.” There’s one Host card with a tucked card under it at this site, and a Host card with nothing tucked beneath it at another site.",
    choices: ["Tuck the Host card at this site", "Tuck the Host card at the other site", "Leave both cards in play"],
    answer: 2,
    success: "“Here” means this site. The local Host card already has a card beneath it, and “up to 1” lets you skip the tuck.",
    hint: "Check both the location and the space beneath the target.",
  },
  {
    title: "Read a compact synergy",
    prompt: "B04 reads “Urinary Tract / Liver +2 VP.” It is visible at Liver. How much does this printed synergy add?",
    choices: ["0 VP", "2 VP", "4 VP"],
    answer: 1,
    success: "The slash lists alternative sites for one award. The site can also grant a separate site-tag bonus.",
    hint: "Either listed site qualifies for one +2 VP award.",
  },
  {
    title: "Unlock a site boon",
    prompt: "You start your turn with two visible cards at Lung. Bacteria has one there. What happens?",
    choices: ["You draw one from the boon", "Neither side gets the boon"],
    answer: 1,
    success: "A boon needs a strict majority and at least three of your own cards at the start of the turn.",
    hint: "Check the minimum number of your own cards, as well as who has more.",
  },
  {
    title: "Finish and score",
    prompt: "At the end of a turn, all 24 spaces are filled. What decides the winner?",
    choices: ["Whoever played the last card", "The faction with more occupied spaces", "The higher total victory points"],
    answer: 2,
    success: "Score base, synergy, tucks, territory and secret objectives. An empty draw deck or full control of two sites also ends the match at the end of a turn.",
    hint: "Board presence matters, but the scoring screen adds several sources of points.",
  },
];

const progress = document.querySelector("#lesson-progress");
const title = document.querySelector("#lesson-title");
const prompt = document.querySelector("#lesson-prompt");
const choices = document.querySelector("#lesson-choices");
const feedback = document.querySelector("#lesson-feedback");
const next = document.querySelector("#lesson-next");
let step = 0;

function showLesson() {
  const lesson = lessons[step];
  choices.replaceChildren();
  feedback.textContent = "";
  if (!lesson) {
    progress.textContent = "Practice complete";
    title.textContent = "Ready to play";
    prompt.textContent = "Return to your match tab, or open the game lobby to start Pass & Play.";
    next.textContent = "Practice again";
    next.hidden = false;
    return;
  }
  progress.textContent = "Step " + (step + 1) + " of " + lessons.length;
  title.textContent = lesson.title;
  prompt.textContent = lesson.prompt;
  next.textContent = "Continue";
  next.hidden = true;
  for (const [index, label] of lesson.choices.entries()) {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "secondary";
    choice.textContent = label;
    choice.addEventListener("click", () => {
      if (index !== lesson.answer) {
        feedback.textContent = lesson.hint;
        return;
      }
      feedback.textContent = lesson.success;
      next.hidden = false;
      next.focus();
      for (const option of choices.children) option.disabled = true;
    });
    choices.append(choice);
  }
}

next.addEventListener("click", () => {
  step = step < lessons.length ? step + 1 : 0;
  showLesson();
  title.focus();
});
showLesson();
