import React, { useState, useRef, useEffect } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import AudioVisualizer from './components/AudioVisualizer';

// Icons
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const MAX_USES = 5;
const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Usage Limit State
  const [usesCount, setUsesCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string>('');

  const serviceRef = useRef<GeminiLiveService | null>(null);

  // Initialize and check limits on mount
  useEffect(() => {
    const storedCount = parseInt(localStorage.getItem('mentorUsesCount') || '0', 10);
    const storedBlockTime = localStorage.getItem('mentorBlockTimestamp');

    setUsesCount(storedCount);

    if (storedBlockTime) {
      const blockTime = parseInt(storedBlockTime, 10);
      const now = Date.now();
      const diff = now - blockTime;

      if (diff < BLOCK_DURATION_MS) {
        setIsBlocked(true);
        updateRemainingTime(blockTime);
      } else {
        resetUsage();
      }
    }
  }, []);

  // Timer for countdown when blocked
  useEffect(() => {
    let interval: number;
    if (isBlocked) {
      // Update immediately
      const storedBlockTime = localStorage.getItem('mentorBlockTimestamp');
      if (storedBlockTime) {
        updateRemainingTime(parseInt(storedBlockTime, 10));
      }

      // Update every minute
      interval = window.setInterval(() => {
        const blockTimeStr = localStorage.getItem('mentorBlockTimestamp');
        if (blockTimeStr) {
          const blockTime = parseInt(blockTimeStr, 10);
          const now = Date.now();
          if (now - blockTime >= BLOCK_DURATION_MS) {
            resetUsage();
          } else {
            updateRemainingTime(blockTime);
          }
        }
      }, 60000);
    }
    return () => clearInterval(interval);
  }, [isBlocked]);

  const resetUsage = () => {
    localStorage.setItem('mentorUsesCount', '0');
    localStorage.removeItem('mentorBlockTimestamp');
    setUsesCount(0);
    setIsBlocked(false);
    setRemainingTime('');
  };

  const updateRemainingTime = (blockTime: number) => {
    const now = Date.now();
    const msRemaining = (blockTime + BLOCK_DURATION_MS) - now;
    
    if (msRemaining <= 0) {
      resetUsage();
      return;
    }

    const hours = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    setRemainingTime(`${hours}h ${minutes}min`);
  };

  const handleConnect = async () => {
    if (isBlocked) return;

    // Increment Usage Logic
    const nextCount = usesCount + 1;
    setUsesCount(nextCount);
    localStorage.setItem('mentorUsesCount', nextCount.toString());

    if (nextCount >= MAX_USES) {
      const now = Date.now();
      localStorage.setItem('mentorBlockTimestamp', now.toString());
      // We allow this current session to proceed, but future attempts will be blocked
      // checking happens at start of handleConnect next time, but we update UI state now for consistency
      // However, we want the user to perform THIS action. Blocking happens AFTER this action is initiated for the next time.
      // But for UI feedback, if this is the 5th use, we don't set isBlocked=true YET, 
      // otherwise it might look weird if we disconnect and can't reconnect immediately.
      // Actually, per rules: "Após 5 usos". So the 5th use is valid. The 6th is not.
      // We will set the block timestamp now, so next time page loads or function runs it blocks.
      // To prevent spamming immediately after disconnect, we can set isBlocked local state true 
      // *after* this session disconnects, or just let the user see the "Limit Reached" message after they finish this call.
    }

    setError(null);
    setIsConnecting(true);

    const service = new GeminiLiveService({
      onConnect: () => {
        setIsConnected(true);
        setIsConnecting(false);
      },
      onDisconnect: () => {
        setIsConnected(false);
        setIsConnecting(false);
        setVolume(0);
        
        // Check if we just finished the last allowed session
        const currentCount = parseInt(localStorage.getItem('mentorUsesCount') || '0', 10);
        if (currentCount >= MAX_USES) {
            setIsBlocked(true);
            const ts = localStorage.getItem('mentorBlockTimestamp');
            if (ts) updateRemainingTime(parseInt(ts, 10));
        }
      },
      onVolumeChange: (vol) => {
        setVolume(vol);
      },
      onError: (err) => {
        setError(err);
        setIsConnecting(false);
        setIsConnected(false);
      }
    });

    serviceRef.current = service;
    await service.connect();
  };

  const handleDisconnect = () => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen relative selection:bg-[#E50914] selection:text-white">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 via-[#0A0A0A] to-[#0A0A0A] -z-10" />

      {/* Header */}
      <header className="absolute top-8 flex flex-col items-center gap-2">
        <h1 className="text-xl md:text-2xl font-bold tracking-widest text-[#9FB4C7] uppercase border-b border-[#9FB4C7] pb-2">
          Mentor da Evolução
        </h1>
        <span className="text-xs tracking-[0.3em] text-[#E50914] font-semibold">
          MODO VOZ
        </span>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center gap-12 w-full max-w-md px-4">
        
        {/* Visualizer Area */}
        <div className="relative">
          <AudioVisualizer volume={volume} isActive={isConnected} />
        </div>

        {/* Status Text / Block Message */}
        <div className="h-16 flex flex-col items-center justify-center text-center gap-1">
          {isBlocked ? (
            <>
              <p className="text-[#E50914] text-sm font-bold tracking-wide animate-pulse">
                LIMITE DE CONSULTAS ATINGIDO
              </p>
              <p className="text-[#9FB4C7] text-xs">
                Disponível novamente em: <span className="text-white font-mono">{remainingTime}</span>
              </p>
            </>
          ) : (
            <>
              {isConnecting && (
                <p className="text-[#9FB4C7] text-sm animate-pulse">Estabelecendo conexão...</p>
              )}
              {isConnected && (
                <p className="text-[#FFD700] text-sm font-medium tracking-wide">MENTOR OUVINDO</p>
              )}
              {!isConnected && !isConnecting && !error && (
                <div className="flex flex-col gap-1">
                    <p className="text-gray-500 text-sm">Toque para iniciar a mentoria</p>
                    <p className="text-gray-700 text-[10px] uppercase tracking-wider">
                        Usos hoje: <span className={usesCount >= 4 ? "text-[#E50914]" : "text-gray-500"}>{usesCount}</span>/{MAX_USES}
                    </p>
                </div>
              )}
              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting || isBlocked}
              className={`
                group relative flex items-center justify-center w-20 h-20 rounded-full 
                shadow-lg transition-all duration-300
                ${isBlocked 
                    ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700" 
                    : "bg-[#E50914] text-white hover:scale-105 hover:shadow-[0_0_30px_rgba(229,9,20,0.4)]"
                }
                disabled:opacity-80
              `}
            >
              {!isBlocked && (
                  <div className="absolute inset-0 rounded-full border border-white/20 scale-110 group-hover:scale-125 transition-transform duration-500" />
              )}
              {isBlocked ? <LockIcon /> : <MicIcon />}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="
                group relative flex items-center justify-center w-20 h-20 rounded-full 
                bg-gray-800 text-[#9FB4C7] border border-gray-700 shadow-lg 
                transition-all duration-300 hover:bg-gray-700 hover:text-white
              "
            >
              <StopIcon />
            </button>
          )}
        </div>
      </main>

      {/* Footer / Instructions */}
      <footer className="absolute bottom-8 text-center px-6">
        <p className="text-gray-600 text-xs font-mono">
          {isBlocked 
            ? "O DESCANSO TAMBÉM FAZ PARTE DO PROCESSO. EXECUTE."
            : "SEM TEXTO. SEM DESCULPAS. APENAS EXECUÇÃO."
          }
        </p>
      </footer>
    </div>
  );
};

export default App;