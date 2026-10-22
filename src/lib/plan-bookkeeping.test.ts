/**
 * The plan's own bookkeeping, checked.
 *
 * The plan carries a tracker of what is done and a **Status** block on every
 * finished task saying what it produced and where it went. A reader has to
 * be able to trust both, and a tracker that drifts from the work is worse
 * than no tracker: it says a thing is finished that is not.
 *
 * So the two are checked against each other:
 *
 * 1. **A task marked done has a Status block**, and a task with a Status
 *    block is marked done. There is no state where the plan claims
 *    something is finished and does not say why.
 * 2. **A Status block says "done", not "partly".** The plan asks for the
 *    partial and the incomplete to be marked as such, so a task that is
 *    half done says so rather than quietly claiming to be finished.
 * 3. **The Status block names something that exists.** A block that points
 *    at a file which is not there is a claim about work that was never
 *    done.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const plan = readFileSync(join(ROOT, "docs/plan/ui-ux-plan.md"), "utf8")

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

test("a task marked done has a Status block, and the other way round", () => {
  const missing: string[] = []
  const extra: string[] = []
  for (const task of tasks()) {
    const marked = new RegExp(`\\| ${task.id.replace(".", "\\.")} \\| ✅ done`).test(plan)
    const hasStatus = /\n\*\*Status: done\.\*\*/.test(task.block)
    if (marked && !hasStatus) missing.push(`${task.id} is marked done but has no Status block`)
    if (hasStatus && !marked) extra.push(`${task.id} has a Status block but is not marked done`)
  }
  assert.deepEqual(missing, [], "tasks marked done without a Status block")
  assert.deepEqual(extra, [], "tasks with a Status block that are not marked done")
})

test("a Status block says done, and never partly", () => {
  // The plan asks for a task to be marked for what it is. A task that is
  // half finished says so rather than claiming to be finished, and this
  // fails if a block ever says "partly" while being marked done.
  for (const task of tasks()) {
    if (!/\n\*\*Status: done\.\*\*/.test(task.block)) continue
    assert.ok(
      !/Status:\s*(part|partial|in progress)/i.test(task.block),
      `${task.id} is marked done but its Status block says it is partial`,
    )
  }
})

test("every file a Status block names is there", () => {
  // A block that points at a file which is not there is a claim about work
  // that was never done.
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

test("the tracker lists every task in the plan", () => {
  // A task the plan asks for and the tracker has forgotten is a task
  // nobody is going to do.
  //
  // The tracker writes a run of tasks as a range — "5.1 – 5.15" — and a
  // range is expanded here, so a task in the middle of one counts as
  // listed.
  const listed = new Set<string>()
  for (const match of plan.matchAll(/^\| (\d+\.\d+)(?: – (\d+\.\d+))? \|/gm)) {
    listed.add(match[1])
    if (!match[2]) continue
    const [phase, from] = match[1].split(".")
    const [, to] = match[2].split(".")
    if (phase !== match[2].split(".")[0]) continue
    for (let n = Number(from); n <= Number(to); n += 1) {
      listed.add(`${phase}.${n}`)
    }
  }
  const forgotten = tasks()
    .map((t) => t.id)
    .filter((id) => !listed.has(id))
  assert.deepEqual(forgotten, [], "tasks the tracker does not list")
})
