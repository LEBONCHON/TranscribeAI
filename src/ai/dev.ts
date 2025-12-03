import { config } from 'dotenv';
config();

import '@/ai/flows/generate-spoken-audio.ts';
import '@/ai/flows/transcribe-live-speech.ts';