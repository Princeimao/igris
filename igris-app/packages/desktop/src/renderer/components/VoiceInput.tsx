import React, { useState, useEffect, useRef } from 'react';

// Web Speech API interfaces
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** Visual tone; defaults to dark (for use on dark glass). */
  tone?: 'dark' | 'light';
  /** Fires when the microphone starts/stops listening. */
  onListeningChange?: (listening: boolean) => void;
  /** Increment to request listening externally (wake word). */
  listenSignal?: number;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, disabled, tone = 'dark', onListeningChange, listenSignal = 0 }) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(onListeningChange);
  listeningRef.current = onListeningChange;
  const stateRef = useRef({ disabled: !!disabled, isListening: false });
  stateRef.current.disabled = !!disabled;
  stateRef.current.isListening = isListening;

  const setListening = (value: boolean) => {
    setIsListening(value);
    listeningRef.current?.(value);
  };

  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result?.isFinal) {
            finalTranscript += result[0]?.transcript ?? '';
          }
        }
        if (finalTranscript) {
          onTranscript(finalTranscript.trim());
          setListening(false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('[VoiceInput] Speech recognition error:', event.error);
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onTranscript]);

  // External listen requests (wake word). Skips the initial render (0).
  useEffect(() => {
    if (!listenSignal) return;
    if (stateRef.current.disabled) return;
    if (stateRef.current.isListening) return;
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (err) {
      console.error('[VoiceInput] Failed to start recognition:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenSignal]);

  const toggleListening = () => {    if (disabled || !recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch (err) {
        console.error('[VoiceInput] Failed to start recognition:', err);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      title={isListening ? "Listening... click to stop" : "Start voice command"}
      className={`relative p-2 rounded-full transition-all duration-200 active:scale-90 flex items-center justify-center ${
        isListening
          ? 'bg-red-500/20 text-red-400 ring-2 ring-red-500/50 animate-pulse'
          : tone === 'light'
            ? 'bg-black/[0.05] hover:bg-black/10 text-black/60 hover:text-black'
            : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
      }`}
    >
      {/* Mic SVG Icon */}
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
      {isListening && (
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}
    </button>
  );
};
