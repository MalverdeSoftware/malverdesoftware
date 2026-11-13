# Spec: mGameUI

Module id `game-ui` · November 6, 2026 · **Status: living draft.** The author asked for this spec and chose its direction. The details are the assistant's draft for the author to review, and the [decision log](#decision-log) says which is which. First used by [mKnockabout](https://github.com/MalverdeSoftware/mKnockabout).

## Objective

MalverdeSoftware games should feel polished and immersive, and new games should start from what we've already learned. Games have their own line of design, separate from [mUI](SPEC-ui.md), the apps' spec. mUI is built for forms, lists and work screens, where calm and plain is right, and a game has a different job. This spec is where everything a game uses gets written down, whether we made it or took it from somewhere else. It grows as we build.

"MUST" is a rule. "SHOULD" is the default, and departing from it needs a reason you can state.

## Scope

This spec covers **everything in a game**: play, loading, menus, endings, settings, and consent or account screens. mUI doesn't bind games. When a game takes something from Ring or mUI, it gets written into this spec, and from then on it's ours to keep or change.

Where this spec says nothing yet, a game SHOULD start from mUI's rule and add what it took here.

## What we've absorbed from Ring and mUI

These are in use in games today. Being on this list means we chose them, not that a game has to use Ring.

| Absorbed | In a game |
|---|---|
| Mona Sans, bundled | Everywhere, including during play |
| Ring's `Frame`, `H1`, `H2` and `Button`, and its page colors | Menus and endings, and the result card's heading and button. Whether menus stay this way is [an open question](#open-questions) |
| Ring's `LoaderInline` with words | The [loading screen](#components) |
| The name as one word | The same |
| 44px tap targets, no sideways scrolling | The same, and checked at 320px wide and in landscape |
| WCAG AA for text | The same, over any part of the world. See [Color](#color) |
| Every control has a name, and status is announced | The same. Controls with no visible words carry hidden ones |
| Works with a keyboard | The same. See [Controls](#controls) |
| Nothing moves under a finger | The same: controls stay put, and the world moves behind them. The [stick appears under the thumb](#lessons-from-apple), then stays put until the thumb lifts |
| No second UI library | The same. In-game controls are plain HTML and CSS |
| Pinned exact versions, nothing requested from third parties | The same |
| Sentence case, no all-caps labels | The same |

## What changed, and why

| mUI says | During play | Why |
|---|---|---|
| Every page sits in `Frame` | No top bar, link or footer. Menus keep them | The world should fill the screen. A white strip took a large part of a phone |
| Use Ring for controls | Our own stick and round thumb buttons | Ring has no stick, and its buttons are built for work screens |
| All color from Ring's variables | [A small set of in-game colors](#color), each carrying `ui-check: allow-color` | Controls sit on a moving 3D scene, not a white page |
| Flat surfaces, no shadows | See-through dark surfaces with a blur, a thin light edge and a soft lift | They need to stay readable over any part of the world while picking up its colors |
| No decorative color or icons | The active character's color and small goal icons | Here they carry meaning: who you're playing, and what's left to do |
| One accent | The accent stays for primary actions in cards. The stick and Hop take the character's color | It ties the controls to who you're playing |

## Color

Define these once, on the game's root element, as mKnockabout's `src/styles.css` does:

| Name | Value | Use |
|---|---|---|
| `--glass` | Warm near-black at 32% | The stick's base. No text sits on it, and it has no blur, so it doesn't hide what's behind it |
| `--glass-strong` | Warm near-black at 72%, with a 14px blur | Anything with text or an icon on it |
| `--glass-edge` | White at 30% | The thin light edge on glass surfaces |
| `--on-glass` | White | Text, icons and outlines |
| `--animal` | Set per character | The stick's knob, the Hop ring and the portrait's edge |
| `--clock-glass` | Warm near-black at 86% | Behind the clock, so its ring stands out over a bright world |
| `--time-plenty`, `--time-soon`, `--time-hurry` | Green, orange, red | The time ring, the same for every character |

- Text MUST sit on `--glass-strong`. White on it over pure white works out to about 7:1 by calculation, and mKnockabout's `tests/contrast.test.ts` checks this and the dimmed text in the goal list. `--glass` fails AA for text.
- Character colors MUST work on both the dark glass and the world, so check each new character.
- Red still means only an error or something destructive.
- If the player asks for reduced transparency, surfaces go solid, the blur goes away and the stick doesn't fade.

## Components

Sizes are from mKnockabout. A game SHOULD keep them unless it has a reason.

| Component | Where | How it looks | Rules |
|---|---|---|---|
| **Stick** | Rests at bottom left, and appears under the thumb anywhere on the left half of the screen below the top group | 120px see-through circle with a 50px knob in the character's color. Fades to 55% at rest, after 6 seconds at full strength | Stays put until the thumb lifts, and the knob follows the thumb. Stays fully on screen near an edge. Hides any open list when first used |
| **Primary thumb button** | Bottom right, under the thumb | 80px circle, `--glass-strong`, with a ring in the character's color and one short word | One word, such as "Hop". Acts on the press, not the release. Shrinks and fills with the character's color while pressed |
| **Secondary thumb button** | Up and left of the primary | 60px circle showing what it does, such as the other animal's face | Hidden words MUST name the action ("Switch to frog"). Acts on the press, and shrinks while pressed. Stays even when tapping the world can do the same, since the other character is often out of view |
| **Portrait** | Top left | 60px circle with the active character's face and an edge in its color | Decorative, so it's hidden from screen readers |
| **Action button** | Above the primary thumb button, so that one never moves | 68px circle, `--glass-strong`, with a white ring and one short verb, such as "Dig" or "Dance" | Shows only while the character is close enough to do that thing, and pops in. The goal waits for the press, and being close never finishes it. Acts on the press. Mirrors with left-handed controls. Pressing it on a goal for two leaves the ring dashed, and its hidden words add "waiting for the other one". A verb is one word, chosen so that it reads well on the button: "Click", since "press Press" reads badly. It keeps its word during a goal's last press, and Drop and Leave take no press for 0.4 seconds after they appear, so a quick double tap can't drop what you're holding. Focus stays on it when its word changes, and screen readers hear it once when it appears |
| **Clock and time ring** | Next to the portrait | 56px `--clock-glass` circle with tabular numbers, and the time left as a ring around them | Always visible during play. Announced with `role="timer"`. The ring is green, orange under 30 seconds and red under 10, whichever character is playing, so its color only ever means time |
| **Goal slots** | Next to the clock | One 32px dotted circle per goal with a small line icon. Fills white when done, with a brief pop | The whole row is one 44px button that opens the list, and says "Goals, 1 of 4 done" |
| **Next line** | Under the slots | One line naming a goal to do, or "Done: …" for 2 seconds. In a room with sets, a small "Set 2 of 4" pill comes first, and the line wraps under it rather than cutting off. It also says what a goal for two needs: "Now the other one", "Now you. Press Mix", or what's missing, such as "Now you. Bring the wrench". Where two animals have different parts, it tells each its part and ring: "You hold. Press Hold on the hands ring", "Holding. Now switch to the one with the wrench" | Read out through a hidden live region, so a countdown is announced once, not every second. It names one goal to try. Some goals need another first, and the list shows which |
| **Goal list** | Under the top left group | Rounded `--glass-strong` panel with each goal's slot, name and any note | Starts open so players can read it, and tucks away after 6 seconds or when the stick is first used. On short screens it moves to the top right, in tighter rows, clear of the stick and the lead character. Sideways, it sits left of the thumb buttons, and its rows scroll with a fade at the edge. In a room with sets, it opens by itself at each new set, with the set's name at the top, a dimmed "Not yet" on goals that have to wait, and a row saying the door is lit and to press Leave there to move on. "Need help?" stays pinned below the rows, at 44px |
| **Character selector** | Start screen | A card for each animal with a small image, name and one line about its ability. Selected cards take Ring's accent color and a thicker border, and the first pick says "Starts". Two columns, or four on short screens | Pick any two. Each card is a toggle button with `aria-pressed`. A third pick replaces the second, and Play says "Pick two to play" until two are picked |
| **Loading screen** | Full screen, before play | The game's characters in miniature, lead in the middle, hopping in turn with small shadows, over Ring's `LoaderInline` and words. Uses the menu's white page, then fades into the room | `role="status"`, with the images hidden from screen readers. Failure says so in words, with `role="alert"`. The small images are fetched from the menu so they're ready. Reduced motion stops the hopping |
| **Check-in** | Over the world before the first level, and on the ending | A `--glass-strong` card with the character asking, one question, five answer buttons and Skip | `role="group"`, and it takes focus. Skippable, earns nothing, and holds the clock still. A skip stays missing |
| **Speech bubble** | Top, under the first group | A character's small image and one line on `--glass-strong`. A Do nudge adds "I did it" | `role="status"`. Leaves after 7 seconds, or 14 with an action, or when dismissed |
| **Door ring** | On the floor by the door | A pulsing warm ring, in the world rather than the interface | Appears when a room's goals are done, and the line under the clock says where to go |
| **Door ring** | On the floor, at the way out | A blue ring, `0x2f9bff`, so it never looks like a goal's gold ring | Lights after the first set. While sets are left, walking in does nothing, and the action button offers Leave. Once the room is done it offers Leave too, so walking in never moves on, and the line says "Room done! Press Leave at the door". Leaving plays a short skip toward the door and a fade. Screen readers hear when it lights |
| **Spot ring** | On the floor, in the world | A white ring on each spot that wants a press now | Fills with each press, and keeps its place if you walk off. On a goal for two, the middle fills and drains as the time to answer runs out. A Give shows its ring at the buddy's feet. Never the only sign of a thing: the action button and next line say it too. When two animals have different parts at one place, each part gets its own ring with a white picture on a dark disc in the middle, such as hands for holding and a wrench for bolting, and the hints name the ring by its picture. The second part's ring shows as soon as the first can be pressed, so both places show together |
| **Needed mark** | Over an animal, in the world | A gold disc with "!", about half an animal wide, drawn over everything | Shows over the animal the other is waiting on: after one press on a goal for two, during a Hold, or on whoever holds what a Give wants. It hops every 2.2 seconds, and the animal's voice blips once when the wait starts. Alone, it shows only on the animal you'd switch to. On two phones, both show it over the same animal. It goes when they act or the wait ends. It also shows while one animal holds the big box alone. It sits over the head. Where that would be under the top area, it comes down to just over the head and shrinks by a fifth, and if it's still covered, the camera eases back until the wait ends. Reduced motion keeps the mark and drops the hop |
| **Role mark** | Over an animal's head, in the world, beside the needed mark when it has both | A small dark disc with a white picture of what it carries for a part, such as the wrench | Shows while that part is open, so it's clear who does what. It matches the picture on that part's ring |
| **Wait timer** | Above the thing, in the world | A glow and a countdown, such as an oven baking | Doesn't stop the room's clock. The next line and the list both show "Wait for it: 7" |
| **Set done** | In the world and the next line | "Set done! More to do", a fanfare, a small jump and a few stars | Things that fly in or out get stars too, and with reduced motion they just appear |
| **Show** | Full screen, at the end of a day | The characters do something funny, with nothing to press. The ride is about 7 seconds | The clock, goals, controls, list and speech bubble hide. Screen readers hear one line, "Off they go". Reduced motion gives a plain 3 seconds. Closing the game during it comes back to the ending, not the show |
| **Arrival** | Full screen, on entering a room, including from a saved game | A 2.6-second camera move from high at a front corner, round and down to the play camera, with "Tap to skip" at the bottom | Controls are hidden and the clock waits until it ends. Any tap or key skips it and does nothing else. On two phones, both see it and a tap on either skips both. Reduced motion gives a 0.7-second fade. The clock, slots and opening list stay on screen for now, which is pinned for the author |
| **BONK word** | In the world | The big word from a time-out, in the same style | May also land a joke outside a time-out, as with the kart's crash. No injury is shown. A cuter cousin, a pink "Yum!" (`#ff6f9f`, white edge), pops over whoever is served, and moves clear of the top area. Reduced motion fades it in place |
| **Result card** | Bottom | Rounded `--glass-strong` card with a Ring `H2` and a primary Ring `Button` | Replaces the controls. `role="alert"`. Its button takes focus |

All of these respect safe areas (`env(safe-area-inset-*)`) in both orientations, and `prefers-reduced-motion` turns off their animation.

## Controls

- The stick MUST follow the camera: up always means away from it.
- Dragging the right side of the world looks around, within limits that keep the scene sensible. The canvas MUST set `touch-action: none` so this doesn't scroll or zoom the page.
- Controls MUST NOT need two fingers at once on the world. The camera moves by dragging, not with a second stick (G010).
- Tapping the other character switches to it. A tap under 350ms that moves less than 10px counts, with a target at least 60px wide.
- Every in-game press SHOULD get a visible response and, where the device allows, haptics and sound.
- Characters SHOULD speed up and slow down quickly rather than instantly.
- Left-handed players can swap the stick and thumb buttons in Settings. Two-phone play has no switch button, unless a friend drops.
- Keyboard: arrows or WASD to move, Q and E to look, and space for the primary action. Every thumb button can also be reached with Tab.

## Screens around play

These use Ring's page colors and `Frame` for now. Whether they get their own mGame look is [an open question](#open-questions).

| Screen | What it has | Rules |
|---|---|---|
| **Welcome** | An age question, then a short plain-language page | Under 13 stops there. Terms are required. Check-ins and research sharing are separate, optional and unticked, and research sharing is only offered at 18+ (mKnockabout D023, D024). All wording is a draft for a lawyer |
| **Play with a friend** | Invite a friend, or type a code | Only a code: no chat, free text, matchmaking or public list. A wrong code says so in words |
| **Settings and help** | Mute, left-handed, less motion, the consent choices, save or delete your data, help, credits | Every choice can change at any time. Deleting asks first |
| **Ending** | The animals hopping and waving goodbye, the check-in if due, a Plan nudge if due, and Done | Calm, with nothing pulling the player back |
| **Resting** | The animals, "See you tomorrow", the check-in if not yet answered today, and Settings and help | Shown when the day's play is used up. No Done and no way into play until the next day (G034) |

## Lessons from Apple

Games keep our own controls during play (G008). We built Apple's Liquid Glass buttons and its on-screen controller into a [native test](https://github.com/MalverdeSoftware/mKnockabout/pull/14) and compared them on a simulator, not a real phone:

- Apple's controller has only "A" and "B" for labels, and it covered a character near the right side of the room.
- Apple's system alert covered the joke at the end of a round, and the frame rate fell behind its sheet and alert.
- Liquid Glass picked up the room's colors well, which is worth learning from. Its contrast wasn't checked.

What we took instead is the advice in Apple's [game controls guidance](https://developer.apple.com/design/human-interface-guidelines/game-controls). mKnockabout now does all of this:

| Lesson | What it means for us |
|---|---|
| Show the stick where the thumb lands | The left half of the screen is the stick's area, and the stick appears under the thumb |
| Fade controls at rest | The stick fades to 55% when it's not in use, and stays findable |
| Give every press a visible and physical response | Buttons act on the press and show it, with haptics and sound where the device allows |
| Drag directly to move the camera | Dragging the right side looks around, with no second stick |
| Tap objects directly where you can | Tapping the other character switches to it. The button stays too |
| A glass-like look | Surfaces blur what's behind them and pick up its color, on the web too |

Any new surface MUST still pass the [Color](#color) rules for text, and the blur's cost in drawing time on phones still needs measuring.

During play, a game SHOULD NOT use a system alert or sheet, including in a native build. The [result card](#components) and goal list do those jobs and keep the world in view.

## Layout

- Play SHOULD fill the screen, including behind the notch, with controls kept in the safe area.
- Every layout MUST work in portrait and landscape, down to 320×568. Portrait is the current test size, and landscape looks closest to the references.
- The view SHOULD widen on tall screens so that portrait doesn't feel zoomed in.
- Controls MUST NOT overlap each other, and the world MUST be able to show behind them. Keep walls or scenery tall enough that the camera doesn't see past the edge of the world.
- A game SHOULD lower its drawing resolution rather than drop frames on a slow device.

## References

These show a taste. We learn techniques from them, and don't copy their characters, art, levels, names or logos. Reference images stay out of Git.

| Reference | What we like | What we carried over | Not used |
|---|---|---|---|
| [Apple's on-screen game controller](https://www.gadgets360.com/games/news/apple-physical-virtual-controller-platforms-state-of-union-wwdc-2021-ios-ipados-tvos-macos-2463719) | Polished see-through controls that leave the world visible | Dark see-through stick, round thumb buttons, a portrait at top left, dotted slots | Apple's controller and Liquid Glass buttons, which we tested in a native build and chose not to use (G008) |
| [Apple's game controls guidance](https://developer.apple.com/design/human-interface-guidelines/game-controls) | Advice on thumb reach, press feedback and showing controls only when needed | See [Lessons from Apple](#lessons-from-apple) | Apple's Touch Controller framework, which is for Metal games |
| [Pokémon Pokopia](https://pokopia.pokemon.com/en-us/) | Rendering, navigation and controls | Low camera close behind the character, camera-relative movement, hopping, soft light, round shadows | All of its art and characters. Its on-screen interface hasn't been studied in detail |

Return to these whenever a new part of a game is designed, and add to this table when a new reference changes what we do.

## Sharing it

The code lives in each game until a second game needs it, as with mUI. Then it moves to a shared package, and this spec names it.

## Conformance

`malverdesoftware-ui-check` still runs on games. Every hard-coded color carries `ui-check: allow-color`, and those lines SHOULD stay in the one color block.

The rest needs eyes. Before merging a change to the play screen:

- [ ] Works at 320×568, 375×667 and in landscape, with no overlap or sideways scrolling
- [ ] Tapped controls are at least 44px, and hidden words name each action
- [ ] Text sits on `--glass-strong`
- [ ] Works with a keyboard, with no console errors
- [ ] Looked at over the brightest and darkest parts of the world
- [ ] Tried on a real phone, or the limit is stated

## Decision log

| ID | Date | Decision | Whose | Source |
|---|---|---|---|---|
| G001 | 2026-11-06 | Play is full-screen, with no `Frame` | Author | mKnockabout D014 |
| G002 | 2026-11-06 | In-game controls may leave Ring, with Apple's controller as a reference | Author | mKnockabout D015 |
| G003 | 2026-11-06 | Keep a spec for this, so that it informs later builds | Author | mKnockabout D015 |
| G004 | 2026-11-06 | Return to Pokopia as a reference as the game grows | Author | mKnockabout `DESIGN-ETHOS.md` |
| G005 | 2026-11-06 | Menus and all other screens stay in Ring. Replaced by G016 | Assistant, from the author's "in game controls" | mKnockabout D015 |
| G006 | 2026-11-06 | The specific components, sizes, colors and character-colored stick above | Assistant, for review | This spec |
| G007 | 2026-11-06 | One stick and dragging to look, rather than a second stick | Assistant, for review. Settled by G010 | This spec |
| G008 | 2026-11-06 | During play, keep our own controls rather than Apple's controller or Liquid Glass buttons, and adopt Apple's lessons | Author | mKnockabout D016 |
| G009 | 2026-11-06 | If a game goes native, its menus and settings may use Apple's system controls instead of Ring. Whether to go native is not decided | Author, choosing the assistant's recommendation | mKnockabout D016 |
| G010 | 2026-11-06 | The camera moves by dragging, not with a second stick | Author, choosing the assistant's recommendation | mKnockabout D016 |
| G011 | 2026-11-06 | The specifics in [Lessons from Apple](#lessons-from-apple), including no system alerts or sheets during play | Assistant, for review | This spec |
| G012 | 2026-11-06 | Build all six lessons into mKnockabout | Author | mKnockabout D017 |
| G013 | 2026-11-06 | The specifics of that build: the stick's area and fade, acting on the press, tapping the other character, the glass values, and no blur on the stick | Assistant, for review | mKnockabout D017 |
| G014 | 2026-11-06 | The time ring wraps the clock's numbers, not the character's portrait, since that's more intuitive | Author | mKnockabout D018 |
| G015 | 2026-11-06 | A loading screen with the animals in miniature and Ring's spinning loader | Author | mKnockabout D019 |
| G016 | 2026-11-06 | Games are a separate line from the apps' Ring UI. This spec covers the whole game, and anything a game uses from Ring or mUI gets absorbed here. Replaces G005 | Author | mKnockabout D019 |
| G017 | 2026-11-06 | The apps' UI spec is called mUI. The author said it "could be", so it's easy to change | Author | mKnockabout D019 |
| G018 | 2026-11-06 | The loading screen's details, and using Ring's page colors there and in menus for now | Assistant, for review | This spec |
| G019 | 2026-11-06 | A start screen with a character selector (D018, D021). Its details are the assistant's, for review | Author, with details by the assistant | mKnockabout D021 |
| G020 | 2026-11-07 | The check-in, speech bubble, door ring and the other screens above, as drafts | Assistant, for review, within the author's D021 to D024 | mKnockabout `docs/review-pins.md` |
| G021 | 2026-11-07 | The time ring has one color scheme for every character: green, orange, red. The moments it changes are the assistant's, for review | Author, with details by the assistant | mKnockabout D026 |
| G022 | 2026-11-07 | A second button that appears only when there's something close enough to do, instead of goals finishing on proximity. Its size and place are the assistant's, for review | Author, with details by the assistant | mKnockabout D027 |

| G023 | 2026-11-07 | Rooms have sets of goals with a fresh clock, and the HUD shows them. The door lights up after the first set. The pill, list rows, spot rings, wait timer, fanfare and stars are the assistant's, for review | Author, with details by the assistant | mKnockabout D028, D029 |
| G024 | 2026-11-07 | The waiting look on the action button and "Now the other one". "Now you. Press Mix" on the other phone, and Give's ring at the buddy's feet | Assistant, for review | mKnockabout D029, D031 |
| G025 | 2026-11-07 | On a sideways phone, "Need help?" is pinned below a scrolling list | Assistant, for review | mKnockabout D030 |
| G026 | 2026-11-07 | A hands-off show can end a day, with everything on screen hidden, and the BONK word can land a joke outside a time-out | Assistant, for review, within the author's go-ahead for a garage | mKnockabout D032 |
| G027 | 2026-11-07 | The words so far on the action button: Dig, Dance, Grab, Drop, Open, Mix, Bake, Take, Serve, Look, Click, Build, Nap, Bolt, Pump, Paint, Honk, Ride, Plant, Fill, Water, Give, Boost, Hold. Dig, Dance and Mix, Bake and the yard's Plant and Water came from the author's ideas, and the rest are for review | Author and assistant | mKnockabout D027 to D032 |

| G028 | 2026-11-07 | A lit door offers Leave on the action button while sets are left, instead of leaving on contact, and its ring is blue, not gold. This follows the author's wish for a button rather than things happening on proximity (G022) | Assistant, for review | mKnockabout D033 |
| G029 | 2026-11-07 | The clock, slots, line and list share one top area: the list sits under them standing up and beside them on a sideways phone, so neither covers the other. Slots wrap and shrink on narrow sideways phones. With reduced motion, the bonk's prop appears rather than slams, and nothing flattens or shakes | Assistant, for review | mKnockabout D033 |
| G030 | 2026-11-07 | Animals turn to face what they act on before acting. A needed animal gets a hopping gold "!", and parts for two at one place get their own rings with floor pictures and a matching mark by the carrier's head, while the button keeps one word. A dance gets its own short tune and a burst of stars | Assistant, from the author's notes after playing ("characters need directionality", "buddy character could jump and bring attention", "go kart wasnt intuitive for building, who's holding what") | mKnockabout D035 |
| G031 | 2026-11-07 | Things in the world match their models: a lit screen is cut from the screen it sits on, doors that open swing on their hinges, and the door ring sits in front of the door | Assistant, from the author's notes after playing | mKnockabout D034 |
| G032 | 2026-11-07 | The big box is a goal for two on the action button: Grab, a wait with the needed mark, then Drop on the ring, and a bear can do it alone. Searching uses Look everywhere, so the garage's boxes no longer use Dig. Things that pop out land where the camera sees them. The hands picture is two mitts. Art addresses change when the art does | Assistant, from the author's notes ("the grab the box activity doesnt prompt a button", "wouldnt search be better", "the gran one looks like to spatulas not hands") | mKnockabout D037 |
| G033 | 2026-11-07 | Marks sit over the head, and the camera eases back rather than move them aside. Dig steps aside so the find stays in view. Mix and Serve get their own moment ("Yum!"). A Dance is offered by the oven while it bakes, just for fun. A finished room needs Leave, and each room opens with a skippable look around it | Assistant, from the author's notes ("can the ! alert action ... move to on top of character", "no leave function button", "camera pan of the room") | mKnockabout D038 |
| G034 | 2026-11-07 | The big box's place is a square outline the box's size that turns gold while Drop would catch it, and Drop snaps the box in. Things a Grab goal wants get a gold ring on the floor, like goals with a button. The Ending gets the loading screen's animals hopping and waving goodbye, and a day that's used up opens on a resting "See you tomorrow" page instead of the menu | Author's notes ("should be square and snap into place", "the pump isn't highlighted", "end screen should have an animation like how loading screen has one"); the 10-minute day is the author's; the specifics are the assistant's | mKnockabout D040 |
| G035 | 2026-11-07 | Play waits for its moments. A room opens with the look around and an arrival tune with the clock and list hidden, then the list drops in and the clock starts. A finished set closes the list and lets its moment play (Mix, Serve, the box opening, a fanfare) before the next list drops in. A finished room has all three animals dance to the dance tune with stars ("Room done!"), then the door's ring ripples under a bobbing arrow. When an animal being waited on is off screen, the camera takes a short look at it and back, giving way to the stick. The bonk is the room's third animal swinging a squeaky toy hammer, and "BONK!" is a two-tone word in the room like "Yum!". Each action has its own sound | Author's notes and picks (the dance with all three animals, the third animal's hammer, a two-tone bonk word); the timings, the camera look and the sounds are the assistant's | mKnockabout D041 |
| G036 | 2026-11-08 | Knock is a button word, and a knock-off goal counts only on Knock; bumping still tips things for fun. Gold rings go on whatever a current goal acts on, and follow the animal you play: the things to fetch while your hands are free, then the place to bring one while you carry it. The needed "!" also shows on the empty-handed animal while the other carries what a Hold needs. Doors something comes out of swing shut by themselves afterwards | Author's notes and answers ("Button only for goals", the fridge swings shut and stays shut); the rest is the assistant's | mKnockabout D042 |
| G037 | 2026-11-08 | Nothing of play shows until a room's arrival ends: a 5.2 s pan and zoom with a two-phrase tune, then the day's one check-in (the first room only), then the list drops and the clock starts. Nap (floating Z's and a lullaby) and the flower's dance (all three animals) are set moments like Mix, which is now 3.4 s. Blocks and loose toys jump out of the opened box. The bonk hits only the animal you play, with a regular toy hammer, after the third animal jumps, and an "aww" tune; on two phones the host's animal | Author's notes and answers (who gets bonked, the check-in at day start, the plant dance with all three, what comes out of the box); timings and the two-phone bonk rule are the assistant's | mKnockabout D043 |
| G038 | 2026-11-10 | Developer-build tools exist only in a developer build, never a live one, and are plain Ring white on purpose so they never look like the game. Two 44px see-through buttons sit at the top right (a note pin and the tuning panel), moving to the thumb side when left-handed or upright, and never covering the stick, Hop, the action button or the switch. The note box is a top-centre card with a 16px text box, four area chips (logic, feel, sound, other) and a "Saved as N-###" toast, and the room holds still while it's open. The tuning panel has Timings, Sizes, Camera, Volumes, Tools and Rooms tabs with one 44px slider row per knob, and doesn't pause play. The room picker chooses a room, a set and a pair | Author's answers on the architecture memo (note pin to a folder on the Mac, typed or dictated notes, all four tuning groups); the layout is the assistant's | mKnockabout D045, D047 |

## Open questions

- Should a game lock to landscape, or keep both? Landscape looks closest to the references, while one-handed portrait play may suit a phone better.
- Should game menus stay in Ring, or move to their own mGame look? A character selector on the start screen would be a natural place to decide. Should a dark see-through look reach them?
- Does the blur hold its frame rate on phones? The author tried the game on a real phone and said it looked great, but frame rate wasn't measured. If it struggles, the blur is the first thing to drop, since the surfaces still pass contrast without it.
- `malverdesoftware-ui-check` was written for mUI. Should games get their own check?

## Changing this spec

Unlike mUI, this one should change as we learn. Add each new choice to the decision log, saying whose it is. Choices that aren't the author's stay marked for review until they are.
