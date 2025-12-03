import { VoiceToTextCard } from '@/components/voice-to-text';
import { TextToVoiceCard } from '@/components/text-to-voice';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-primary font-headline tracking-tight">
          LinguaFlow
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Your AI-Powered Voice and Text Translator
        </p>
      </header>
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
        <VoiceToTextCard />
        <TextToVoiceCard />
      </main>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>Powered by Google AI</p>
      </footer>
    </div>
  );
}
