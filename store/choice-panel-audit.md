# In-game panel audit — 23 November 2026

All match decisions now have a native keyboard-accessible Expand / Collapse summary. New required decisions open automatically; collapsing never resolves or skips a decision. Selections and expansion state survive hand changes and rerenders. A different decision opens afresh.

Updated for Android 1.0.3: expanded decisions use at most 45% of the board area above the hand, leaving site navigation and the board visible underneath. A coloured ribbon expands or collapses each choice. Bonus play retains its smaller, initially collapsed bar so players can deploy onto the board. There is no Overview button or Overview rendering mode.

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

Objective eligibility: starting offers and extra objective draws exclude missing required sites and insufficient site capacity. CNS Breach now requires CNS to be among the four active sites before it is offered; its printed scoring condition (two distinct CNS-synergy species anywhere) is unchanged. Unchosen opening offers and pending objective drafts from older saves are repaired. Already chosen objectives are preserved. All 24 scoring conditions were reviewed against the current card catalog: site-specific dependencies are G03, G04, G05, G20 and G21; the other objectives use available species, card types, resistance, O/A tuck history or board-wide control rather than requiring a named site. Eligibility means possible under the rules, not guaranteed achievable from the current hand or after an opponent's moves.

Verification: 14 decision states at 432×960 and 960×432, selection and collapse persistence, no hand overlap, engine suite and 2,000 seeded opening-pool checks. Android assets are synced; installed testers need the new Play release.
