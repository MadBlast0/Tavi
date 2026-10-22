import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The layout and the scroll boundaries, checked.
 *
 * The app's height is a chain, and the chain has one rule: the window's
 * height is decided once, near the top, and everything below it is either
 * measured against that or allowed to shrink. A link that takes its height
 * from its own content instead is where the window grows a scrollbar — a
 * conversation is long, or a pane has a file in it, and the whole app starts
 * to move because one region in the middle of it forgot to scroll.
 *
 * The rules are here rather than in a comment because a rule nobody checks
 * is a rule that is broken by the next pane.
 *
 * What it catches, and what it caught when it was written: the work area
 * took its height from the shell's `min-h-svh`, which is a floor and not a
 * height, so a workspace with a pane taller than the window made the window
 * itself scroll. The work area now states the window's height and clips what
 * does not fit, and these are the tests that keep it that way.
 */

/** Where the files that hold the chain are. */
const SHELL = join(import.meta.dirname, "..", "blocks", "shell", "shell.tsx");
const STYLESHEET = join(import.meta.dirname, "..", "index.css");
const TITLE_BAR = join(import.meta.dirname, "..", "blocks", "shell", "title-bar.tsx");
const SURFACE = join(
  import.meta.dirname,
  "..",
  "blocks",
  "prompt-input",
  "prompt-block.tsx",
);
const SCROLLER = join(
  import.meta.dirname,
  "..",
  "components",
  "message-scroller",
  "message-scroller.tsx",
);
const REGION = join(
  import.meta.dirname,
  "..",
  "blocks",
  "workspace",
  "workspace-host.tsx",
);

const shellSource = readFileSync(SHELL, "utf8");
const stylesheetSource = readFileSync(STYLESHEET, "utf8");
const titleBarSource = readFileSync(TITLE_BAR, "utf8");
const surfaceSource = readFileSync(SURFACE, "utf8");
const scrollerSource = readFileSync(SCROLLER, "utf8");
const regionSource = readFileSync(REGION, "utf8");

/**
 * The heights that mean "the window".
 *
 * `svh` is the one the app uses: it is the height of the window with the
 * least room taken away, so the layout does not change when the platform's
 * own furniture appears and disappears.
 */
const VIEWPORT_HEIGHTS = ["h-svh", "h-dvh", "h-lvh", "h-screen"];

/** The class list of the element whose opening tag holds this marker. */
function classesOf(source: string, marker: string): string[] {
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, `there should be an element with ${marker}`);
  const end = source.indexOf(">", at);
  assert.notEqual(end, -1, `the element with ${marker} should have a tag`);
  const tag = source.slice(at, end);
  /* A className is either written out or built with `cn`, and the app uses
     both. */
  const plain = tag.match(/className="([^"]*)"/);
  if (plain) return plain[1]!.split(/\s+/).filter(Boolean);
  const built = tag.match(/className=\{cn\(\s*"([^"]*)"/);
  assert.ok(built, `the element with ${marker} should carry a className`);
  return built[1]!.split(/\s+/).filter(Boolean);
}

/** The class list that holds this token. */
function classListHolding(source: string, token: string): string[] {
  const lists = [...source.matchAll(/"([^"\n]*)"/g)].map((match) => match[1]!);
  const found = lists.find((list) => list.split(/\s+/).includes(token));
  assert.ok(found, `there should be a class list holding ${token}`);
  return found.split(/\s+/).filter(Boolean);
}

/** The height a class list states, if it states one. */
function statedHeight(list: string[]): string | undefined {
  return list.find((token) => VIEWPORT_HEIGHTS.includes(token));
}

test("the work area is as tall as the window", () => {
  // The work area is a flex item beside the rail, and a flex item is only as
  // tall as what is put in it. The shell says `min-h-svh`, which is a floor
  // and not a height, so a work area with no height of its own is as tall as
  // its tallest child — and a pane taller than the window makes the window
  // taller, and the whole app scrolls because one region forgot to.
  const workArea = classesOf(shellSource, "data-sidebar-open");
  assert.ok(
    statedHeight(workArea),
    "the work area should state the window's height. It is a flex item " +
      "beside the rail, so without a height of its own it is as tall as " +
      "whatever is put in it, and a pane with long content makes the window " +
      "scroll instead of the pane.",
  );
});

test("the work area clips what is inside it", () => {
  // The window does not scroll. What does not fit in the work area is the
  // content's business to scroll — the conversation, a pane's own region —
  // and the work area's part in that is to clip, so that nothing inside it
  // can reach the edge of the window and push the page.
  const workArea = classesOf(shellSource, "data-sidebar-open");
  assert.ok(
    workArea.includes("overflow-hidden"),
    "the work area should clip its own overflow, so that a region inside it " +
      "which is taller than the window is cut off rather than turning into a " +
      "scrollbar on the page.",
  );
  assert.ok(
    !workArea.some((token) => token.includes("data-[sidebar-open]:overflow-hidden")),
    "the work area's clipping should not depend on the rail being open. The " +
      "rail is closed on a first run, so that is the state a long pane would " +
      "have met it in.",
  );
});

test("the region and the work area measure the window the same way", () => {
  // The region fills the work area, so the two have to agree on what the
  // window's height is. If they did not, one of them would be the wrong
  // height by a little, and the gap would show as a strip of the wrong
  // colour along the bottom of the window.
  //
  // The region is what carries the height now, rather than the surface
  // inside it: the region is the area of the window beside the rail, and
  // the surface is one of the things that can be in it.
  const workArea = classesOf(shellSource, "data-sidebar-open");
  const region = classesOf(regionSource, "data-slot=\"workspace-host\"");
  assert.equal(
    statedHeight(region),
    statedHeight(workArea),
    "the region and the work area should measure the window the same way.",
  );
  const surface = classesOf(surfaceSource, "<main");
  assert.ok(
    surface.includes("flex-1") && surface.includes("min-h-0"),
    "the surface should fill the region and be allowed to shrink, so that a " +
      "conversation with long content scrolls rather than pushing the window " +
      "taller.",
  );
});

test("the region starts below the title bar", () => {
  // The title bar is drawn over the top of the work area rather than beside
  // it, so what is in the region has to start below it. The bar's height is
  // one number, published by the shell.
  const region = classesOf(regionSource, "data-slot=\"workspace-host\"");
  assert.ok(
    region.includes("pt-(--shell-top-bar-h)"),
    "the region should take the title bar's height off the top. The bar is " +
      "drawn over the work area, so a region that did not start below it " +
      "would put its first row under the window's controls.",
  );
});

test("the title bar's height is one number", () => {
  // The shell publishes it, and the bar, the rail's header and the surface
  // measure against it. Consumers of one number cannot end up a pixel apart.
  //
  // Where it is published is not what the rule is about. It can be a class on
  // the shell wrapper, a property set on the root, or a rule in the
  // stylesheet — and the stylesheet is the best place for it, because a menu
  // or a popover is portalled to the end of the body and cannot see a
  // variable that only the wrapper carries. What the rule forbids is two
  // numbers, and a number that nothing publishes.
  const published =
    (shellSource.match(/\[--shell-top-bar-h:/g) ?? []).length +
    (shellSource.match(/setProperty\(\s*["']--shell-top-bar-h/g) ?? []).length +
    (stylesheetSource.match(/--shell-top-bar-h\s*:/g) ?? []).length
  assert.equal(
    published,
    1,
    "the title bar's height should be published once. The bar, the rail's " +
      "header and the surface all measure against it, and two numbers " +
      "would let them end up a pixel apart.",
  );
  assert.ok(
    classListHolding(titleBarSource, "h-(--shell-top-bar-h)").includes(
      "h-(--shell-top-bar-h)",
    ),
    "the title bar should be as tall as the shell's published height.",
  );
  assert.ok(
    classListHolding(shellSource, "mt-(--shell-top-bar-h)").includes(
      "mt-(--shell-top-bar-h)",
    ),
    "the rail's header should start below the title bar, by the same number.",
  );
});

test("the conversation scrolls and the composer does not", () => {
  // The surface is a column: the conversation takes what is left, and the
  // composer keeps its place at the bottom of it. The conversation may only
  // take what is left because it is allowed to shrink, and the composer may
  // not shrink because a composer that has been squeezed is a composer
  // somebody cannot type in.
  const scrollerRoot = classListHolding(scrollerSource, "group/message-scroller");
  assert.ok(
    scrollerRoot.includes("min-h-0"),
    "the conversation should be allowed to shrink inside the surface, so " +
      "that a long one scrolls instead of pushing the composer out of the " +
      "window.",
  );
  assert.ok(
    classListHolding(scrollerSource, "overflow-y-auto").includes("overflow-y-auto"),
    "the conversation's viewport should be the region that scrolls.",
  );
  const composer = classesOf(surfaceSource, 'key="composer"');
  assert.ok(
    composer.includes("shrink-0"),
    "the composer should not shrink. It is the bottom of the surface, and a " +
      "composer that has been squeezed is a composer somebody cannot type " +
      "in.",
  );
});
