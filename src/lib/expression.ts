/**
 * A small arithmetic parser.
 *
 * Model-authored input is untrusted even in a local desktop app, so this uses
 * recursive descent over a fixed grammar and never touches dynamic code
 * evaluation of any kind.
 *
 *   expr    := term (("+" | "-") term)*
 *   term    := factor (("*" | "/" | "%") factor)*
 *   factor  := unary ("^" factor)?      // right-associative
 *   unary   := "-" unary | primary
 *   primary := number | "(" expr ")"
 */

const NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

type Cursor = { input: string; pos: number };

const fail = (message: string): never => {
  throw new Error(message);
};

const skipSpace = (c: Cursor) => {
  while (c.pos < c.input.length && /\s/.test(c.input[c.pos])) c.pos += 1;
};

const peek = (c: Cursor): string | undefined => c.input[c.pos];

const parseExpr = (c: Cursor): number => {
  let value = parseTerm(c);
  for (;;) {
    skipSpace(c);
    const ch = peek(c);
    if (ch !== "+" && ch !== "-") return value;
    c.pos += 1;
    const rhs = parseTerm(c);
    value = ch === "+" ? value + rhs : value - rhs;
  }
};

const parseTerm = (c: Cursor): number => {
  let value = parseFactor(c);
  for (;;) {
    skipSpace(c);
    const ch = peek(c);
    if (ch !== "*" && ch !== "/" && ch !== "%") return value;
    c.pos += 1;
    const rhs = parseFactor(c);
    if ((ch === "/" || ch === "%") && rhs === 0) fail("Division by zero.");
    if (ch === "*") value *= rhs;
    else if (ch === "/") value /= rhs;
    else value %= rhs;
  }
};

const parseFactor = (c: Cursor): number => {
  const base = parseUnary(c);
  skipSpace(c);
  if (peek(c) !== "^") return base;
  c.pos += 1;
  // right-associative, and ^ binds tighter than unary minus on the left
  return base ** parseFactor(c);
};

const parseUnary = (c: Cursor): number => {
  skipSpace(c);
  if (peek(c) === "-") {
    c.pos += 1;
    return -parseUnary(c);
  }
  if (peek(c) === "+") {
    c.pos += 1;
    return parseUnary(c);
  }
  return parsePrimary(c);
};

const parsePrimary = (c: Cursor): number => {
  skipSpace(c);

  if (peek(c) === "(") {
    c.pos += 1;
    const value = parseExpr(c);
    skipSpace(c);
    if (peek(c) !== ")") fail("Unbalanced parentheses.");
    c.pos += 1;
    return value;
  }

  const rest = c.input.slice(c.pos);
  const match = NUMBER.exec(rest);
  if (!match) {
    throw new Error(`Unexpected character near "${rest.slice(0, 12)}".`);
  }
  c.pos += match[0].length;
  return Number(match[0]);
};

export const evaluateExpression = (input: string): number => {
  const trimmed = input.trim();
  if (!trimmed) fail("Empty expression.");
  if (trimmed.length > 200) fail("Expression is too long.");

  const cursor: Cursor = { input: trimmed, pos: 0 };
  const value = parseExpr(cursor);

  skipSpace(cursor);
  if (cursor.pos < cursor.input.length) {
    fail(`Unexpected trailing input near "${cursor.input.slice(cursor.pos, cursor.pos + 12)}".`);
  }
  if (!Number.isFinite(value)) fail("Result is not a finite number.");
  return value;
};