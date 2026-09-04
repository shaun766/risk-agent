import OpenAI from 'openai';
import { env, hasOpenAI } from '../config/env';

let client: OpenAI | null = null;

function openai(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.OPENAI_TIMEOUT_MS });
  }
  return client;
}

export interface TranscriptionResult {
  ok: boolean;
  text: string | null;
  reason?: string;
}

/**
 * Speech-to-text for WhatsApp voice notes and calls.
 *
 * Returns a structured failure rather than throwing: a user who sends a voice
 * note should get a helpful "send that as text" reply, not a silent drop.
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType = 'audio/ogg',
): Promise<TranscriptionResult> {
  if (!hasOpenAI) {
    return {
      ok: false,
      text: null,
      reason: 'Speech-to-text requires OPENAI_API_KEY to be configured.',
    };
  }
  if (audio.length === 0) {
    return { ok: false, text: null, reason: 'The audio file was empty.' };
  }

  try {
    const extension = mimeType.includes('mp4')
      ? 'mp4'
      : mimeType.includes('mpeg')
        ? 'mp3'
        : mimeType.includes('wav')
          ? 'wav'
          : 'ogg';
    const file = new File([new Uint8Array(audio)], `voice-note.${extension}`, { type: mimeType });

    const response = await openai().audio.transcriptions.create({
      file,
      model: env.OPENAI_TRANSCRIBE_MODEL,
    });
    const text = response.text?.trim() ?? '';
    return text ? { ok: true, text } : { ok: false, text: null, reason: 'No speech detected.' };
  } catch (error) {
    return {
      ok: false,
      text: null,
      reason: error instanceof Error ? error.message : 'Transcription failed',
    };
  }
}

export interface SynthesisResult {
  ok: boolean;
  audio: Buffer | null;
  mimeType: string;
  reason?: string;
}

/** Text-to-speech for optional spoken replies. */
export async function synthesizeSpeech(text: string): Promise<SynthesisResult> {
  if (!hasOpenAI || !env.VOICE_REPLY_ENABLED) {
    return {
      ok: false,
      audio: null,
      mimeType: 'audio/ogg',
      reason: 'Voice replies are disabled or OPENAI_API_KEY is not configured.',
    };
  }

  try {
    const response = await openai().audio.speech.create({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      // WhatsApp voice notes are Opus in an Ogg container.
      response_format: 'opus',
      input: stripForSpeech(text),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { ok: true, audio: buffer, mimeType: 'audio/ogg' };
  } catch (error) {
    return {
      ok: false,
      audio: null,
      mimeType: 'audio/ogg',
      reason: error instanceof Error ? error.message : 'Speech synthesis failed',
    };
  }
}

/**
 * Markdown, emoji and bullet glyphs are noise when spoken aloud, and a long
 * card reads badly as audio — so the spoken version is trimmed.
 */
export function stripForSpeech(text: string, maxChars = 900): string {
  const cleaned = text
    .replace(/[*_`#]/g, '')
    .replace(/^[•\-]\s*/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
}
