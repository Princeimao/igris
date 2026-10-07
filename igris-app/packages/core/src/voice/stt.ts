// Speech-to-Text interface — decoupled from agent implementation.
// The renderer implements this using Web Speech API.
// A production implementation can swap in Whisper, Nemotron STT, etc.
export interface SpeechToText {
  /** Start listening. Resolves when recording begins. */
  start(): Promise<void>;
  /** Stop listening. Resolves with the transcribed text. */
  stop(): Promise<string>;
  readonly isListening: boolean;
}

/**
 * No-op stub used in the main process / tests.
 * The renderer supplies a real implementation via Web Speech API.
 */
export class SttStub implements SpeechToText {
  private _isListening = false;

  get isListening(): boolean {
    return this._isListening;
  }

  async start(): Promise<void> {
    this._isListening = true;
    console.log('[STT stub] Listening started');
  }

  async stop(): Promise<string> {
    this._isListening = false;
    console.log('[STT stub] Listening stopped');
    return '';
  }
}
