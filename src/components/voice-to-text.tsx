"use client";

import { useState, useRef, useEffect } from 'react';
import { Copy, Mic, LoaderCircle, Languages } from 'lucide-react';
import { transcribeLiveSpeech } from '@/ai/flows/transcribe-live-speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { transcriptionLanguages } from '@/lib/languages';

export function VoiceToTextCard() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(transcriptionLanguages[0].value);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const handleStartRecording = async () => {
    setTranscription('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          try {
            const result = await transcribeLiveSpeech({
              audioDataUri: base64Audio,
              languageCode: selectedLanguage,
            });
            setTranscription(result.transcription);
          } catch (error) {
            console.error('Transcription failed:', error);
            toast({
              variant: 'destructive',
              title: 'Transcription Failed',
              description: 'Could not transcribe the audio. Please try again.',
            });
          } finally {
            setIsProcessing(false);
            stream.getTracks().forEach(track => track.stop());
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Could not get microphone access:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description: 'Please allow microphone access in your browser settings to use this feature.',
      });
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  const handleToggleRecording = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  const handleCopy = () => {
    if (!transcription) return;
    navigator.clipboard.writeText(transcription);
    toast({
      title: 'Copied to clipboard!',
    });
  };
  
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const getLanguageLabel = (value: string) => {
    return transcriptionLanguages.find(lang => lang.value === value)?.label || '';
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Voice to Text</CardTitle>
        <CardDescription>
          Record your voice in{' '}
          <span className="font-semibold text-primary">{getLanguageLabel(selectedLanguage)}</span>{' '}
          and get it transcribed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col gap-4">
        <div className="relative flex-grow">
          <Textarea
            placeholder={isProcessing ? "Processing audio..." : "Your transcribed text will appear here..."}
            value={transcription}
            readOnly
            className="h-full min-h-[150px] resize-none"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleCopy}
            disabled={!transcription || isProcessing}
            aria-label="Copy transcription"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Languages className="h-5 w-5 text-muted-foreground" />
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage} disabled={isRecording || isProcessing}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {transcriptionLanguages.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-grow" />
        <Button
          onClick={handleToggleRecording}
          disabled={isProcessing}
          variant={isRecording ? 'destructive' : 'default'}
          className={`w-full sm:w-auto transition-colors ${isRecording ? 'animate-pulse-mic' : ''}`}
        >
          {isProcessing ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mic className="mr-2 h-4 w-4" />
          )}
          {isProcessing ? 'Processing...' : isRecording ? 'Stop Recording' : 'Start Recording'}
        </Button>
      </CardFooter>
    </Card>
  );
}
