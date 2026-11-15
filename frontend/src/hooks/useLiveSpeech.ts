import { useState, useRef, useEffect, useCallback } from 'react';

interface UseLiveSpeechOptions {
  onFinalTranscript?: (transcript: string) => void;
  lang?: string;
}

export function useLiveSpeechRecognition(options: UseLiveSpeechOptions = {}) {
  const { onFinalTranscript, lang = 'en-US' } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const isStoppingManuallyRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: any) => {
      let currentInterim = '';
      let accumulatedFinal = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          accumulatedFinal += result[0].transcript + ' ';
        } else {
          currentInterim += result[0].transcript;
        }
      }

      if (accumulatedFinal) {
        setFinalText(accumulatedFinal.trim());
        if (onFinalTranscript) {
          onFinalTranscript(accumulatedFinal.trim());
        }
      }
      setInterimText(currentInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Normal silence timeout
        return;
      }
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please allow microphone access.');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (!isStoppingManuallyRef.current && isListening) {
        // Auto-restart if continuous mode drops unexpectedly
        try {
          recognition.start();
          return;
        } catch {}
      }
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, [lang, onFinalTranscript, isListening]);

  const startListening = useCallback(() => {
    setError(null);
    setInterimText('');
    setFinalText('');
    isStoppingManuallyRef.current = false;

    if (!recognitionRef.current) {
      setError('Live speech recognition is not supported in this browser.');
      return;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err: any) {
      // If already started
      setIsListening(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    isStoppingManuallyRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const clearTranscript = useCallback(() => {
    setFinalText('');
    setInterimText('');
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    interimText,
    finalText,
    setFinalText,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
