/**
 * A small Chrome DevTools Protocol driver, for the desktop app's webview.
 *
 * The Tauri window is a WebView2, and a development build can be reached
 * over the protocol with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. This is
 * how the desktop build is looked at the same way the browser build is.
 *
 *   node scripts/cdp.mjs '<javascript to run>'
 */

const targets = await (await fetch("http://127.0.0.1:9222/json")).json()
const page = targets.find((target) => target.type === "page")
if (!page) {
  console.error("no page")
  process.exit(1)
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true })
  socket.addEventListener("error", reject, { once: true })
})

let nextId = 0
const pending = new Map()
const consoleMessages = []

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) {
    const waiter = pending.get(message.id)
    pending.delete(message.id)
    waiter?.(message)
    return
  }
  if (message.method === "Runtime.consoleAPICalled") {
    consoleMessages.push(
      `${message.params.type}: ${message.params.args
        .map((arg) => arg.value ?? arg.description ?? "")
        .join(" ")}`,
    )
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleMessages.push(
      `exception: ${message.params.exceptionDetails.text} ${
        message.params.exceptionDetails.exception?.description ?? ""
      }`,
    )
  }
})

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })

/* A picture of the page, whether or not the window is in front. */
if (process.argv[3] === "shot") {
  await send("Page.enable")
  const shot = await send("Page.captureScreenshot", { format: "png" })
  const { writeFileSync } = await import("node:fs")
  const path = process.argv[4] ?? "shot.png"
  writeFileSync(path, Buffer.from(shot.result.data, "base64"))
  console.log(`saved ${path}`)
  socket.close()
  process.exit(0)
}

await send("Runtime.enable")
await send("Log.enable")

/* A real mouse move, so that a hover is a hover and not a synthetic event
   the widget under test never believes. */
if (process.argv[3] === "move" || process.argv[3] === "click") {
  const x = Number(process.argv[4])
  const y = Number(process.argv[5])
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  if (process.argv[3] === "click") {
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    })
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 900))
}

import { readFileSync } from "node:fs"

const argument = process.argv[2] ?? "document.title"
const expression = argument.endsWith(".js")
  ? readFileSync(argument, "utf8")
  : argument
const result = await send("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
})

console.log(
  JSON.stringify(
    {
      value: result.result?.result?.value,
      description: result.result?.exceptionDetails?.text,
      console: consoleMessages.slice(-20),
    },
    null,
    1,
  ),
)

socket.close()
