// Text-to-Speech interface — decoupled from agent implementation.
// The renderer implements this using the Web Speech API (SpeechSynthesis).
// A production implementation can use Nemotron TTS or another service.
export interface TextToSpeech {
  speak(text: string): Promise<void>;
  stop(): void;
}

/**
 * No-op stub used in the main process / tests.
 * The renderer supplies a real implementation via SpeechSynthesis API.
 */
export class TtsStub implements TextToSpeech {
  async speak(text: string): Promise<void> {
    console.log(`[TTS stub] Speaking: ${text}`);
  }

  stop(): void {
    console.log('[TTS stub] Stopped');
  }
}
