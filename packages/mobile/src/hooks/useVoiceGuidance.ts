import { useState, useCallback, useRef, useEffect } from "react";
import * as voice from "../lib/voice";

export function useVoiceGuidance() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearPoll();
  }, [clearPoll]);

  const speakStep = useCallback(
    async (text: string) => {
      clearPoll();
      await voice.speak(text);
      setIsSpeaking(true);

      pollRef.current = setInterval(async () => {
        const speaking = await voice.isSpeaking();
        if (!speaking) {
          setIsSpeaking(false);
          clearPoll();
        }
      }, 250);
    },
    [clearPoll],
  );

  const stopSpeaking = useCallback(() => {
    voice.stop();
    setIsSpeaking(false);
    clearPoll();
  }, [clearPoll]);

  return { speakStep, stopSpeaking, isSpeaking };
}
