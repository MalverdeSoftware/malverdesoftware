# Spec: mUI

Module id `ui` · November 5, 2026 · **Status: approved by the author on November 5.** Implemented by [`@malverdesoftware/ui`](../../packages/ui). The logo, its colors and the organization's name are in [DESIGN-ETHOS](../../brand/DESIGN-ETHOS.md), which this spec follows.

This line of work is called mUI, and it covers the apps. Games follow the [mGameUI spec](SPEC-game-ui.md) instead. The file, module id and package keep their names.

## Objective

Every MalverdeSoftware app should look and behave like the same family, on purpose, so that a participant moving from one to another has nothing new to learn, and so a new app starts from a settled base.

The direction comes from mVote and mPile: JetBrains Ring UI, Mona Sans, one accent color, flat surfaces, and screens built for phones first. The author chose it after the first builds looked too AI-generated, so **plain is the point**. When in doubt, leave it out.

Screens participants use come first. Researcher screens follow the same rules, but their controls can be mouse-sized.

"MUST" is a rule. "SHOULD" is the default, and departing from it needs a reason you can state.

## Foundations

- Apps MUST use [Ring UI](https://github.com/JetBrains/ring-ui) (Apache-2.0) for controls, with no second component or utility library (no Tailwind, shadcn, Radix, Material or icon sets other than `@jetbrains/icons`).
- Apps MUST use [Mona Sans](https://github.com/github/mona-sans) (SIL OFL 1.1).
- Apps MUST bundle both, so that no third party receives a request.
- Apps MUST pin exact versions: `@jetbrains/ring-ui-built` 7.0.133, `@jetbrains/icons` 5.24.0, `@fontsource-variable/mona-sans` 5.3.0. See [Changing this spec](#changing-this-spec).
- Light theme only for now. Nothing here has been checked in Ring's dark theme.

Load the stylesheets in this order, because later ones override earlier ones:

```js
import '@fontsource-variable/mona-sans/wght.css';
import '@jetbrains/ring-ui-built/components/style.css';
import '@malverdesoftware/ui/base.css';
import '@malverdesoftware/ui/accent-green.css'; // only for a green app
```

## Color

- All color MUST come from Ring's variables (`--ring-text-color`, `--ring-line-color`, and so on). Hard-coded colors are for data marks only, such as Vote's sticker dots. In a stylesheet, such a line carries the marker `ui-check: allow-color`.
- Each app has **one accent**, which the author chooses:

| Accent | App | How | White on the accent |
|---|---|---|---|
| Blue | Pile | Ring's default; nothing to set | 5.08:1 |
| Green | Vote | `accent-green.css` | 4.99:1 |

- Red means something destructive or an error, and nothing else.
- Don't give items decorative colors, such as a different color for each pile. Color carries meaning here or it stays out.
- Charts draw in the accent. A matrix shades one hue and flips its text to white only where that gives better contrast.
- The logo stays green in every app, whatever the accent. That green belongs to the mark ([DESIGN-ETHOS](../../brand/DESIGN-ETHOS.md)) and is separate from Vote's accent.

Ring's secondary text is 4.93:1 on white, so it's fine for reading. All of these figures are measured from Ring 7.0.133's light theme, and need rechecking on an upgrade.

## Type

| Use | Size / line height | Weight | Source |
|---|---|---|---|
| Body | 14 / 20px | 400 | Ring |
| Page title | 24 / 28px | 600 | `.page-narrow h1`, `.page-wide h1` |
| Working-screen title (pinned) | 18 / 24px | 600 | App |
| Section title | 16 / 24px | 600 | `h2` |
| Field a person types in, on touch screens | 16px | 400 | `.touch-input` |
| Footer | 12px | 400 | Ring |

- Don't use serif display type, all-caps labels, or letter-spaced "eyebrows". A line of context above a title is one quiet sentence-case line (`.secondary-text`).
- Don't go below 16px in a field on a touch screen: iOS zooms the whole page when one takes focus.

## Layout

- Every page sits in `Frame`: the app's name at the top left, a MalverdeSoftware link at the top right, and the footer. The top bar scrolls away.
- Single-column pages use `.page-narrow` (36rem). Researcher tables and results use `.page-wide` (72rem).
- Surfaces are flat: a 1px `--ring-line-color` border and an 8px radius (`.panel`). No shadows on page content, gradients, colored top borders or decorative icons. Grouping that needs a tint uses `--ring-sidebar-background-color`.
- Prefer one flat list to nested boxes, and don't add a card where spacing would do.

## Phones

Participants are often standing, on a phone, on poor wifi. On screens participants use:

- Layouts MUST work at 375px wide with no sideways scrolling.
- Anything tapped MUST be at least 44px (`.touch-button`, `.touch-input`, `.touch-menu`): Ring's largest control is 32px.
- Long lists SHOULD use compact rows, because each row's height is multiplied by the whole list. Vote's board has 84 items.
- What someone needs while working SHOULD stay pinned: the title, how far along they are, and whether their work saved.
- When two lists compete for a phone, show one at a time with a switch in the pinned area (Ring's `ButtonGroup`, with live counts), and put them side by side on a wide screen. Nothing should sit below a long list if people need to reach it while working through that list.
- Nothing may move under a finger: updates arriving live MUST NOT shift a control.
- Drag and drop can't be the only way to do something, because touch screens can't do it. Hide drag handles on touch screens (`.pointer-only`).

## Controls

| Need | Use | Notes |
|---|---|---|
| Main action | `Button primary` | One per view, usually |
| Other actions | `Button` | Bordered. With an icon, use `withIcon` |
| Quiet actions, like "Save now" or "What's this?" | `Button inline` | |
| Destructive, in a list | `Button inline danger` | Asks first, unless nothing would be lost |
| Text and numbers | `Input`, `Input multiline` | Give each a `label`, or an `aria-label` if it's self-evident |
| One of a few options | `Select` | `.touch-menu` on phones |
| Switching between two views | `ButtonGroup` of `Button active` | With `aria-pressed` |
| Sections of results | `Tabs` | |
| Message on the page | `Banner` | `ErrorMessage` for errors |
| Yes or no | `Checkbox` | |
| Waiting | `LoaderInline` with words | |
| Progress | `ProgressBar staticColor` | With a `label` |
| A count or short status | `.count-badge` | |
| Tables | Plain `<table>` on Ring's variables | Ring's table is built for selection and sorting |
| A range | `<input type="range">` with `accent-color` | Ring's slider names itself "Pick value" to screen readers, and can't be renamed |
| Choosing a file | `FileButton` | |
| Confirming | `ConfirmDialog`, `ConfirmButton` | See below |

Leave out arrows and other icons that only decorate a button.

## Confirmation

Getting this wrong loses people's data, so these are strict:

- Anything that can't be undone MUST ask first, in a `ConfirmDialog`, unless there's nothing to lose. Removing an empty pile doesn't ask.
- Focus MUST start on the cancel button, so that pressing Enter alone can't confirm. Ring's default focuses the first button, which is the action.
- A destructive action MUST be red and not primary. An action that's final but not destructive, like submitting, stays primary.
- Button labels MUST say what happens ("Remove and delete their data", "Keep Y03"), not "OK".
- The text MUST say what will be lost or kept.
- Don't use the browser's `confirm()`. `beforeunload` is fine for protecting unsaved work when a tab closes.

## Words

- The organization is one word: **MalverdeSoftware**. App names come from the `appName` prop and aren't written into shared code.
- Footers read "MalverdeSoftware · Indigenous-led software development". `Frame` provides this.
- Write plainly, for the person using the screen. Say what happened and what to do next. Name the exact state ("Saved", "Saved on this device. It will sync when you're back online.").
- Never reword what a participant wrote.

## App names

The apps are **mVote** and **mPile**, and every new app follows the same pattern.

- A name is a lowercase "m" and one short capitalized word that says what people do: mVote, mPile. Keep the "m" lowercase at the start of a sentence too.
- Domains are all lowercase, as `mvote.app`, and printed links MUST show the full address, because the `.com` versions of these names belong to others.
- The app's name goes at the top left. MalverdeSoftware stays at the top right and in the footer, so the organization's name isn't repeated in the app's.
- Before choosing a new name, check the domain, search the web, and search trademarks. Short names collide more often.
- Don't use a "mal" prefix: it means "bad" in Spanish and reads like malware in English.

## Accessibility

- Text and controls MUST meet WCAG AA contrast.
- Every control MUST have a name, and repeated controls MUST say what they act on ("Move Mi abuela to pile", not "Move").
- Status changes MUST be announced (`role="status"`, `role="alert"`).
- Everything MUST work with a keyboard. Keep focused controls clear of pinned headers with `scroll-margin-top`.

## Ring's surprises

Each of these has already caused a real problem.

| Ring does this | So |
|---|---|
| Reads `document` while its modules load, so importing it on a server is a 500 | Load Ring screens in the browser only. In Next-style apps use `dynamic(..., { ssr: false })`. The `.` entry of this package stays free of Ring, and `./controls` doesn't |
| The `icon` prop renders a borderless button that reads as a link | Pass the icon as a child (`withIcon`). A deliberately quiet button can keep the prop |
| `primary` overrides `danger`, so destructive buttons turn out blue | `primary={!danger}` (`ConfirmDialog` does this) |
| `Dialog` focuses its first button | `autoFocusFirst={false}` and `autoFocus` on the cancel button (`ConfirmDialog` does this) |
| `Dialog` has a desktop minimum width | `contentClassName="ui-dialog"` |
| `Input multiline` autogrows and ignores `rows` | `base.css` sets a minimum height. Give taller fields their own |
| `Select` type `BUTTON` shows the current value and takes the full width | For a compact trigger, use `Select.Type.CUSTOM` with `customAnchor` |
| Scrolling closes an open `Select` menu, and its options have no `role="option"` | In browser tests, click `[data-test~="ring-list-item-action"] .ring-list-label` in place |
| Without Tailwind's reset, some browser defaults return | `base.css` sets `box-sizing`, margins and link styles. Check for underlines and lost spacing when moving an app over |
| Tests under Node can't resolve its extensionless imports, and jsdom has no `matchMedia` | Inline it in Vitest (`server.deps.inline`) and stub `matchMedia`. See this package's test setup |
| The bundle mentions `https://fb.me` in a warning, from `react-lifecycles-compat` | Never requested. Allow it in any check on outside addresses |

## Conformance

`malverdesoftware-ui-check` is the part of this spec a script can check: exact versions, no second UI library, no hard-coded colors or other fonts in stylesheets, and the name as one word. Apps SHOULD run it in `verify`.

The rest needs eyes. Before merging a change to a screen:

- [ ] Works at 375px with no sideways scrolling, and tapped controls are 44px
- [ ] One accent, and red only for destructive actions and errors
- [ ] Nothing the spec says to leave out: all caps, shadows, decorative color or icons
- [ ] Anything irreversible asks first and starts on cancel
- [ ] Repeated controls have names that say what they act on
- [ ] Works with a keyboard, with no console errors

## Changing this spec

This spec should change rarely, and on purpose.

- The author approves changes to this document, as with the other specs here.
- A Ring, icon or font upgrade is one change across all apps. Update the pins in `packages/ui` and here, recheck the contrast figures and [Ring's surprises](#rings-surprises), and look at both apps' screens before releasing.
- A new control or pattern goes in here when a second app needs it. Until then, it stays in the app.
- A package change gets a new version, as in [CONSUMING](../CONSUMING.md).

## Examples

Reference builds in the public app repositories, pinned so these links stay valid:

| | mVote | mPile |
|---|---|---|
| Accent | [green, `styles.css`](https://github.com/MalverdeSoftware/mvote/blob/311dbc3512aa53b6bc4af2ab98f0b7ca7d1a1933/webapp/src/styles.css) | [blue, `globals.css`](https://github.com/MalverdeSoftware/mpile/blob/df2243ee69479c390cad25324763012e280cc670/app/app/globals.css) |
| Long list on a phone | [`ItemCard.jsx`](https://github.com/MalverdeSoftware/mvote/blob/311dbc3512aa53b6bc4af2ab98f0b7ca7d1a1933/webapp/src/components/ItemCard.jsx) | [`sort-board.tsx`](https://github.com/MalverdeSoftware/mpile/blob/df2243ee69479c390cad25324763012e280cc670/app/components/participant/sort-board.tsx) |
| Pinned working header | [`VotingBoard.jsx`](https://github.com/MalverdeSoftware/mvote/blob/311dbc3512aa53b6bc4af2ab98f0b7ca7d1a1933/webapp/src/components/VotingBoard.jsx) | [`sort-workspace.tsx`](https://github.com/MalverdeSoftware/mpile/blob/df2243ee69479c390cad25324763012e280cc670/app/components/participant/sort-workspace.tsx) |
| Researcher screens | None | [`components/console`](https://github.com/MalverdeSoftware/mpile/tree/df2243ee69479c390cad25324763012e280cc670/app/components/console) |

## Adoption

Both apps install `@malverdesoftware/ui` from npm (0.1.1) and run `malverdesoftware-ui-check` in `verify`. New apps start from the package, as in [CONSUMING](../CONSUMING.md).

Before the apps adopted the package, `.ui-dialog` was `.pile-dialog`, `.touch-menu` was `.pile-menu`, and `.count-badge` was Vote's `.dot-budget`.
