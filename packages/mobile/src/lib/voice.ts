import * as Speech from "expo-speech";

export interface SpeakOptions {
  language?: string;
  pitch?: number;
  rate?: number;
}

export async function speak(text: string, options?: SpeakOptions): Promise<void> {
  try {
    await Speech.speak(text, {
      language: options?.language ?? "en-US",
      pitch: options?.pitch ?? 1.0,
      rate: options?.rate ?? 0.9,
    });
  } catch {
    // Silently fail if speech is unavailable
  }
}

export function stop(): void {
  try {
    Speech.stop();
  } catch {
    // Silently fail
  }
}

export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return false;
  }
}
