# Notifications

The plan for telling the user that something finished while they were not
looking at it — **B7** in [`build-plan.md`](build-plan.md), and the whole of
the notification system around it.

---

## 1. What this is for

The app is one window. When a reply is being written, the answer is on screen
and the user can read it as it arrives. The moment the app is not in front —
another application is, or another tab is — the answer is happening somewhere
the user cannot see, and the only way they find out is by coming back and
looking.

A notification is that: a sentence from the operating system saying the reply
is there.

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

## 2. When a notification is shown

All three have to be true.

1. **A reply finished.** Not stopped, not failed, not a summary.
2. **Notifications are on.** The setting.
3. **The user is not looking at the app** — or they asked to be told anyway.

### "Not looking at the app", today

The app can ask the window whether it has focus. On the desktop that is the
window's own focus state; in a browser it is the document's focus and its
visibility.

**This is the rule that can fire today, and it is worth being honest about
why.** A reply that is being written is aborted the moment the user opens
another conversation or switches sides — the composer owns one stream, and
switching threads stops it. So a reply can only finish while the app is in
front, and the only way to be *not* looking at it is to be in another
application.

That is a real case — it is the case of a long answer that takes two minutes
while you are in your editor — and it is the case the notification is for.

**When the conversation runtime arrives** (Layer 2 of the build plan), a reply
keeps running while another conversation is open, and the rule becomes
**"this conversation is not the one on screen"**. That is a wider rule and it
covers the case of watching one conversation while another finishes. The
notification code does not change: the runtime owns the answer, and the
runtime asks.

So the rule is written once, as *"is this conversation the one being looked
at?"*, and it is answered by the thing that owns the conversation.

### The three cases, and what each does

| Case | What happens |
|---|---|
| The app is in the background | **Notify.** The user cannot see the answer. |
| The app is in front, and this is the conversation on screen | **Do not notify** — unless "also when the app is in front" is on. The answer is on screen. |
| The app is in front, but this is another conversation | **Notify.** This is the runtime's case; today it cannot happen. |

---

## 3. The settings

**Settings → General → Notifications.** The group already exists with four
rows; two of them are about a service this app does not have, and one of
those two is this.

| Row | Type | Default | What it says |
|---|---|---|---|
| **Response completions** | switch | **on** | *"Tell me when a reply finishes while the app is in the background."* |
| **Also when the app is in front** | switch | **off** | *"Tell me even when the answer is on screen."* Disabled while the first is off, because the two would otherwise contradict each other. |
| **Show a preview** | switch | **on** | *"Put the first line of the answer in the notification."* Disabled while the first is off. |

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

### The three rows that are not about this

**Mentions and replies**, **Comments on your artifacts** and **Artifacts
shared with you** are about an account, a shared service and email. This app
has no accounts, nothing to share and no mail. They stay off, and their
reason is rewritten to say that — *"There is no account and nothing to share,
so there is nothing to be mentioned in"* — rather than the generic *"Not
built yet"*, which is true but says nothing about what is missing.

---

## 4. What the notification says

| | |
|---|---|
| **Title** | The conversation's name. *"What is the weather?"* |
| **Body** | The first line of the answer, when the preview is on. *"It is raining, and it will"* |
| **Body**, preview off | *"The reply is ready."* |

**The title is the conversation, not the app.** A toast that says only "A
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

## 5. The work

### Back-end — B7

| | Task | Where |
|---|---|---|
| ⬜ | The plugin | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` |
| ⬜ | The permission | `src-tauri/capabilities/default.json` |
| ⬜ | The adapter | `src/lib/desktop.ts` |
| ⬜ | The browser's own | `src/lib/web.ts` |
| ⬜ | The seam | `src/lib/api.ts` |

**The permission is narrow.** The plugin's default set allows every command
it has — batch, channels, actions, listeners. This app needs three:
`allow-is-permission-granted`, `allow-request-permission` and `allow-notify`.
The capability file already lists narrow permissions for the other plugins
(`dialog:allow-open`, `opener:allow-open-url`), and a permission nobody
asked for is a permission nobody has thought about.

### Front-end

| | Task | Where |
|---|---|---|
| ⬜ | The preferences | `src/lib/notifications.ts` |
| ⬜ | The rule — is this conversation the one being looked at? | same |
| ⬜ | The permission, asked at the right moment | same |
| ⬜ | The rows | `src/blocks/shell/settings-general.tsx` |
| ⬜ | Asking for the reply to be announced | the composer, or the runtime |

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

### Where the reply is announced from

**Today: the composer.** The composer is what holds the reply, and the
composer is what knows it finished.

**Later: the runtime.** The runtime owns the answer, and the runtime asks.
The call is one function — *"this reply finished, for this conversation"* —
and it does not change.

---

## 6. What it cannot do, and what is said about it

| | |
|---|---|
| **On Windows, a toast only works for an installed app.** | The plugin says so: *"Only works for installed apps. Shows powershell name & icon in development."* A development build shows a toast from powershell, with powershell's icon. This is the operating system's rule about which applications may raise a toast, not something the app can work around. |
| **Clicking the notification does not open the conversation.** | The plugin's action API is mobile-only. The toast brings the app to the front, which is the operating system's doing, and the app opens what it had open. |
| **A browser tab that is closed gets no notification.** | The browser's notification API is the tab's own, and a closed tab is not there to raise one. A notification that survives the tab would need a push service and a service worker — a different thing entirely, and one the website's server would have to carry. |
| **A notification is not a badge.** | The rail already says "Running" while a reply is being written, and says nothing when it is over. A badge that says "finished" would be a second signal saying the same thing, and the research is explicit that a completion badge should not be promised as a signal. It becomes worth having when there are several conversations at once, and not before. |

---

## 7. Tests

### TypeScript

- The rule: a reply that finished, the setting on, and the app not in front →
  notify. Each of the three false → do not notify.
- The setting: turning it on asks the operating system; a refusal puts the
  setting back off.
- The preview: the first line of the answer, cut at a line break and at a
  sensible length; the body without it.
- The title: the conversation's name, cut to a sensible length.

### Rust

- The plugin is registered and the three permissions are in the capability.

---

## 8. The order

1. The plugin, the permission, the adapters, the seam.
2. The preferences and the rule.
3. The rows in the settings, and the permission asked at the right moment.
4. The composer announcing the reply.
5. The tests, and the notes in the README and in `docs/storage.md`.

---

## 9. Where this sits

| | |
|---|---|
| **B7** in [`build-plan.md`](build-plan.md) | The plugin, the permission, the adapter, the seam, the rows, and the rule |
| **Layer 6** of the build plan | *"Saying that something finished"* — this is it |
| **Layer 2** | The runtime takes over the announcing, and the rule widens from "the app is in front" to "this conversation is on screen" |

---

## 10. What was built

| | Where |
|---|---|
| The plugin | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` |
| The permission | `src-tauri/capabilities/default.json` — three commands, not the plugin's whole default set |
| The desktop adapter | `src/lib/desktop.ts` — the plugin's own API, and the window's focus |
| The browser adapter | `src/lib/web.ts` — the browser's own API, and the document's focus and visibility |
| The seam | `src/lib/api.ts` |
| The preferences, the rule and the wording | `src/lib/notifications.ts` |
| The rows | `src/blocks/shell/settings-general.tsx` |
| Announcing the reply | `src/blocks/prompt-input/prompt-block.tsx` — the success path of `respondReal` |

### The choices that were made along the way

- **The permission is asked for when the setting is turned on**, and not at
  launch. A permission asked for before the reader knows what it is for is a
  permission asked for before the question. If it is refused, the setting
  goes back off and says so — a switch that reads "on" and does nothing is
  the one thing worse than a switch that reads "off".
- **Three switches rather than one control.** *Whether* to be told and *how
  much* to be told are two questions, and somebody who wants a preview in the
  background and none in the foreground cannot say so in one switch. The
  second and the third are disabled while the first is off, because the two
  would otherwise contradict each other.
- **The title is the conversation, not the app.** A toast that says only "a
  reply finished" tells the reader nothing when there is more than one
  conversation, and the whole point is knowing which one to come back to.
- **The preview is the first line, not the first paragraph.** A toast is read
  at a glance, and a paragraph in a toast is a paragraph on the lock screen.
- **The three rows that are not about this now say what is missing.** Mentions,
  comments and sharing all need an account, a place where things are shared
  and a mail server. The app has none of the three, and the rows say so
  rather than the generic "not built yet", which is true of everything and so
  says nothing about any of them in particular.
- **The notification is not a badge.** The rail already says "Running" while
  a reply is being written. A second marker saying the same thing would be
  two signals for one fact, and a completion badge becomes worth having when
  there are several conversations at once — and not before.

### What is left

**The wider rule.** Today a reply is stopped the moment another conversation
is opened, so the only way to be *not* looking at a finished reply is to be
in another application. When the conversation runtime arrives, the rule widens
to "this conversation is not the one on screen", which is the case of watching
one conversation while another finishes.

The rule is written once — in `shouldAnnounce` — and the runtime answers it.
The call from the composer becomes a call from the runtime, and nothing else
changes.

