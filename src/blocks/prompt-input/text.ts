type Trigger = {
  char: string
  query: string
  start: number
  end: number
}

function insertText(
  element: HTMLTextAreaElement,
  text: string,
  start = element.selectionStart,
  end = element.selectionEnd
) {
  element.focus()
  element.setSelectionRange(start, end)
  let inserted = false
  try {
    inserted = document.execCommand("insertText", false, text)
  } catch {
    inserted = false
  }
  if (!inserted || element.value.slice(start, start + text.length) !== text) {
    element.setRangeText(text, start, end, "end")
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function replaceAll(element: HTMLTextAreaElement, text: string) {
  insertText(element, text, 0, element.value.length)
}

function isImeEnter(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229
}

function findTrigger(
  value: string,
  caret: number,
  triggers: string[]
): Trigger | null {
  const before = value.slice(0, caret)
  const match = /(^|\s)(\S)([^\s]*)$/.exec(before)
  if (!match) return null
  const char = match[2]
  if (!triggers.includes(char)) return null
  const start = match.index + match[1].length
  if (char === "/" && before.slice(0, start).trim() !== "") return null
  return { char, query: match[3], start, end: caret }
}

const mirrored = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "tabSize",
  "direction",
] as const

function getCaretRect(element: HTMLTextAreaElement, index: number) {
  const box = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const mirror = document.createElement("div")
  for (const property of mirrored) {
    mirror.style[property] = style[property]
  }
  mirror.style.position = "absolute"
  mirror.style.visibility = "hidden"
  mirror.style.top = "0"
  mirror.style.left = "-9999px"
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.overflowWrap = "break-word"
  mirror.textContent = element.value.slice(0, index)
  const marker = document.createElement("span")
  marker.textContent = element.value.slice(index) || "."
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const lineHeight = parseFloat(style.lineHeight) || marker.offsetHeight
  const rect = {
    left: box.left + marker.offsetLeft - element.scrollLeft,
    top: box.top + marker.offsetTop - element.scrollTop,
    height: lineHeight,
  }
  mirror.remove()
  return rect
}

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return name.endsWith(token)
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1))
      return type === token
    })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function countLines(text: string) {
  return text.split("\n").length
}

export {
  countLines,
  findTrigger,
  formatBytes,
  getCaretRect,
  insertText,
  isImeEnter,
  matchesAccept,
  replaceAll,
  type Trigger,
}
