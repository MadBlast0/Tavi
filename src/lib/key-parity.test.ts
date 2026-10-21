import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

/**
 * The two builds render the same screen.
 *
 * "The same screen" is compared by what is drawn, not by what a user sees:
 * the pixels of a Tauri window and of a browser tab are not comparable — the
 * rendering engines differ, the display scaling differs, and a screenshot
 * diff would fail on all three. What *is* comparable is the structure: the
 * same controls, with the same names, in the same order, carrying the same
 * state.
 *
 * So the pane is drawn twice — once as the desktop draws it and once as the
 * website does — and the two are compared. The one thing that is allowed to
 * differ is the sentence that says where the key is kept, and the test says
 * so by name.
 *
 * The pane is a component, so this needs a loader that can read a `.tsx`
 * file. Vite is already a dependency and already knows how to transform one,
 * so it is used for that and nothing else: no new runner, and no new
 * dependency.
 *
 * It is slow — most of a minute, in loading React and the component library
 * into Node for the first time — and it is slow once, not once per test.
 */

/** The component under test, and the note each build shows. */
let KeyPane: (props: Record<string, unknown>) => React.ReactElement;
let DESKTOP_NOTE: string;
let WEB_NOTE: string;

let vite: ViteDevServer;

before(async () => {
  vite = await createServer({
    /* The project's own plugins are not needed to read a component, and the
       assistant-ui plugin does things that have no place in a test. */
    configFile: false,
    root: join(import.meta.dirname, "..", ".."),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    resolve: {
      alias: {
        "@": join(import.meta.dirname, ".."),
      },
    },
  });

  const module = (await vite.ssrLoadModule(
    "/src/blocks/shell/settings-keys.tsx",
  )) as {
    KeyPane: (props: Record<string, unknown>) => React.ReactElement;
    DESKTOP_NOTE: string;
    WEB_NOTE: string;
  };
  KeyPane = module.KeyPane;
  DESKTOP_NOTE = module.DESKTOP_NOTE;
  WEB_NOTE = module.WEB_NOTE;
});

after(async () => {
  await vite?.close();
});

/** A key, as the pane is given one. */
const key = (over: Record<string, unknown> = {}) => ({
  id: "key_01",
  provider: "openrouter",
  providerLabel: "OpenRouter",
  name: "Work key",
  nameIsDefault: false,
  createdAt: 1_760_000_000,
  updatedAt: 1_760_000_000,
  lastUsedAt: null,
  maskedValue: "sk-or-v1-…-890",
  source: "keyring",
  active: true,
  valid: true,
  checkReason: null,
  checkedAt: 1_760_000_000,
  account: "sk-or-v1-au7…890",
  organizationId: null,
  workspaceId: null,
  creatorUserId: null,
  expiresAt: null,
  limit: null,
  limitRemaining: null,
  limitReset: null,
  limitCurrency: null,
  usage: null,
  usageInWindow: null,
  isFreeTier: false,
  ...over,
});

/** The pane, as one build draws it. */
const draw = (held: boolean, keys: Record<string, unknown>[]) =>
  renderToStaticMarkup(
    React.createElement(KeyPane, {
      keys,
      held,
      label: "API keys",
      tall: false,
      loading: false,
      onAdd: () => {},
      onRename: () => {},
      onReplace: () => {},
      onRemove: () => {},
      onChanged: () => {},
    }),
  );

/** The pane, with the one difference the registry allows taken out. */
const withoutNote = (markup: string) =>
  markup.replace(
    /<p data-slot="api-keys-note"[^>]*>[\s\S]*?<\/p>/,
    "<p>the note</p>",
  )

test("the two builds draw the same screen", () => {
  const desktop = draw(true, [key()]);
  const web = draw(false, [key()]);

  /* The one difference the registry records: where the key is kept. */
  assert.notEqual(desktop, web, "the two builds should differ somewhere");
  assert.ok(desktop.includes("credential store"));
  assert.ok(web.includes("this computer&#x27;s server"));

  assert.equal(
    withoutNote(desktop),
    withoutNote(web),
    "the two builds should draw the same screen apart from the note",
  );
});

test("the empty state is the same in both builds", () => {
  const desktop = draw(true, []);
  const web = draw(false, []);

  assert.equal(withoutNote(desktop), withoutNote(web));
  assert.ok(desktop.includes("No API keys yet"));
});

test("a key that is kept somewhere else is drawn the same in both builds", () => {
  /* A key in the development file and a key in the server's environment are
     the same kind of thing — a key the app is using that cannot be changed
     from here — and they are drawn the same way. */
  const desktop = draw(true, [key({ source: "dev-file" })]);
  const web = draw(false, [key({ source: "env" })]);

  const shape = (markup: string) =>
    markup.replace(/From [^<·]*/g, "From somewhere").replace(/>[^<]*<\/p>/g, "><\/p>");

  assert.equal(shape(desktop), shape(web));
  assert.ok(desktop.includes("From .env.local"));
  assert.ok(web.includes("From the environment"));
});

test("every row's menu names the key it belongs to", () => {
  const markup = draw(true, [key({ name: "Work key" })]);

  /* The row carries one control, and it says which key it acts on. The
     actions themselves live in the menu, which is not in the tree until it is
     opened — so the name is on the thing that opens it. */
  assert.ok(
    markup.includes('aria-label="Actions for Work key"'),
    "the row's menu should say which key it belongs to",
  );
  assert.ok(
    !markup.includes('aria-label="Remove Work key"'),
    "the row should carry one control, not a row of buttons",
  );
});

test("the rows are a list", () => {
  const markup = draw(true, [key()]);
  assert.ok(markup.includes('role="list"'), "the group should be a list");
  assert.ok(markup.includes('role="listitem"'), "the rows should be items");
});

test("the key in use is marked, and only one of them is", () => {
  const one = draw(true, [key()]);
  assert.ok(one.includes("In use"));

  const two = draw(true, [
    key({ id: "key_01", active: true }),
    key({ id: "key_02", name: "Personal", active: false }),
  ]);
  const marked = two.match(/In use/g) ?? [];
  assert.equal(marked.length, 1, "exactly one key should be marked as in use");
});
