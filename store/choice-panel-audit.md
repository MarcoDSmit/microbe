# In-game panel audit — 23 November 2026

All match decisions now have a native keyboard-accessible Expand / Collapse summary. New required decisions open automatically; collapsing never resolves or skips a decision. Selections and expansion state survive hand changes and rerenders. A different decision opens afresh.

Expanded decisions occupy the board area above the hand. Collapsing reveals the four clinical sites. Bonus play retains its smaller, initially collapsed bar so players can deploy onto the board.

| Panel / trigger | Result |
| --- | --- |
| Initial secret objective selection | Collapsible |
| Objectives locked / waiting for opponent | Collapsible |
| Hand-limit discard (`trim`) | Collapsible |
| Keep drawn cards (`filter`) | Collapsible |
| Retrieve from discard (`retrieve`) | Collapsible |
| Additional objective (`draft`) | Collapsible |
| Heart exchange (`recirculate`) | Collapsible |
| Middle Ear discard and draw (`tradeDraw`) | Collapsible |
| Skin & Soft Tissue relocation (`relocate`) | Collapsible |
| Eye deck ordering (`survey`) | Collapsible |
| Peripheral IV discard-or-draw (`discardDraw`) | Collapsible |
| Resistance target (`resistPlay`) | Collapsible |
| Refuge reaction / destination | Collapsible |
| Tuck targets, including local sweep follow-up | Collapsible; existing confirm and tuck-all controls retained |
| Awaiting opponent reaction | Collapsible |
| Bonus play | Existing compact collapsible bar retained |
| Room invitation | Collapsible |

Other surfaces: match menu and settings already close; objectives and discard sidebar have Close; enlarged hand, objective and inspected cards dismiss using their existing controls or backdrop. These are deliberate inspection views rather than mandatory decision panels. Pass-and-play handoff remains a privacy screen, and end-game/tutorial completion remain navigation screens.

No card effects, costs, scoring or decision validation changed. This source update needs a new Android bundle and Play release before it reaches installed testers.
