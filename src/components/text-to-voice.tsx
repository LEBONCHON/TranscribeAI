"use client";

import { useState, useRef, useEffect } from 'react';
import { Volume2, LoaderCircle, User } from 'lucide-react';
import { generateSpokenAudio } from '@/ai/flows/generate-spoken-audio';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { textToSpeechVoices } from '@/lib/languages';

export function TextToVoiceCard() {
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(textToSpeechVoices[0].value);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  const handleGenerateAudio = async () => {
    if (!inputText.trim()) {
      toast({
        variant: 'destructive',
        title: 'Input Text is Empty',
        description: 'Please enter some text to generate audio.',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateSpokenAudio({
        text: inputText,
        voice: selectedVoice,
      });
      setAudioUrl(result.audioDataUri);
    } catch (error) {
      console.error('Audio generation failed:', error);
      toast({
        variant: 'destructive',
        title: 'Audio Generation Failed',
        description: 'Could not generate audio. Please try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play().catch(e => {
        console.error("Audio playback failed:", e);
        toast({
            variant: 'destructive',
            title: 'Playback Error',
            description: 'Could not play the generated audio automatically.',
        });
      });
    }
  }, [audioUrl, toast]);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Text to Voice</CardTitle>
        <CardDescription>Enter text to generate spoken audio in the selected voice.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <Textarea
          placeholder="Type or paste your text here..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="h-full min-h-[150px] resize-none"
        />
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <User className="h-5 w-5 text-muted-foreground" />
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select voice" />
            </SelectTrigger>
            <SelectContent>
              {textToSpeechVoices.map((voice) => (
                <SelectItem key={voice.value} value={voice.value}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-grow" />
        <Button onClick={handleGenerateAudio} disabled={isGenerating || !inputText} className="w-full sm:w-auto">
          {isGenerating ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Volume2 className="mr-2 h-4 w-4" />
          )}
          {isGenerating ? 'Generating...' : 'Generate Audio'}
        </Button>
      </CardFooter>
      {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" controls />}
    </Card>
  );
}
