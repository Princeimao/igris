"use strict";
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
class FifoQueue {
  incoming = [];
  outgoing = [];
  get length() {
    return this.incoming.length + this.outgoing.length;
  }
  enqueue(value) {
    this.incoming.push(value);
  }
  dequeue() {
    if (this.outgoing.length === 0) {
      while (this.incoming.length > 0) {
        this.outgoing.push(this.incoming.pop());
      }
    }
    return this.outgoing.pop();
  }
}
class EventStream {
  queue = new FifoQueue();
  waiting = new FifoQueue();
  done = false;
  finalResultPromise;
  resolveFinalResult;
  isComplete;
  extractResult;
  constructor(isComplete, extractResult) {
    this.isComplete = isComplete;
    this.extractResult = extractResult;
    this.finalResultPromise = new Promise((resolve) => {
      this.resolveFinalResult = resolve;
    });
  }
  push(event) {
    if (this.done)
      return;
    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }
    const waiter = this.waiting.dequeue();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.enqueue(event);
    }
  }
  end(result) {
    this.done = true;
    if (result !== void 0) {
      this.resolveFinalResult(result);
    }
    while (this.waiting.length > 0) {
      const waiter = this.waiting.dequeue();
      waiter({ value: void 0, done: true });
    }
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.dequeue();
      } else if (this.done) {
        return;
      } else {
        const result = await new Promise((resolve) => this.waiting.enqueue(resolve));
        if (result.done)
          return;
        yield result.value;
      }
    }
  }
  result() {
    return this.finalResultPromise;
  }
}
class AssistantMessageEventStream extends EventStream {
  constructor() {
    super((event) => event.type === "done" || event.type === "error", (event) => {
      if (event.type === "done") {
        return event.message;
      } else if (event.type === "error") {
        return event.error;
      }
      throw new Error("Unexpected event type for final result");
    });
  }
}
function createSetupErrorMessage(model, error) {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now()
  };
}
function hasResult(source) {
  return typeof source.result === "function";
}
async function forwardStream(target, source) {
  for await (const event of source) {
    target.push(event);
  }
  target.end(hasResult(source) ? await source.result() : void 0);
}
function lazyStream(model, setup) {
  const outer = new AssistantMessageEventStream();
  setup().then((inner) => forwardStream(outer, inner)).catch((error) => {
    const message = createSetupErrorMessage(model, error);
    outer.push({ type: "error", reason: "error", error: message });
    outer.end(message);
  });
  return outer;
}
function lazyApi(load, capabilities) {
  const api = {
    stream: (model, context, options) => lazyStream(model, async () => (await load()).stream(model, context, options)),
    streamSimple: (model, context, options) => lazyStream(model, async () => (await load()).streamSimple(model, context, options))
  };
  return api;
}
const openAIResponsesApi = () => lazyApi(() => Promise.resolve().then(() => require("./openai-responses-CX8Rvr_g.js")));
function envApiKeyAuth(name, envVars) {
  return {
    name,
    login: async (interaction) => {
      interaction.signal.throwIfAborted();
      const key = await interaction.prompt({ type: "secret", message: `Enter ${name}` });
      interaction.signal.throwIfAborted();
      return { type: "api_key", key };
    },
    resolve: async ({ ctx, credential, signal }) => {
      signal.throwIfAborted();
      if (credential?.key) {
        return { auth: { apiKey: credential.key }, env: credential.env, source: "stored credential" };
      }
      for (const envVar of envVars) {
        const value = await ctx.env(envVar);
        signal.throwIfAborted();
        if (value)
          return { auth: { apiKey: value }, source: envVar };
      }
      return void 0;
    }
  };
}
function lazyOAuth(input) {
  let promise;
  const loaded = () => {
    promise ??= input.load();
    return promise;
  };
  return {
    name: input.name,
    isSubscription: input.isSubscription,
    loginLabel: input.loginLabel,
    login: async (interaction, options) => (await loaded()).login(interaction, options),
    refresh: async (credential, signal) => (await loaded()).refresh(credential, signal),
    toAuth: async (credential) => (await loaded()).toAuth(credential)
  };
}
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
    return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path;
};
const importOAuthModule = (specifier) => {
  const runtimeSpecifier = (typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("openai-g4kS26dr.js", document.baseURI).href).endsWith(".js") ? specifier.replace(/\.ts$/, ".js") : specifier;
  return import(__rewriteRelativeImportExtension(runtimeSpecifier));
};
const loadOpenAIChatGPTOAuth = async () => {
  return (await importOAuthModule("./openai-chatgpt.ts")).openaiChatGPTOAuth;
};
function formatThrownValue(value) {
  if (value instanceof Error)
    return value.message || value.name;
  if (typeof value === "string")
    return value;
  return String(value);
}
class ModelsError extends Error {
  code;
  constructor(code, message, options) {
    super(withCauseDetail(message, options?.cause), options);
    this.name = "ModelsError";
    this.code = code;
  }
}
function withCauseDetail(message, cause) {
  if (cause === void 0 || cause === null)
    return message;
  const detail = formatThrownValue(cause).trim();
  if (!detail || message.includes(detail))
    return message;
  return `${message}: ${detail}`;
}
function getModelType(model) {
  return model.type ?? "chat";
}
function isModelType(model, type) {
  return getModelType(model) === type;
}
function imageErrorResult(model, error, aborted = false) {
  return {
    api: model.api,
    provider: model.provider,
    model: model.id,
    output: [],
    stopReason: aborted ? "aborted" : "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now()
  };
}
function classifierErrorResult(model, error, aborted = false) {
  return {
    api: model.api,
    provider: model.provider,
    model: model.id,
    answers: {},
    stopReason: aborted ? "aborted" : "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now()
  };
}
const KNOWN_MODEL_TYPES = { chat: true, image: true, classifier: true };
function hasKnownModelType(model) {
  return Object.hasOwn(KNOWN_MODEL_TYPES, getModelType(model));
}
function createProvider(input) {
  const single = input.api && typeof input.api.stream === "function" ? input.api : void 0;
  const byApi = single || !input.api ? void 0 : input.api;
  const images = input.images;
  const classifiers = input.classifiers;
  const streams = single ? [single] : Object.values(byApi ?? {}).filter((entry) => entry !== void 0);
  const imageImplementations = Object.values(images ?? {}).filter((entry) => entry !== void 0);
  const classifierImplementations = Object.values(classifiers ?? {}).filter((entry) => entry !== void 0);
  if (streams.length === 0 && imageImplementations.length === 0 && classifierImplementations.length === 0) {
    throw new Error(`Provider ${input.id}: at least one of "api", "images", or "classifiers" is required.`);
  }
  const baselineModels = input.models;
  let dynamicModels = [];
  const fetchModels = input.fetchModels;
  const currentModels = () => {
    const merged = [...baselineModels];
    for (const model of dynamicModels) {
      const index = merged.findIndex((entry) => getModelType(entry) === getModelType(model) && entry.id === model.id);
      if (index >= 0)
        merged[index] = model;
      else
        merged.push(model);
    }
    return merged;
  };
  const apiFor = (model) => single ?? byApi?.[model.api];
  const dispatch = (model, run) => {
    const streams2 = apiFor(model);
    if (!streams2) {
      return lazyStream(model, async () => {
        throw new ModelsError("stream", `Provider ${input.id} has no API implementation for "${model.api}"`);
      });
    }
    return run(streams2);
  };
  const provider = {
    id: input.id,
    name: input.name ?? input.id,
    baseUrl: input.baseUrl,
    headers: input.headers,
    auth: input.auth,
    getModels: () => currentModels().filter((model) => isModelType(model, "chat")),
    getAllModels: currentModels,
    refreshModels: fetchModels ? async (context) => {
      if (context.stored) {
        const restored = context.stored.models.filter((model) => model.provider === input.id).map((model) => model);
        if (!await context.publish({
          update: () => {
            dynamicModels = restored;
          }
        })) {
          return;
        }
      }
      if (!context.allowNetwork || context.signal.aborted)
        return;
      const fetched = await fetchModels(context);
      if (context.signal.aborted)
        return;
      const refreshed = fetched.filter(hasKnownModelType);
      await context.publish({
        persist: { models: refreshed, checkedAt: Date.now() },
        update: () => {
          dynamicModels = refreshed;
        }
      });
    } : void 0,
    filterModels: input.filterModels,
    filterAllModels: input.filterAllModels,
    stream: (model, context, options) => dispatch(model, (streams2) => streams2.stream(model, context, options)),
    streamSimple: (model, context, options) => dispatch(model, (streams2) => streams2.streamSimple(model, context, options))
  };
  if (streams.some((entry) => entry.fetchDeferred !== void 0)) {
    provider.fetchDeferred = (model, handle, options) => lazyStream(model, async () => {
      const implementation = apiFor(model);
      if (!implementation?.fetchDeferred) {
        throw new ModelsError("provider", `Provider ${input.id} does not support deferred responses for "${model.api}"`);
      }
      return implementation.fetchDeferred(model, handle, options);
    });
  }
  if (streams.some((entry) => entry.cancelDeferred !== void 0)) {
    provider.cancelDeferred = async (model, handle, options) => {
      const implementation = apiFor(model);
      if (!implementation?.cancelDeferred) {
        throw new ModelsError("provider", `Provider ${input.id} cannot cancel deferred responses for "${model.api}"`);
      }
      await implementation.cancelDeferred(model, handle, options);
    };
  }
  if (images && imageImplementations.length > 0) {
    provider.generateImages = async (model, context, options) => {
      const implementation = images[model.api];
      if (!implementation) {
        return imageErrorResult(model, new ModelsError("provider", `Provider ${input.id} has no image generation implementation for "${model.api}"`));
      }
      return implementation.generateImages(model, context, options);
    };
  }
  if (classifiers && classifierImplementations.length > 0) {
    provider.classify = async (model, context, options) => {
      const implementation = classifiers[model.api];
      if (!implementation) {
        return classifierErrorResult(model, new ModelsError("provider", `Provider ${input.id} has no classifier implementation for "${model.api}"`));
      }
      return implementation.classify(model, context, options);
    };
  }
  return provider;
}
function calculateCost(model, usage) {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  let rates = model.cost;
  let matchedThreshold = -1;
  for (const tier of model.cost.tiers ?? []) {
    if (inputTokens > tier.inputTokensAbove && tier.inputTokensAbove > matchedThreshold) {
      rates = tier;
      matchedThreshold = tier.inputTokensAbove;
    }
  }
  const longWrite = usage.cacheWrite1h ?? 0;
  const shortWrite = usage.cacheWrite - longWrite;
  usage.cost.input = rates.input / 1e6 * usage.input;
  usage.cost.output = rates.output / 1e6 * usage.output;
  usage.cost.cacheRead = rates.cacheRead / 1e6 * usage.cacheRead;
  usage.cost.cacheWrite = (rates.cacheWrite * shortWrite + rates.input * 2 * longWrite) / 1e6;
  usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
  return usage.cost;
}
const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function getSupportedThinkingLevels(model) {
  if (!model.reasoning)
    return ["off"];
  return EXTENDED_THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null)
      return false;
    if (level === "xhigh" || level === "max")
      return mapped !== void 0;
    return true;
  });
}
function clampThinkingLevel(model, level) {
  const availableLevels = getSupportedThinkingLevels(model);
  if (availableLevels.includes(level))
    return level;
  const requestedIndex = EXTENDED_THINKING_LEVELS.indexOf(level);
  if (requestedIndex === -1)
    return availableLevels[0] ?? "off";
  for (let i = requestedIndex; i < EXTENDED_THINKING_LEVELS.length; i++) {
    const candidate = EXTENDED_THINKING_LEVELS[i];
    if (availableLevels.includes(candidate))
      return candidate;
  }
  for (let i = requestedIndex - 1; i >= 0; i--) {
    const candidate = EXTENDED_THINKING_LEVELS[i];
    if (availableLevels.includes(candidate))
      return candidate;
  }
  return availableLevels[0] ?? "off";
}
const values = {
  "openai-responses": /* @__PURE__ */ JSON.parse('{"chat:gpt-4":{"id":"gpt-4","name":"GPT-4","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text"],"cost":{"input":30,"output":60,"cacheRead":0,"cacheWrite":0},"contextWindow":8192,"maxTokens":8192,"compat":{"supportsStrictMode":true},"type":"chat"},"chat:gpt-4-turbo":{"id":"gpt-4-turbo","name":"GPT-4 Turbo","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":10,"output":30,"cacheRead":0,"cacheWrite":0},"contextWindow":128000,"maxTokens":4096,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4.1":{"id":"gpt-4.1","name":"GPT-4.1","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":2,"output":8,"cacheRead":0.5,"cacheWrite":0},"contextWindow":1047576,"maxTokens":32768,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4.1-mini":{"id":"gpt-4.1-mini","name":"GPT-4.1 mini","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":0.4,"output":1.6,"cacheRead":0.1,"cacheWrite":0},"contextWindow":1047576,"maxTokens":32768,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4.1-nano":{"id":"gpt-4.1-nano","name":"GPT-4.1 nano","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":0.1,"output":0.4,"cacheRead":0.025,"cacheWrite":0},"contextWindow":1047576,"maxTokens":32768,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4o":{"id":"gpt-4o","name":"GPT-4o","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":2.5,"output":10,"cacheRead":1.25,"cacheWrite":0},"contextWindow":128000,"maxTokens":16384,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4o-2024-05-13":{"id":"gpt-4o-2024-05-13","name":"GPT-4o (2024-05-13)","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":5,"output":15,"cacheRead":0,"cacheWrite":0},"contextWindow":128000,"maxTokens":4096,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4o-2024-08-06":{"id":"gpt-4o-2024-08-06","name":"GPT-4o (2024-08-06)","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":2.5,"output":10,"cacheRead":1.25,"cacheWrite":0},"contextWindow":128000,"maxTokens":16384,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4o-2024-11-20":{"id":"gpt-4o-2024-11-20","name":"GPT-4o (2024-11-20)","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":2.5,"output":10,"cacheRead":1.25,"cacheWrite":0},"contextWindow":128000,"maxTokens":16384,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-4o-mini":{"id":"gpt-4o-mini","name":"GPT-4o mini","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":0.15,"output":0.6,"cacheRead":0.075,"cacheWrite":0},"contextWindow":128000,"maxTokens":16384,"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5":{"id":"gpt-5","name":"GPT-5","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":1.25,"output":10,"cacheRead":0.125,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":"minimal","low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5-chat-latest":{"id":"gpt-5-chat-latest","name":"GPT-5 Chat Latest","api":"openai-responses","baseUrl":"https://api.openai.com/v1","provider":"openai","reasoning":false,"input":["text","image"],"cost":{"input":1.25,"output":10,"cacheRead":0.125,"cacheWrite":0},"contextWindow":128000,"maxTokens":16384,"thinkingLevelMap":{"off":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5-mini":{"id":"gpt-5-mini","name":"GPT-5 Mini","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":0.25,"output":2,"cacheRead":0.025,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":"minimal","low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5-nano":{"id":"gpt-5-nano","name":"GPT-5 Nano","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":0.05,"output":0.4,"cacheRead":0.005,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":"minimal","low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5-pro":{"id":"gpt-5-pro","name":"GPT-5 Pro","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":15,"output":120,"cacheRead":0,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":null,"low":null,"medium":null,"high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.1":{"id":"gpt-5.1","name":"GPT-5.1","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":1.25,"output":10,"cacheRead":0.125,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.2":{"id":"gpt-5.2","name":"GPT-5.2","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":1.75,"output":14,"cacheRead":0.175,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.2-chat-latest":{"id":"gpt-5.2-chat-latest","name":"GPT-5.2 Chat","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":1.75,"output":14,"cacheRead":0.175,"cacheWrite":0},"contextWindow":128000,"maxTokens":16384,"thinkingLevelMap":{"off":null,"minimal":null,"low":null,"medium":"medium","high":null,"xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.2-pro":{"id":"gpt-5.2-pro","name":"GPT-5.2 Pro","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":21,"output":168,"cacheRead":0,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":null,"low":null,"medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.3-chat-latest":{"id":"gpt-5.3-chat-latest","name":"GPT-5.3 Chat (latest)","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":false,"input":["text","image"],"cost":{"input":1.75,"output":14,"cacheRead":0.175,"cacheWrite":0},"contextWindow":128000,"maxTokens":16384,"thinkingLevelMap":{"off":null,"xhigh":"xhigh"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.3-codex":{"id":"gpt-5.3-codex","name":"GPT-5.3 Codex","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":1.75,"output":14,"cacheRead":0.175,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.3-codex-spark":{"id":"gpt-5.3-codex-spark","name":"GPT-5.3 Codex Spark","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":1.75,"output":14,"cacheRead":0.175,"cacheWrite":0},"contextWindow":128000,"maxTokens":32000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.4":{"id":"gpt-5.4","name":"GPT-5.4","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":2.5,"output":15,"cacheRead":0.25,"cacheWrite":0,"tiers":[{"inputTokensAbove":272000,"input":5,"output":22.5,"cacheRead":0.5,"cacheWrite":0}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.4-mini":{"id":"gpt-5.4-mini","name":"GPT-5.4 mini","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":0.75,"output":4.5,"cacheRead":0.075,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.4-nano":{"id":"gpt-5.4-nano","name":"GPT-5.4 nano","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":0.2,"output":1.25,"cacheRead":0.02,"cacheWrite":0},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.4-pro":{"id":"gpt-5.4-pro","name":"GPT-5.4 Pro","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":30,"output":180,"cacheRead":0,"cacheWrite":0,"tiers":[{"inputTokensAbove":272000,"input":60,"output":270,"cacheRead":0,"cacheWrite":0}]},"contextWindow":1050000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":null,"low":null,"medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.5":{"id":"gpt-5.5","name":"GPT-5.5","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":5,"output":30,"cacheRead":0.5,"cacheWrite":0,"tiers":[{"inputTokensAbove":272000,"input":10,"output":45,"cacheRead":1,"cacheWrite":0}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.5-pro":{"id":"gpt-5.5-pro","name":"GPT-5.5 Pro","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":30,"output":180,"cacheRead":0,"cacheWrite":0,"tiers":[{"inputTokensAbove":272000,"input":60,"output":270,"cacheRead":0,"cacheWrite":0}]},"contextWindow":1050000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":null,"low":null,"medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.6-luna":{"id":"gpt-5.6-luna","name":"GPT-5.6 Luna","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":0.2,"output":1.2,"cacheRead":0.02,"cacheWrite":0.25,"tiers":[{"inputTokensAbove":272000,"input":0.4,"output":1.8,"cacheRead":0.04,"cacheWrite":0.5}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.6-sol":{"id":"gpt-5.6-sol","name":"GPT-5.6 Sol","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":4,"output":20,"cacheRead":0.4,"cacheWrite":5,"tiers":[{"inputTokensAbove":272000,"input":8,"output":30,"cacheRead":0.8,"cacheWrite":10}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-5.6-terra":{"id":"gpt-5.6-terra","name":"GPT-5.6 Terra","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":2,"output":12,"cacheRead":0.2,"cacheWrite":2.5,"tiers":[{"inputTokensAbove":272000,"input":4,"output":18,"cacheRead":0.4,"cacheWrite":5}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-6-astra":{"id":"gpt-6-astra","name":"GPT-6 Astra","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":10,"output":50,"cacheRead":1,"cacheWrite":12.5,"tiers":[{"inputTokensAbove":272000,"input":20,"output":75,"cacheRead":2,"cacheWrite":25}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-6-luna":{"id":"gpt-6-luna","name":"GPT-6 Luna","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":0.1,"output":0.5,"cacheRead":0.01,"cacheWrite":0.125,"tiers":[{"inputTokensAbove":272000,"input":0.2,"output":0.75,"cacheRead":0.02,"cacheWrite":0.25}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-6-sol":{"id":"gpt-6-sol","name":"GPT-6 Sol","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":2,"output":10,"cacheRead":0.2,"cacheWrite":2.5,"tiers":[{"inputTokensAbove":272000,"input":4,"output":15,"cacheRead":0.4,"cacheWrite":5}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-6.1-sol":{"id":"gpt-6.1-sol","name":"GPT-6.1 Sol","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":2,"output":10,"cacheRead":0.1,"cacheWrite":2.5,"tiers":[{"inputTokensAbove":272000,"input":4,"output":15,"cacheRead":0.2,"cacheWrite":5}]},"contextWindow":272000,"maxTokens":128000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsOpenAIGrammarTools":true,"supportsAdditionalTools":true,"supportsToolSearch":true,"supportsMidConvoSystemMessages":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-daybreak-blue-latest":{"id":"gpt-daybreak-blue-latest","name":"Daybreak Blue","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":4,"output":20,"cacheRead":0.4,"cacheWrite":5},"contextWindow":1050000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-daybreak-red-latest":{"id":"gpt-daybreak-red-latest","name":"Daybreak Red","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":12.5,"output":75,"cacheRead":1.25,"cacheWrite":15.625},"contextWindow":400000,"maxTokens":128000,"thinkingLevelMap":{"off":"none","minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},"compat":{"supportsStrictMode":true,"supportsExplicitPromptCacheMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:gpt-realtime-2.1":{"id":"gpt-realtime-2.1","name":"GPT-Realtime-2.1","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":4,"output":24,"cacheRead":0.4,"cacheWrite":0},"contextWindow":128000,"maxTokens":32000,"thinkingLevelMap":{"off":null,"minimal":"minimal","low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null},"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:o1":{"id":"o1","name":"o1","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":15,"output":60,"cacheRead":7.5,"cacheWrite":0},"contextWindow":200000,"maxTokens":100000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:o1-pro":{"id":"o1-pro","name":"o1-pro","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":150,"output":600,"cacheRead":0,"cacheWrite":0},"contextWindow":200000,"maxTokens":100000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:o3":{"id":"o3","name":"o3","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":2,"output":8,"cacheRead":0.5,"cacheWrite":0},"contextWindow":200000,"maxTokens":100000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:o3-mini":{"id":"o3-mini","name":"o3-mini","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text"],"cost":{"input":1.1,"output":4.4,"cacheRead":0.55,"cacheWrite":0},"contextWindow":200000,"maxTokens":100000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true},"type":"chat"},"chat:o3-pro":{"id":"o3-pro","name":"o3-pro","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":20,"output":80,"cacheRead":0,"cacheWrite":0},"contextWindow":200000,"maxTokens":100000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"},"chat:o4-mini":{"id":"o4-mini","name":"o4-mini","api":"openai-responses","provider":"openai","baseUrl":"https://api.openai.com/v1","reasoning":true,"input":["text","image"],"cost":{"input":1.1,"output":4.4,"cacheRead":0.275,"cacheWrite":0},"contextWindow":200000,"maxTokens":100000,"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":null,"max":null},"compat":{"supportsStrictMode":true},"inputLimits":{"maxRequestBytes":536870912,"images":{"maxPerRequest":1500,"resize":{"maxWidth":2000,"maxHeight":2000,"maxBytes":4718592,"jpegQuality":80}}},"type":"chat"}}')
};
function flattenModelCatalog(groups, type) {
  return Object.fromEntries(Object.values(groups).flatMap((models) => Object.values(models)).filter((model) => model.type === type).map((model) => [model.id, model]));
}
function flattenChatModelCatalog(_provider, groups) {
  return flattenModelCatalog(groups, "chat");
}
function flattenImageModelCatalog(_provider, groups) {
  return flattenModelCatalog(groups, "image");
}
function flattenClassifierModelCatalog(_provider, groups) {
  return flattenModelCatalog(groups, "classifier");
}
const OPENAI_MODELS = flattenChatModelCatalog("openai", values);
flattenImageModelCatalog("openai", values);
flattenClassifierModelCatalog("openai", values);
function openaiProvider() {
  return createProvider({
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    auth: {
      apiKey: envApiKeyAuth("OpenAI API key", ["OPENAI_API_KEY"]),
      oauth: lazyOAuth({
        name: "OpenAI (ChatGPT subscription)",
        isSubscription: true,
        loginLabel: "Sign in with ChatGPT",
        load: loadOpenAIChatGPTOAuth
      })
    },
    models: Object.values(OPENAI_MODELS),
    api: openAIResponsesApi()
  });
}
const openai = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  openaiProvider
}, Symbol.toStringTag, { value: "Module" }));
exports.AssistantMessageEventStream = AssistantMessageEventStream;
exports.calculateCost = calculateCost;
exports.clampThinkingLevel = clampThinkingLevel;
exports.openai = openai;
