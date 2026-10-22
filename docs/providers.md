# Providers

Where Tavi's providers are, what shape they speak, and what the app does with
each of them.

The list is one table: [`src/lib/providers.ts`](../src/lib/providers.ts). The
website's server and the desktop's Rust read it, and a test
([`provider-table.test.ts`](../src/lib/provider-table.test.ts)) says the two
agree — a provider in one and not the other is a key the app can store and
never use, or a provider the app talks to and cannot hold a key for.

---

## What a provider is

A provider is a **shape** and some **configuration**.

The **shape** is the request itself: what the body looks like, what the
headers are, and what the stream says. There are four.

| Shape | Which providers | The request |
|---|---|---|
| `openai-chat-completions` | OpenAI · OpenRouter · DeepSeek · xAI · Mistral · Groq · Together AI · Fireworks AI · Cerebras · NVIDIA NIM · Hugging Face · DeepInfra · Azure OpenAI · Moonshot AI · Z.ai · Alibaba Model Studio · Perplexity · Replicate · SambaNova · Cloudflare AI Gateway · IBM watsonx · Databricks · **Custom endpoint** | `POST {base}/chat/completions` |
| `anthropic-messages` | Anthropic · MiniMax | `POST {base}/messages` |
| `google-generative-ai` | Google Gemini | `POST {base}/models/{model}:streamGenerateContent` |
| `cohere-chat` | Cohere | `POST {base}/chat` |

Most of them speak the OpenAI shape and differ only in where they live and
how the key is sent. That is what makes the list long and the code short: a
provider of that kind is **configuration**, not an implementation.

The **configuration** is four things: the address, the way the key is sent,
the paths, and — for a provider of your own — the address the key carries.

---

## The way the key is sent

| | How |
|---|---|
| `bearer` | `Authorization: Bearer {key}` |
| `x-api-key` | `x-api-key: {key}`, with `anthropic-version: 2023-06-01` |
| `api-key` | `api-key: {key}` — Azure's own header |
| `x-goog-api-key` | `x-goog-api-key: {key}` — Google's own header |
| `none` | No key. A model running on this machine does not need one. |

---

## Where a reasoning level goes

A reasoning level goes in a **different field** depending on the provider,
and a level sent in the wrong field is one the provider ignores:

| Provider | The field |
|---|---|
| OpenRouter | `reasoning: { effort }` |
| OpenAI, and the OpenAI-compatible providers | `reasoning_effort`, at the top level |
| Anthropic, MiniMax | `output_config: { effort }` |
| Everyone else | none — they publish no reasoning levels |

The field is in the provider's own row, so both halves of the app read it
from one place. What is *not* in the table is the rule about **whether a
level is allowed at all**: that is one rule, in
[`provider-reasoning.ts`](../src/lib/provider-reasoning.ts), and the server
and the desktop app both use it, so they refuse the same things for the same
model.

**A provider that publishes no reasoning levels is not a provider that
refuses them.** It is a provider whose levels are not known, so the app
leaves the control off and sends the provider's default.

---

## The address

A provider lives at one address, and the table says where. A few do not:

- **Azure OpenAI** — an Azure resource, so the address is the resource's.
- **Databricks** — a workspace, so the address is the workspace's.
- **Cloudflare AI Gateway** — an account and a gateway, so the address names both.
- **Ollama** and **vLLM** — a model on this machine, so the address is a port.
- **A custom endpoint** — anything at all.

**A key carries the address it belongs to**, and the key's address wins over
the provider's default. It is asked for where the key is added, used for the
check, and used for the request — on both sides of the app. The address is
part of the key's metadata, and it is written next to the key rather than
beside it: the address is not a secret, but it is not the provider's either.

### How the addresses were checked

A provider answers **401** to a request it understands and **404** to one it
does not. So the status is the answer to "is this the right address", and it
does not need a key to get it.

Every address in the table was asked. Twenty-four answered as they should.
Two did not, and are now right:

- **Perplexity's models are not where its chat is.** The catalogue is under
  `/v1` and the request is not, so the two paths are named separately.
- **DeepInfra's request is under `/openai`**, and its catalogue is not.

The two that could not be asked are the ones that need a name of the user's
own — Azure, Databricks and Cloudflare — and the one that has to be running:
Ollama and vLLM.

---

## Checking a key

Two kinds, and the difference is the whole reason the field exists:

- **`identity-endpoint`** — a free request that answers "no" for a bad key
  and "yes" for a good one. Most providers have one. A provider whose own
  catalogue is the endpoint gets "no" and nothing more, which is what a check
  needs.
- **`inference-probe`** — no such endpoint, so the only way to find out is to
  make a real inference. It costs the user's quota, so it is **only ever run
  when the user asks for it**. NVIDIA NIM is the one: its model list is
  public and answers `200` to any caller, with a bad key and with no key at
  all, so it cannot tell a good key from a bad one.

The list is never checked in a way that spends anything.

---

## The marks

Each provider's own trademark, shown beside the provider's name so a person
can tell at a glance which provider they are giving a key to. They are
vendored in [`src/assets/providers/`](../src/assets/providers/) and the
folder says where they came from.

**They are drawn in the page rather than loaded as images.** A mark loaded as
a file cannot take the colour of the text beside it: `currentColor` inside a
file is resolved against that file's own document, which has no colour of its
own, so it comes out black — a black mark on a dark background, which is a
mark nobody can see. Drawn in the page, it is resolved against the page's
colour: near-white in the dark theme and near-black in the light one, with no
second copy of either.

---

## What is not supported

**Amazon Bedrock** and **Google Vertex AI** are not in the list. They are
signed with AWS credentials and with Google's own rather than with a key, and
the app has no client for either. A provider the app cannot talk to is not a
provider the app supports, so it is not offered and its credential is not
taken.

---

## Where the provider in use is chosen

In the composer, by a control of its own beside the model one. The model
picker waits for it, because the models belong to a provider.

The provider in use is a **per-side preference**, like the model and the
effort, and everything follows it: the catalogue that is fetched, the list
that is shown, the key the request goes out with, and the provider the
request is sent to. The list and the request are about the same provider by
construction, rather than by agreeing to.

A chat or a session **records the provider it was started with**, the way it
records the model and the effort. It is a record and not a rule: the
conversation is text, the tools are the same whichever provider answers, and
the effort is checked against the new model — so a thread may go on to
another provider if the user wants it to.
