# Notifications

Telling the user that something finished while they were not looking at it —
**B7** in [`build-plan.md`](build-plan.md), and the whole of the notification
system around it.

**This is the design of the system as it is built.** The record of how it
came about is at the end.

---

## 1. What this is for

The app is one window. When a reply is being written, the answer is on screen
and the user can read it as it arrives. The moment the app is not in front —
another application is, or another tab is — the answer is happening somewhere
the user cannot see, and the only way they find out is by coming back and
looking.

A notification is that: a sentence saying the reply is there.

Three things are meant by it, and it is worth being precise about which is
which, because the reference app this was drawn on is not:

| | |
|---|---|
| **A reply ended** | The model stopped writing. The turn is over. |
| **The task is finished** | Everything the reply was for is done. |
| **The task needs you** | Something in the reply is waiting on a person. |

**Only the first of those is knowable here.** The app knows when the provider
stopped sending text. It does not know whether the answer's "I'll run the
tests and fix what fails" was followed by anything, because the app cannot
write files and the model cannot run commands. A notification that said "Task
finished" would be a claim the app cannot support.

So a notification says a **reply finished**, and the wording says exactly
that.

### The lesson from the reference

The reference app is reported to notify on **every turn-end**, including
intermediate ones while a workflow is still going, and the request on its
tracker is for a setting that distinguishes "a turn ended" from "the session
is fully finished or needs me". That is a request this app can partly
answer: the wording here never claims more than "a reply finished", and the
setting below lets the reader choose when to be interrupted at all.

---

## 2. When a reply is announced

All three of these have to be true.

1. **A reply finished.** Not stopped, not failed, not a summary.
2. **Notifications are on.** The setting, and the conversation is not muted.
3. **The answer was not somewhere the reader could see** — or they asked to
   be told either way.

### "Somewhere the reader could see"

Two things have to be true, and both are needed:

- **the app is in the front**, and
- **this conversation is the one on screen**.

A conversation the composer is showing is not visible while the app is behind
another window. That is the ordinary case: the answer is on the screen, and
the screen is somewhere else.

**Today the second half cannot be false while the first is true.** A reply is
stopped the moment another conversation is opened, so a reply can only end
while it is the one on screen. The rule is nevertheless written in the wider
form, because when the conversation runtime arrives (Layer 2 of the build
plan) a reply keeps running while another conversation is open, and the rule
does not change — only what answers it.

The rule is written once, as *"is this conversation the one being looked
at?"*, and it is answered by the thing that owns the conversation.

### The three cases, and what each does

| Case | What happens |
|---|---|
| The app is in the background | **Announce.** The user cannot see the answer. |
| The app is in the front, and this is the conversation on screen | **Do not announce** — unless "also when the app is in front" is on. The answer is on screen. |
| The app is in the front, but this is another conversation | **Announce.** This is the runtime's case; today it cannot happen. |

### A reply that was stopped is not announced

The reader pressed the button. They know. A stopped answer is not a result
and not a problem, and telling them about it would be telling them something
they did a moment ago.

### A reply that failed is not announced either

The failure is written into the conversation, in the place where the answer
would have been, with the reason in it. It is on the screen when the reader
comes back, and it says what happened. A second channel saying the same thing
would be two signals for one fact.

---

## 3. Where the announcement goes

**Where the reader is decides where the announcement goes.**

| The reader is | They get |
|---|---|
| In another application, or on another tab | **A toast from the operating system.** The app is the only thing that can reach them, and the operating system is the only thing that can reach out of the app. |
| In the app | **A card inside the app.** They are here; the app can reach them without asking the operating system for anything. |

One rule, two destinations, and **no announcement that arrives twice**.

The card is at the top of the window, under the title bar, because the bottom
of the window belongs to the composer and a card that covered the thing the
reader was typing in would be a card in the wrong place.

**The card can be acted on and the system's toast cannot.** The plugin's
action API is mobile-only, so a system's toast brings the app to the front
and no further. The card has an **Open** button, and it opens the
conversation the announcement is about.

---

## 4. What the announcement says

| | |
|---|---|
| **Title** | The conversation's name. *"What is the weather?"* |
| **Body** | The first line of the answer, when the preview is on. *"It is raining, and it will"* |
| **Body**, preview off | *"A reply finished."* |

**The title is the conversation, not the app.** A toast that says only "a
reply finished" tells the reader nothing when there are several
conversations, and the whole point is knowing *which* one to go back to.

**The preview is the first line, not the first paragraph.** A toast is read
at a glance, and a paragraph in a toast is a paragraph on the lock screen.
The first line is cut at a line break and at a sensible length.

**The preview is on by default, and it is said so.** The setting's own
description names what is shown, and the answer is the user's own text going
to the operating system's own notification centre — which is the same place
the app's own title would go. Turning it off is one switch.

---

## 5. The settings

**Settings → General → Notifications.**

| Row | Type | Default | What it says |
|---|---|---|---|
| **Response completions** | switch | **on** | *"Tell me when a reply finishes and the answer is not on screen."* |
| **Also when the app is in front** | switch | **off** | *"Tell me even when the answer is on screen."* Disabled while the first is off, because the two would otherwise contradict each other. |
| **Show a preview** | switch | **on** | *"Put the first line of the answer in the notification."* Disabled while the first is off. |
| **Test notification** | button | — | *"Send one now, to see whether your system will show it."* |

### Why three switches and not one control

The two questions are different: *whether* to be told, and *how much* to be
told. A single three-position control would answer both at once, and the
second question is worth asking on its own — someone who wants a preview in
the background and none in the foreground cannot say so in one switch.

The switches are also the shape the row already has, and the shape the rest
of the settings card uses.

### The default

**On.** A reply that takes two minutes and the app is in the background is
exactly the case a notification is for, and a user who does not want it can
turn it off. The default is the helpful one, and it is visible in a place
that says what it does.

### The test row is not a decoration

A notification is raised by the operating system and not by the app, and the
operating system may decline — on Windows only an *installed* app may raise
one, and a development build is not installed. Without a way to ask, the
reader is left guessing whether the app is broken or the system is saying
no.

The test raises the system's own toast **and** the app's own card, and the
card says what to look for: *"If nothing appeared outside the app, the
system did not show one."*

### The three rows that are not about this

**Mentions and replies**, **Comments on your artifacts** and **Artifacts
shared with you** are about an account, a shared service and email. This app
has no accounts, nothing to share and no mail. They stay off, and their
reason is rewritten to say that — *"There is no account and nothing to share,
so there is nothing to be mentioned in"* — rather than the generic *"Not
built yet"*, which is true but says nothing about what is missing.

---

## 6. The conversation's own record

Two things live on the conversation itself, and neither is a notification.

### The badge that says there is something you have not looked at

A conversation whose reply finished while the reader was elsewhere says
**New** in the rail, until it is opened.

**It is the app's own record, and it does not depend on the operating
system.** On Windows a development build cannot raise a toast at all, and a
browser tab that is closed gets none; the badge is the half of the system
that always works. It is set when the answer was not visible and cleared when
the conversation is opened, which is what "looking at it" means.

It follows the **Response completions** switch, because a reader who has
turned notifications off does not want to be told about a reply in any form —
and a badge that said "New" to someone who had asked not to be told would be
telling them.

### The mute

A conversation can be muted from its own menu — **Mute**, beside **Pin**. A
muted conversation is never announced.

**Muting is about being interrupted, not about the thread.** A muted
conversation still runs, and its reply still lands in it. The reader simply
does not want to be interrupted about it, which is a different thing from not
wanting the answer. The rail shows a crossed-out bell so the state is never
a surprise.

**A muted conversation is not marked either.** The mark says "New" beside the
conversation's name, and a reader who muted the conversation has said they do
not want to be nudged about it. The reply still lands in it, and the
conversation's own timestamp still moves.

---

## 7. The work

### Back-end — B7

| | Task | Where |
|---|---|---|
| ✅ | The plugin | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` |
| ✅ | The permission | `src-tauri/capabilities/default.json` |
| ✅ | The adapter | `src/lib/desktop.ts` |
| ✅ | The browser's own | `src/lib/web.ts` |
| ✅ | The seam | `src/lib/api.ts` |

**The permission is narrow.** The plugin's default set allows every command
it has — batch, channels, actions, listeners. This app needs three:
`allow-is-permission-granted`, `allow-request-permission` and `allow-notify`.
The capability file already lists narrow permissions for the other plugins
(`dialog:allow-open`, `opener:allow-open-url`), and a permission nobody
asked for is a permission nobody has thought about.

### Front-end

| | Task | Where |
|---|---|---|
| ✅ | The preferences, the rule and the wording | `src/lib/notifications.ts` |
| ✅ | The card, and the bridge that shows it | `src/blocks/shell/announce-bridge.tsx` |
| ✅ | Opening a conversation from anywhere | `src/lib/open-thread.ts` |
| ✅ | The badge and the mute | `src/lib/threads.ts`, `src/lib/chats.ts`, `src/lib/sessions.ts` |
| ✅ | The rows | `src/blocks/shell/settings-general.tsx` |
| ✅ | The rail's badge, and the crossed-out bell | `src/blocks/shell/sidebar-nav.tsx` |
| ✅ | **Mute** in the conversation's menu | `src/blocks/shell/thread-context-menu.tsx` |
| ✅ | Asking for the reply to be announced | `src/blocks/prompt-input/prompt-block.tsx` |

### The permission, and when it is asked for

**When the reader turns the setting on**, not when the app starts. A
permission asked for at launch is a permission asked for before the reader
knows what it is for, and the answer they give is the answer to a question
they were not asked.

So turning **Response completions** on asks the operating system. If it is
refused, the setting goes back off and says so — a switch that reads "on" and
does nothing is the one thing worse than a switch that reads "off".

**On Windows** the operating system does not ask: a toast is a toast. The
plugin reports permission as granted and the toast is delivered or not.

---

## 8. What it cannot do, and what is said about it

| | |
|---|---|
| **On Windows, a toast only works for an installed app.** | The plugin says so: *"Only works for installed apps. Shows powershell name & icon in development."* A development build shows a toast from powershell, with powershell's icon. This is the operating system's rule about which applications may raise a toast, not something the app can work around. **The app's own card and the rail's badge still work**, which is why the system has three parts and not one. |
| **Clicking the system's toast does not open the conversation.** | The plugin's action API is mobile-only. The toast brings the app to the front, which is the operating system's doing, and the app opens what it had open. The card inside the app *does* open the conversation, and that is the half of the system the app controls. |
| **A browser tab that is closed gets no notification.** | The browser's notification API is the tab's own, and a closed tab is not there to raise one. A notification that survives the tab would need a push service and a service worker — a different thing entirely, and one the website's server would have to carry. |
| **A notification says a reply finished, and nothing more.** | The app knows when the provider stopped sending text. It does not know whether the answer's "I'll run the tests and fix what fails" was followed by anything. So the wording is never "the task is finished". |
| **There is no notification history.** | A finished reply leaves a mark on its conversation, and that is where the record is. A second list of everything the app has ever announced would be a second place for a conversation to be, and a conversation in two places is a conversation in one. |

---

## 9. Tests

### TypeScript

- The rule: a reply that finished, the setting on, and the answer not
  visible → announce. Each of the three false → do not announce.
- The mute: a muted conversation is never announced, whatever else is true.
- The mark: set when the answer was not visible, not set when it was, and
  not set at all when the setting is off.
- The settings: turning it on asks the operating system; a refusal puts the
  setting back off.
- The preview: the first line of the answer, cut at a line break and at a
  sensible length; the body without it.
- The store: the mark is the conversation's own, it survives a restart, and
  it is cleared when the conversation is looked at. Muting one conversation
  does not mute another.

### Rust

- The plugin is registered and the three permissions are in the capability.

---

## 10. Where this sits

| | |
|---|---|
| **B7** in [`build-plan.md`](build-plan.md) | The plugin, the permission, the adapter, the seam, the rows, and the rule |
| **Layer 6** of the build plan | *"Saying that something finished"* — this is it |
| **Layer 2** | The runtime takes over the announcing, and the rule widens from "the app is in the front" to "this conversation is on screen" |

---

## 11. What was built

| | Where |
|---|---|
| The plugin | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` |
| The permission | `src-tauri/capabilities/default.json` — three commands, not the plugin's whole default set |
| The desktop adapter | `src/lib/desktop.ts` — the plugin's own API, and the window's focus |
| The browser adapter | `src/lib/web.ts` — the browser's own API, and the document's focus and visibility |
| The seam | `src/lib/api.ts` |
| The preferences, the rule and the wording | `src/lib/notifications.ts` |
| The card, and the bridge that shows it | `src/blocks/shell/announce-bridge.tsx` |
| Opening a conversation from anywhere | `src/lib/open-thread.ts` |
| The badge, the mute, and the conversation whichever side it is on | `src/lib/threads.ts`, `src/lib/chats.ts`, `src/lib/sessions.ts`, `src/lib/conversations.ts` |
| The rows, and the test | `src/blocks/shell/settings-general.tsx` |
| The rail's badge, and the crossed-out bell | `src/blocks/shell/sidebar-nav.tsx` |
| **Mute** in the conversation's menu | `src/blocks/shell/thread-context-menu.tsx` |
| Announcing the reply | `src/blocks/prompt-input/prompt-block.tsx` |

### The choices that were made along the way

- **The rule is written once**, in `shouldAnnounce`, and it takes what the
  caller knows rather than going and looking for it. The composer answers
  "is this the conversation on screen"; the runtime will answer the same
  question the same way.
- **The card is inside the app and the toast is outside it**, and which one
  you get depends on where you are. One rule, two destinations, and nothing
  that arrives twice.
- **The card is asked for by an event on the window**, the same way the
  settings card is opened, because the card is a component and the module
  that decides is read by tests that run without a DOM.
- **The permission is asked for when the setting is turned on**, and not at
  launch, and a refusal puts the setting back off.
- **Three switches rather than one control.** *Whether* to be told and *how
  much* to be told are two questions, and somebody who wants a preview in
  the background and none in the foreground cannot say so in one switch.
- **The title is the conversation, not the app.** A toast that says only "a
  reply finished" tells the reader nothing when there is more than one
  conversation, and the whole point is knowing which one to come back to.
- **The preview is the first line, not the first paragraph.**
- **The badge follows the switch.** A reader who has turned notifications
  off does not want to be told about a reply in any form, and a badge that
  said "New" would be telling them.
- **The mute is per conversation, and it is about being interrupted** — not
  about the thread, which still runs and still keeps its answer.
- **The three rows that are not about this now say what is missing.**
  Mentions, comments and sharing all need an account, a place where things
  are shared and a mail server, and this app has none of the three.
- **The notification is not a badge, and the badge is not a notification.**
  They are different facts about different things: one is an interruption,
  the other is a record.

### What is left

**The wider rule.** Today a reply is stopped the moment another conversation
is opened, so the only way to be *not* looking at a finished reply is to be
in another application. When the conversation runtime arrives, the rule
widens to "this conversation is not the one on screen", which is the case of
watching one conversation while another finishes.

The rule is written once — in `shouldAnnounce` — and the runtime answers it.
The call from the composer becomes a call from the runtime, and nothing else
changes.
