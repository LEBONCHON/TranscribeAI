'use server';
/**
 * @fileOverview A flow for transcribing live speech to text using the Google Speech-to-Text API directly.
 * This implementation includes retry/backoff for transient errors and specific handling for API-level errors.
 *
 * - transcribeLiveSpeech - A function that handles the live speech transcription process.
 * - TranscribeLiveSpeechInput - The input type for the transcribeLiveSpeech function.
 * - TranscribeLiveSpeechOutput - The return type for the transcribeLiveSpeech function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TranscribeLiveSpeechInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "Audio data as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
  languageCode: z
    .string()
    .optional()
    .describe('The language code of the audio, e.g., en-US.'),
  apiKey: z.string().optional().describe('Optional Google API key.'),
});
export type TranscribeLiveSpeechInput = z.infer<typeof TranscribeLiveSpeechInputSchema>;

const TranscribeLiveSpeechOutputSchema = z.object({
  transcription: z.string().describe('The transcribed text from the audio.'),
});
export type TranscribeLiveSpeechOutput = z.infer<typeof TranscribeLiveSpeechOutputSchema>;

export async function transcribeLiveSpeech(input: TranscribeLiveSpeechInput): Promise<TranscribeLiveSpeechOutput> {
  return transcribeLiveSpeechFlow(input);
}

// Helpers
function validateDataUri(uri: string) {
  const match = /^data:([a-zA-Z0-9\/\-\+\.]+);base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!match) {
    throw new Error(
      "Invalid audioDataUri. Expected a data URI containing a MIME type and base64-encoded data, e.g. 'data:audio/wav;base64,<encoded>'"
    );
  }
  return { mimeType: match[1], base64: match[2] };
}

async function fetchWithTimeout(resource: RequestInfo | URL, options: RequestInit, timeout: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(id);
  return response;
}

function mimeTypeToEncoding(mimeType: string): { encoding: string | null } {
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes('webm')) return { encoding: 'WEBM_OPUS' };
  if (lowerMime.includes('wav')) return { encoding: 'WAV' };
  if (lowerMime.includes('mp3')) return { encoding: 'MP3' };
  if (lowerMime.includes('flac')) return { encoding: 'FLAC' };
  if (lowerMime.includes('amr')) return { encoding: 'AMR' };
  if (lowerMime.includes('ogg')) return { encoding: 'OGG_OPUS' };
  // Let the API auto-detect if not a known type
  return { encoding: null };
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

const transcribeLiveSpeechFlow = ai.defineFlow(
  {
    name: 'transcribeLiveSpeechFlow',
    inputSchema: TranscribeLiveSpeechInputSchema,
    outputSchema: TranscribeLiveSpeechOutputSchema,
  },
  async input => {
    const { mimeType, base64 } = validateDataUri(input.audioDataUri);

    // Determine API key to use
    const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'No Google API key provided. Set GEMINI_API_KEY in environment or pass apiKey in the input.'
      );
    }

    const languageCode = input.languageCode ?? 'en-US';

    // Infer encoding if possible
    const { encoding } = mimeTypeToEncoding(mimeType);

    // Build request body. Omit encoding if unknown to let service attempt auto-detection.
    const config: any = {
      languageCode,
      enableAutomaticPunctuation: true,
      model: 'default',
    };
    if (encoding) config.encoding = encoding;

    const body = {
      config,
      audio: {
        content: base64,
      },
    };

    const url = `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        if (attempt > 1) {
          await new Promise(r => setTimeout(r, backoff));
        }

        const resp = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }, 60_000); // 60s timeout

        const text = await resp.text();
        let json: any;
        try {
          json = text ? JSON.parse(text) : undefined;
        } catch (parseErr) {
          throw new Error(`Unexpected non-JSON response from Speech API: ${text}`);
        }

        if (!resp.ok) {
          const status = resp.status;
          const serverMessage = json?.error?.message ?? JSON.stringify(json);
          const err = new Error(`Speech API error (status ${status}): ${serverMessage}`);
          if (status === 401 || status === 403 || status === 402) {
            throw err; // Non-retriable
          }
          lastError = err;
          if (attempt === MAX_ATTEMPTS) throw err;
          continue;
        }
        
        if (!json || !Array.isArray(json.results) || json.results.length === 0) {
          lastError = new Error(`Speech API returned no transcription results: ${JSON.stringify(json)}`);
          if (attempt === MAX_ATTEMPTS) throw lastError;
          continue;
        }

        const transcripts: string[] = [];
        for (const r of json.results) {
          const alt = Array.isArray(r.alternatives) && r.alternatives[0];
          if (alt && typeof alt.transcript === 'string') transcripts.push(alt.transcript);
        }
        const transcription = transcripts.join(' ').trim();

        if (!transcription) {
          lastError = new Error(`Speech API returned empty transcript text: ${JSON.stringify(json)}`);
          if (attempt === MAX_ATTEMPTS) throw lastError;
          continue;
        }

        return { transcription };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = String(lastError.message || '').toLowerCase();
        
        if (msg.includes('status 401') || msg.includes('status 403') || msg.includes('payment required')) {
          throw new Error(
            `Non-retriable error from Google Speech API: ${lastError.message}. Check API key validity, API & billing enabled, and key restrictions.`
          );
        }

        if (attempt === MAX_ATTEMPTS) {
          const finalErr = new Error(`Transcription failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError.message}`);
          (finalErr as any).lastError = lastError;
          throw finalErr;
        }
        
        continue;
      }
    }

    // This should not be reached if the loop logic is correct.
    throw new Error(`Transcription failed. Last error: ${lastError?.message ?? 'unknown'}`);
  }
);
