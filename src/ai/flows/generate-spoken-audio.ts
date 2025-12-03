'use server';

/**
 * @fileOverview Generates spoken audio from text input.
 *
 * - generateSpokenAudio - A function that generates spoken audio from text.
 * - GenerateSpokenAudioInput - The input type for the generateSpokenAudio function.
 * - GenerateSpokenAudioOutput - The return type for the generateSpokenAudio function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import wav from 'wav';

const GenerateSpokenAudioInputSchema = z.object({
  text: z.string().describe('The text to be converted to spoken audio.'),
  voice: z.string().optional().describe('The voice to use for speech synthesis. Optional.'),
});
export type GenerateSpokenAudioInput = z.infer<typeof GenerateSpokenAudioInputSchema>;

const GenerateSpokenAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The audio data URI of the generated spoken audio.'),
});
export type GenerateSpokenAudioOutput = z.infer<typeof GenerateSpokenAudioOutputSchema>;

export async function generateSpokenAudio(input: GenerateSpokenAudioInput): Promise<GenerateSpokenAudioOutput> {
  return generateSpokenAudioFlow(input);
}

const generateSpokenAudioFlow = ai.defineFlow(
  {
    name: 'generateSpokenAudioFlow',
    inputSchema: GenerateSpokenAudioInputSchema,
    outputSchema: GenerateSpokenAudioOutputSchema,
  },
  async input => {
    const { media } = await ai.generate({
      model: 'googleai/gemini-2.5-flash-preview-tts',
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: input.voice ?? 'Algenib' },
          },
        },
      },
      prompt: input.text,
    });

    if (!media) {
      throw new Error('No media returned from TTS generation.');
    }

    const audioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );
    const audioDataUri = 'data:audio/wav;base64,' + (await toWav(audioBuffer));

    return {
      audioDataUri,
    };
  }
);

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}
