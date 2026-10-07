export interface ModelMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ModelRequest {
  systemPrompt?: string | undefined;
  messages: ModelMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

export interface ModelResponse {
  content: string;
  model: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}

export interface ModelProvider {
  generate(request: ModelRequest): Promise<ModelResponse>;
  readonly modelId: string;
}
