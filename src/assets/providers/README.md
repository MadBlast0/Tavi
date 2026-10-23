# The provider marks

A picture of each provider, so a person can tell at a glance which provider
they are giving a key to. They are the **providers'** trademarks — they
identify the company whose key it is — and none of them is Tavi's own
branding.

Two sources:

- **models.dev** — `https://github.com/anomalyco/models.dev`, MIT licensed.
  Most of the marks come from here, which keeps them one set rather than
  several drawn by different hands.
- **Simple Icons** — `https://simpleicons.org`, CC0-1.0. The three that
  models.dev does not carry: Ollama, vLLM and Replicate.

A mark that is missing is not drawn. The list shows the provider's name
instead, because a blank square says nothing and a name says what it is.

## Why they are drawn in the page and not loaded as images

Every mark is drawn in `currentColor`, so it takes the colour of the text
beside it: near-white in the dark theme, near-black in the light one.

**A mark loaded as a file cannot do that.** `currentColor` inside a file is
resolved against that file's own document, which has no colour of its own, so
it comes out black — a black mark on a dark background, which is a mark
nobody can see. A mark drawn in the page is resolved against the page's
colour, and the page's colour is the theme's.

That is why these are imported as text and drawn in the document, and why
there is no second copy of each one for the other theme.
