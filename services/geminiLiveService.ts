import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { MENTOR_SYSTEM_INSTRUCTION } from "../constants";
import { arrayBufferToBase64, decodeAudioData, float32ToInt16 } from "../utils/audioUtils";

interface GeminiLiveOptions {
  onConnect: () => void;
  onDisconnect: () => void;
  onVolumeChange: (volume: number) => void; // Visualizer
  onError: (error: string) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private sessionPromise: Promise<any> | null = null;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private options: GeminiLiveOptions;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;

  constructor(options: GeminiLiveOptions) {
    this.options = options;
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY is not defined");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect() {
    try {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const config = {
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: MENTOR_SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }, // Charon: Voz masculina, profunda e estável.
          },
        },
      };

      this.sessionPromise = this.ai.live.connect({
        model: config.model,
        config: config.config,
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onclose: this.handleClose.bind(this),
          onerror: this.handleError.bind(this),
        },
      });

    } catch (error) {
      this.options.onError(error instanceof Error ? error.message : "Failed to connect");
      this.disconnect();
    }
  }

  private handleOpen() {
    console.log("Gemini Live Connected");
    this.options.onConnect();
    this.startAudioInput();
    // Removed session.send call as it is not supported in the current SDK version.
    // The systemInstruction is relied upon for the welcome message.
  }

  private startAudioInput() {
    if (!this.inputAudioContext || !this.stream) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.options.onVolumeChange(rms * 5); // Scale up for visibility

      // Convert to PCM 16-bit
      const int16Data = float32ToInt16(inputData);
      const base64Data = arrayBufferToBase64(int16Data.buffer);

      if (this.sessionPromise) {
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({
            media: {
              mimeType: "audio/pcm;rate=16000",
              data: base64Data,
            },
          });
        });
      }
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (audioData && this.outputAudioContext) {
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }

      // Decode audio (base64 -> Uint8Array -> AudioBuffer)
      const binaryString = atob(audioData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await decodeAudioData(bytes, this.outputAudioContext, 24000, 1);
      
      // Schedule playback
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);

      const currentTime = this.outputAudioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      
      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
      };
    }

    if (message.serverContent?.interrupted) {
        this.stopAudioOutput();
    }
  }

  private stopAudioOutput() {
      this.activeSources.forEach(source => {
          try { source.stop(); } catch(e) {}
      });
      this.activeSources.clear();
      this.nextStartTime = 0;
  }

  private handleClose() {
    console.log("Gemini Live Closed");
    this.disconnect();
  }

  private handleError(e: ErrorEvent) {
    console.error("Gemini Live Error", e);
    this.options.onError("Connection error occurred.");
    this.disconnect();
  }

  disconnect() {
    // Stop input processing
    if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
    }
    if (this.inputSource) {
        this.inputSource.disconnect();
    }
    if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.inputAudioContext) {
        this.inputAudioContext.close();
    }

    // Stop output
    this.stopAudioOutput();
    if (this.outputAudioContext) {
        this.outputAudioContext.close();
    }
    
    this.options.onDisconnect();
  }
}