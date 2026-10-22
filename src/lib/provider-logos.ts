/**
 * Each provider's own mark, vendored.
 *
 * These are the providers' trademarks, used the way a directory uses them: the
 * mark sits beside the provider's own name, so a person can recognise the
 * provider they are giving a key to. Nothing here is Tavi's own branding, and
 * nothing here is anybody else's product branding — a mark identifies the
 * company whose key it is.
 *
 * They are vendored rather than fetched, for three reasons: the desktop app
 * works offline, a missing network cannot leave a blank square in the list,
 * and a file in the repository can be read and checked.
 *
 * **They are drawn in the page rather than loaded as images.** A mark loaded as
 * a file cannot take the colour of the text beside it: `currentColor`
 * inside a file is resolved against that file's own document, which has no
 * colour of its own, so it comes out black — a black mark on a dark
 * background, which is a mark nobody can see. A mark drawn in the page is
 * resolved against the page's colour, so it is light in the dark theme and
 * dark in the light one, with no second copy of it.
 *
 * Every one of them is drawn in `currentColor`, so it takes the colour of
 * the text beside it and needs no second version for the dark theme.
 *
 * A provider with no mark here has no mark to show, and the list says the
 * provider's name instead. That is the honest answer: the app does not draw a
 * mark it does not have, and it does not fetch one that might not be there.
 *
 * Where the marks came from is written down in the folder beside them.
 */

import openaiMark from "@/assets/providers/openai.svg?raw";
import anthropicMark from "@/assets/providers/anthropic.svg?raw";
import googleMark from "@/assets/providers/google.svg?raw";
import openrouterMark from "@/assets/providers/openrouter.svg?raw";
import deepseekMark from "@/assets/providers/deepseek.svg?raw";
import xaiMark from "@/assets/providers/xai.svg?raw";
import mistralMark from "@/assets/providers/mistral.svg?raw";
import groqMark from "@/assets/providers/groq.svg?raw";
import togetherMark from "@/assets/providers/together.svg?raw";
import fireworksMark from "@/assets/providers/fireworks.svg?raw";
import cerebrasMark from "@/assets/providers/cerebras.svg?raw";
import nvidia_nimMark from "@/assets/providers/nvidia-nim.svg?raw";
import huggingfaceMark from "@/assets/providers/huggingface.svg?raw";
import deepinfraMark from "@/assets/providers/deepinfra.svg?raw";
import azureMark from "@/assets/providers/azure.svg?raw";
import moonshotMark from "@/assets/providers/moonshot.svg?raw";
import zaiMark from "@/assets/providers/zai.svg?raw";
import alibabaMark from "@/assets/providers/alibaba.svg?raw";
import minimaxMark from "@/assets/providers/minimax.svg?raw";
import perplexityMark from "@/assets/providers/perplexity.svg?raw";
import ollamaMark from "@/assets/providers/ollama.svg?raw";
import vllmMark from "@/assets/providers/vllm.svg?raw";
import replicateMark from "@/assets/providers/replicate.svg?raw";
import sambanovaMark from "@/assets/providers/sambanova.svg?raw";
import cohereMark from "@/assets/providers/cohere.svg?raw";
import cloudflareMark from "@/assets/providers/cloudflare.svg?raw";
import watsonxMark from "@/assets/providers/watsonx.svg?raw";
import databricksMark from "@/assets/providers/databricks.svg?raw";

/** The mark for a provider, by its id. */
const PROVIDER_MARKS: Record<string, string> = {
  "openai": openaiMark,
  "anthropic": anthropicMark,
  "google": googleMark,
  "openrouter": openrouterMark,
  "deepseek": deepseekMark,
  "xai": xaiMark,
  "mistral": mistralMark,
  "groq": groqMark,
  "together": togetherMark,
  "fireworks": fireworksMark,
  "cerebras": cerebrasMark,
  "nvidia-nim": nvidia_nimMark,
  "huggingface": huggingfaceMark,
  "deepinfra": deepinfraMark,
  "azure": azureMark,
  "moonshot": moonshotMark,
  "zai": zaiMark,
  "alibaba": alibabaMark,
  "minimax": minimaxMark,
  "perplexity": perplexityMark,
  "ollama": ollamaMark,
  "vllm": vllmMark,
  "replicate": replicateMark,
  "sambanova": sambanovaMark,
  "cohere": cohereMark,
  "cloudflare": cloudflareMark,
  "watsonx": watsonxMark,
  "databricks": databricksMark,
};

/** The mark for a provider, if there is one. */
export const providerMark = (providerId: string): string | undefined =>
  PROVIDER_MARKS[providerId];
