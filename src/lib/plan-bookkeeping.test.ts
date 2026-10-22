/**
 * The plan's own bookkeeping, checked.
 *
 * The plan carries a table of every task and the state it is in, and a
 * **Status** block on every task that has been started saying what stands,
 * what was wrong, and what it becomes. A reader has to be able to trust
 * both, and a tracker that drifts from the work is worse than no tracker:
 * it says a thing is finished that is not.
 *
 * So the two are checked against each other:
 *
 * 1. **A task marked done has a Status block that says done, and a task
 *    whose Status block says done is marked done.** There is no state where
 *    the plan claims something is finished and does not say why.
 * 2. **A task marked partly or next has a Status block that says what is
 *    not done.** A half-done task says so, rather than quietly claiming
 *    to be finished.
 * 3. **A task marked not started has no Status block.** A block on a task
 *    that has not been touched is a claim about work that was not done.
 * 4. **Every file the plan names is there.** A block or a row that points
 *    at a file which is not there is a claim about work that was never
 *    done.
 * 5. **Every task in the plan has a row**, so a task nobody is going to do
 *    is visible rather than forgotten.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const plan = readFileSync(join(ROOT, "docs/plan/ui-ux-plan.md"), "utf8")

/** The states a task may be in. */
const DONE = "✅ done"
const PARTLY = "🟡 partly"
const NEXT = "▶ next"
const NOT_STARTED = "⬜ not started"

/** Every task in the plan, with the block that belongs to it. */
const tasks = () => {
  const found: { id: string; title: string; block: string }[] = []
  const heads = [...plan.matchAll(/^## Task (\d+\.\d+) — (.+)$/gm)]
  for (const [index, head] of heads.entries()) {
    const end = heads[index + 1]?.index ?? plan.length
    found.push({
      id: head[1],
      title: head[2].trim(),
      block: plan.slice(head.index, end),
    })
  }
  return found
}

/** The state the tracker gives a task, or null if it gives none. */
const stateOf = (id: string): string | null => {
  const row = plan.match(
    new RegExp(`^\\| ${id.replace(".", "\\.")} \\| ([^|]+?) \\|`, "m"),
  )
  return row ? row[1].trim() : null
}

/** What the task's own Status block says about it. */
const statusOf = (block: string): "done" | "partly" | null => {
  if (/\n\*\*Status: done\.\*\*/.test(block)) return "done"
  if (/\n\*\*Status: partly/.test(block)) return "partly"
  return null
}

test("every task in the plan has a row, with a state", () => {
  const missing: string[] = []
  const unknown: string[] = []
  for (const task of tasks()) {
    const state = stateOf(task.id)
    if (state === null) {
      missing.push(task.id)
      continue
    }
    if (![DONE, PARTLY, NEXT, NOT_STARTED].includes(state)) {
      unknown.push(`${task.id} is marked "${state}"`)
    }
  }
  assert.deepEqual(missing, [], "tasks the tracker does not list")
  assert.deepEqual(unknown, [], "tasks marked with a state that is not one of the four")
})

test("a task marked done has a Status block, and the other way round", () => {
  const missing: string[] = []
  const extra: string[] = []
  for (const task of tasks()) {
    const marked = stateOf(task.id) === DONE
    const said = statusOf(task.block) === "done"
    if (marked && !said) missing.push(`${task.id} is marked done but does not say so`)
    if (said && !marked) extra.push(`${task.id} says it is done but is not marked done`)
  }
  assert.deepEqual(missing, [], "tasks marked done without a Status block saying done")
  assert.deepEqual(extra, [], "tasks whose Status block says done but are not marked done")
})

test("a task marked partly or next says what is not done", () => {
  // A half-done task says so, and the Status block says what is missing.
  // Without one, "partly" is a claim with no content behind it.
  for (const task of tasks()) {
    const state = stateOf(task.id)
    if (state !== PARTLY && state !== NEXT) continue
    assert.ok(
      statusOf(task.block) === "partly",
      `${task.id} is marked ${state} and should have a Status block saying what is not done`,
    )
  }
})

test("a task marked not started has no Status block", () => {
  // A block on a task nobody has touched is a claim about work that was
  // not done.
  for (const task of tasks()) {
    if (stateOf(task.id) !== NOT_STARTED) continue
    assert.equal(
      statusOf(task.block),
      null,
      `${task.id} is marked not started but has a Status block`,
    )
  }
})

test("every file the plan names is there", () => {
  // A block or a row that points at a file which is not there is a claim
  // about work that was never done.
  const missing: string[] = []
  for (const task of tasks()) {
    const status = task.block.indexOf("**Status:")
    if (status === -1) continue
    const block = task.block.slice(status)
    for (const match of block.matchAll(
      /`((?:src|docs|server|shared)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|css|md|json))`/g,
    )) {
      if (!existsSync(join(ROOT, match[1]))) {
        missing.push(`${task.id} names ${match[1]}, which is not there`)
      }
    }
  }
  assert.deepEqual(missing, [], "Status blocks naming files that are not there")
})

test("every file the tracker names is there", () => {
  const missing: string[] = []
  for (const match of plan.matchAll(
    /^\| \d+\.\d+ \| [^|]+ \| (.*) \|$/gm,
  )) {
    for (const file of match[1].matchAll(
      /`((?:src|docs|server|shared)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|css|md|json))`/g,
    )) {
      if (!existsSync(join(ROOT, file[1]))) {
        missing.push(`the tracker names ${file[1]}, which is not there`)
      }
    }
  }
  assert.deepEqual(missing, [], "tracker rows naming files that are not there")
})
