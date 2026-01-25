import React from 'react';

interface AudioVisualizerProps {
  volume: number; // 0 to 1 range (roughly)
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, isActive }) => {
  // Use a simple pulsing circle approach for the minimalist aesthetic
  // Base scale is 1, max scale depends on volume
  const scale = isActive ? 1 + Math.min(volume, 1.5) : 1;
  const opacity = isActive ? 0.8 : 0.3;

  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Outer Glow Ring */}
      {isActive && (
        <div 
          className="absolute rounded-full bg-[#E50914] blur-xl transition-all duration-75 ease-out"
          style={{
            width: '100%',
            height: '100%',
            transform: `scale(${scale * 1.2})`,
            opacity: volume * 0.5
          }}
        />
      )}
      
      {/* Main Core Circle */}
      <div 
        className="rounded-full bg-[#E50914] transition-all duration-75 ease-out z-10 shadow-[0_0_20px_rgba(229,9,20,0.6)]"
        style={{
          width: '120px',
          height: '120px',
          transform: `scale(${scale})`,
          opacity: opacity
        }}
      />
      
      {/* Static Inner Border for "Structure" */}
      <div className="absolute w-32 h-32 rounded-full border border-[#9FB4C7] opacity-20 pointer-events-none" />
      <div className="absolute w-40 h-40 rounded-full border border-[#9FB4C7] opacity-10 pointer-events-none" />
    </div>
  );
};

export default AudioVisualizer;