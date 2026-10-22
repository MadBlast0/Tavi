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
 * Every one of them is drawn in the text's own colour, so it takes the colour
 * of the text beside it and needs no second version for the dark theme.
 *
 * A provider with no mark here has no mark to show, and the list says the
 * provider's name instead. That is the honest answer: the app does not draw a
 * mark it does not have, and it does not fetch one that might not be there.
 */

import openaiLogo from "@/assets/providers/openai.svg";
import anthropicLogo from "@/assets/providers/anthropic.svg";
import googleLogo from "@/assets/providers/google.svg";
import openrouterLogo from "@/assets/providers/openrouter.svg";
import deepseekLogo from "@/assets/providers/deepseek.svg";
import xaiLogo from "@/assets/providers/xai.svg";
import mistralLogo from "@/assets/providers/mistral.svg";
import groqLogo from "@/assets/providers/groq.svg";
import cerebrasLogo from "@/assets/providers/cerebras.svg";
import nvidia_nimLogo from "@/assets/providers/nvidia-nim.svg";
import huggingfaceLogo from "@/assets/providers/huggingface.svg";
import deepinfraLogo from "@/assets/providers/deepinfra.svg";
import amazon_bedrockLogo from "@/assets/providers/amazon-bedrock.svg";
import azureLogo from "@/assets/providers/azure.svg";
import google_vertexLogo from "@/assets/providers/google-vertex.svg";
import moonshotLogo from "@/assets/providers/moonshot.svg";
import zaiLogo from "@/assets/providers/zai.svg";
import alibabaLogo from "@/assets/providers/alibaba.svg";
import minimaxLogo from "@/assets/providers/minimax.svg";
import perplexityLogo from "@/assets/providers/perplexity.svg";
import sambanovaLogo from "@/assets/providers/sambanova.svg";
import cohereLogo from "@/assets/providers/cohere.svg";
import cloudflareLogo from "@/assets/providers/cloudflare.svg";
import watsonxLogo from "@/assets/providers/watsonx.svg";
import databricksLogo from "@/assets/providers/databricks.svg";

/** The mark for a provider, by its id. */
export const PROVIDER_LOGOS: Record<string, string> = {
  "openai": openaiLogo,
  "anthropic": anthropicLogo,
  "google": googleLogo,
  "openrouter": openrouterLogo,
  "deepseek": deepseekLogo,
  "xai": xaiLogo,
  "mistral": mistralLogo,
  "groq": groqLogo,
  "cerebras": cerebrasLogo,
  "nvidia-nim": nvidia_nimLogo,
  "huggingface": huggingfaceLogo,
  "deepinfra": deepinfraLogo,
  "amazon-bedrock": amazon_bedrockLogo,
  "azure": azureLogo,
  "google-vertex": google_vertexLogo,
  "moonshot": moonshotLogo,
  "zai": zaiLogo,
  "alibaba": alibabaLogo,
  "minimax": minimaxLogo,
  "perplexity": perplexityLogo,
  "sambanova": sambanovaLogo,
  "cohere": cohereLogo,
  "cloudflare": cloudflareLogo,
  "watsonx": watsonxLogo,
  "databricks": databricksLogo,
};

/** The mark for a provider, if there is one. */
export const providerLogo = (providerId: string): string | undefined =>
  PROVIDER_LOGOS[providerId];
