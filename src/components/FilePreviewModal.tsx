/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  Download, 
  FileText, 
  FileVideo, 
  Music, 
  FileArchive, 
  ImageIcon, 
  Layers, 
  Zap, 
  File as FileIcon, 
  Info,
  Clock,
  Check,
  RotateCw,
  Maximize2,
  Minimize2,
  Sun
} from 'lucide-react';
import { StorageItem } from '../types';

interface FilePreviewModalProps {
  item: StorageItem;
  onClose: () => void;
  onExtractSimulated: (name: string, type: 'file' | 'folder', size: number, ext?: string) => void;
}

export default function FilePreviewModal({
  item,
  onClose,
  onExtractSimulated
}: FilePreviewModalProps) {
  const itemName = item.name || '';
  const isVideo = itemName.match(/\.(mp4|mkv|mov|avi|webm)$/i);
  const isAudio = itemName.match(/\.(mp3|wav|ogg|aac|m4a)$/i);
  const isImage = itemName.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
  const isZip = itemName.match(/\.(zip|rar|7z|tar|gz)$/i);
  const isText = itemName.match(/\.(txt|md|json|js|ts|html|css)$/i);

  // Video / Audio Playback Controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const videoProgressBarRef = useRef<HTMLDivElement>(null);
  const audioProgressBarRef = useRef<HTMLDivElement>(null);

  // Advanced video player states & refs (Fullscreen, Rotation, Swipe Controls)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [brightness, setBrightness] = useState(1.0); // 0.1 to 2.0
  const [activeGesture, setActiveGesture] = useState<'volume' | 'brightness' | null>(null);
  const [gestureValue, setGestureValue] = useState<number>(0);
  
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; side: 'left' | 'right'; startVal: number } | null>(null);
  const mouseStartRef = useRef<{ x: number; y: number; side: 'left' | 'right'; startVal: number } | null>(null);
  const gestureTimeoutRef = useRef<number | null>(null);

  const showGestureIndicator = (type: 'volume' | 'brightness', value: number) => {
    setActiveGesture(type);
    setGestureValue(Math.round(value));
    if (gestureTimeoutRef.current) {
      window.clearTimeout(gestureTimeoutRef.current);
    }
    gestureTimeoutRef.current = window.setTimeout(() => {
      setActiveGesture(null);
    }, 1200);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const side = x < rect.width / 2 ? 'left' : 'right';
    const startVal = side === 'left' ? brightness : volume;
    touchStartRef.current = { x, y, side, startVal };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const deltaY = touchStartRef.current.y - (touch.clientY - rect.top);
    const sensitivity = 1.5;
    const change = (deltaY / rect.height) * sensitivity;

    if (touchStartRef.current.side === 'left') {
      const newVal = Math.min(2.0, Math.max(0.1, touchStartRef.current.startVal + change));
      setBrightness(newVal);
      showGestureIndicator('brightness', newVal * 50);
    } else {
      const newVal = Math.min(1.0, Math.max(0.0, touchStartRef.current.startVal + change));
      setVolume(newVal);
      if (mediaRef.current) {
        mediaRef.current.volume = newVal;
      }
      showGestureIndicator('volume', newVal * 100);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only track left click
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const side = x < rect.width / 2 ? 'left' : 'right';
    const startVal = side === 'left' ? brightness : volume;
    mouseStartRef.current = { x, y, side, startVal };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!mouseStartRef.current) return;
      const moveDeltaY = mouseStartRef.current.y - (moveEvt.clientY - rect.top);
      const sensitivity = 1.5;
      const moveChange = (moveDeltaY / rect.height) * sensitivity;

      if (mouseStartRef.current.side === 'left') {
        const newVal = Math.min(2.0, Math.max(0.1, mouseStartRef.current.startVal + moveChange));
        setBrightness(newVal);
        showGestureIndicator('brightness', newVal * 50);
      } else {
        const newVal = Math.min(1.0, Math.max(0.0, mouseStartRef.current.startVal + moveChange));
        setVolume(newVal);
        if (mediaRef.current) {
          mediaRef.current.volume = newVal;
        }
        showGestureIndicator('volume', newVal * 100);
      }
    };

    const handleMouseUp = () => {
      mouseStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => console.warn("Fullscreen request failed:", err));
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch((err) => console.warn("Exit fullscreen failed:", err));
    }
  };

  const handleRotate = () => {
    setRotation(prev => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
  };

  // Keep fullscreen state updated
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (gestureTimeoutRef.current) {
        window.clearTimeout(gestureTimeoutRef.current);
      }
    };
  }, []);

  // Simulated Zip File Contents
  const zipSimulatedFiles = [
    { name: 'nebula_space_cinematic.mp4', type: 'video', size: 14450200 },
    { name: 'stellar_wind_acoustic.mp3', type: 'audio', size: 4890300 },
    { name: 'read_me_first_captain.txt', type: 'text', size: 1045 },
    { name: 'andromeda_galaxy_raw.png', type: 'image', size: 2840100 },
  ];

  const [extractedMap, setExtractedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = volume;
    }
  }, [volume]);

  const handlePlayPause = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgress = () => {
    if (!mediaRef.current) return;
    const buffered = mediaRef.current.buffered;
    const curTime = mediaRef.current.currentTime;
    if (buffered && buffered.length > 0) {
      let activeRangeEnd = 0;
      for (let i = 0; i < buffered.length; i++) {
        if (buffered.start(i) <= curTime && buffered.end(i) >= curTime) {
          activeRangeEnd = buffered.end(i);
          break;
        }
      }
      if (activeRangeEnd === 0 && buffered.length > 0) {
        activeRangeEnd = buffered.end(buffered.length - 1);
      }
      setBufferedEnd(activeRangeEnd);
    }
  };

  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    setCurrentTime(mediaRef.current.currentTime);
    handleProgress();
  };

  const handleLoadedMetadata = () => {
    if (!mediaRef.current) return;
    setDuration(mediaRef.current.duration);
    handleProgress();
  };

  const handleSeekToPosition = (clientX: number, barRef: React.RefObject<HTMLDivElement | null>) => {
    if (!barRef.current || !mediaRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const width = rect.width;
    const clickX = clientX - rect.left;
    const percentage = Math.min(Math.max(0, clickX / width), 1);
    const targetTime = percentage * duration;
    mediaRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const startDragSeek = (clientX: number, barRef: React.RefObject<HTMLDivElement | null>) => {
    setIsDraggingSeek(true);
    handleSeekToPosition(clientX, barRef);

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleSeekToPosition(e.clientX, barRef);
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingSeek(false);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>, barRef: React.RefObject<HTMLDivElement | null>) => {
    if (e.button !== 0) return; // Left click only
    e.preventDefault();
    startDragSeek(e.clientX, barRef);
  };

  const handleProgressBarTouchStart = (e: React.TouchEvent<HTMLDivElement>, barRef: React.RefObject<HTMLDivElement | null>) => {
    if (e.touches.length > 0) {
      startDragSeek(e.touches[0].clientX, barRef);
    }
  };

  const handleProgressBarTouchMove = (e: React.TouchEvent<HTMLDivElement>, barRef: React.RefObject<HTMLDivElement | null>) => {
    if (e.touches.length > 0) {
      handleSeekToPosition(e.touches[0].clientX, barRef);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!mediaRef.current) return;
    const time = parseFloat(e.target.value);
    mediaRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (timeInSecs: number) => {
    if (isNaN(timeInSecs)) return '0:00';
    const mins = Math.floor(timeInSecs / 60);
    const secs = Math.floor(timeInSecs % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleExtract = (fileName: string, type: string, size: number) => {
    onExtractSimulated(fileName, 'file', size);
    setExtractedMap(prev => ({ ...prev, [fileName]: true }));
    setTimeout(() => {
      setExtractedMap(prev => ({ ...prev, [fileName]: false }));
    }, 2000);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const mediaUrl = `/api/download/${item.fileId || item.id}`;

  return (
    <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col w-full h-full">
      <div className="w-full h-full bg-[#0d1117] flex flex-col overflow-hidden">
        
        {/* Header toolbar */}
        <div className="px-6 md:px-10 py-5 border-b border-white/5 bg-slate-900/40 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {isVideo && <FileVideo className="w-6 h-6 text-emerald-400" />}
            {isAudio && <Music className="w-6 h-6 text-amber-400" />}
            {isImage && <ImageIcon className="w-6 h-6 text-sky-400" />}
            {isZip && <FileArchive className="w-6 h-6 text-rose-400" />}
            {isText && <FileText className="w-6 h-6 text-blue-400" />}
            {!isVideo && !isAudio && !isImage && !isZip && !isText && <FileIcon className="w-6 h-6 text-slate-400" />}
            
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-base md:text-lg text-white truncate max-w-sm sm:max-w-md md:max-w-xl">
                {item.name}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5">
                Size: {formatBytes(item.size)} | Added: {new Date(item.uploadDate).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {item.fileId && (
              <a
                href={mediaUrl}
                download={item.name}
                className="p-2.5 bg-white/5 hover:bg-[#0095ff] text-slate-300 hover:text-white rounded-xl transition-all shadow-sm"
                title="Download Backup"
              >
                <Download className="w-4.5 h-4.5" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2.5 bg-white/5 hover:bg-rose-500 hover:text-white text-slate-300 rounded-xl transition-colors cursor-pointer shadow-sm"
              title="Close Preview"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Dynamic Preview Container */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-[#0d1117] flex flex-col justify-center items-center min-h-[300px]">
          
          {/* 1. Video Player */}
          {isVideo && (
            <div 
              ref={videoContainerRef}
              className={`w-full max-w-4xl flex flex-col gap-5 bg-[#0a0f1d]/40 p-4 rounded-3xl border border-white/5 shadow-2xl transition-all duration-300 ${isFullscreen ? 'fixed inset-0 max-w-none z-50 justify-center bg-black/98 p-6 md:p-10' : ''}`}
            >
              {/* Aspect Ratio Video container with touch gesture area */}
              <div 
                className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/10 group shadow-2xl flex items-center justify-center cursor-ns-resize"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
              >
                <video
                  ref={(el) => { mediaRef.current = el; }}
                  src={mediaUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onProgress={handleProgress}
                  className="max-h-full max-w-full transition-all duration-300 select-none pointer-events-none"
                  style={{
                    transform: `rotate(${rotation}deg)${ (rotation === 90 || rotation === 270) ? ' scale(0.5625)' : '' }`,
                    filter: `brightness(${brightness})`,
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.1s ease',
                  }}
                />
                
                {/* Swipe Gesture Info overlays */}
                <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none opacity-0 group-hover:opacity-60 transition-opacity duration-300 z-30 text-[10px] sm:text-xs font-mono text-slate-400">
                  <span className="bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm border border-white/5">← Up/Down: Brightness</span>
                  <span className="bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm border border-white/5">Up/Down: Volume →</span>
                </div>

                {/* Gesture active visual feedback floating pill */}
                {activeGesture && (
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/85 backdrop-blur-md px-6 py-4 rounded-3xl flex items-center gap-4 border border-white/10 z-40 shadow-2xl pointer-events-none transition-all duration-300">
                    {activeGesture === 'brightness' ? (
                      <Sun className="w-8 h-8 text-yellow-400 animate-pulse" />
                    ) : (
                      <Volume2 className="w-8 h-8 text-[#0095ff] animate-pulse" />
                    )}
                    <div className="text-left">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        {activeGesture === 'brightness' ? 'Brightness' : 'Volume'}
                      </p>
                      <p className="text-xl font-black text-white font-mono leading-none mt-1">
                        {gestureValue}%
                      </p>
                    </div>
                  </div>
                )}

                {/* Center Big Play Pause Overlay */}
                {!isPlaying && (
                  <button 
                    onClick={handlePlayPause}
                    className="absolute inset-0 m-auto w-16 h-16 bg-[#0095ff] hover:bg-sky-500 rounded-full flex items-center justify-center text-white shadow-xl transition-transform transform scale-100 hover:scale-110 z-20 cursor-pointer"
                  >
                    <Play className="w-8 h-8 fill-white ml-1" />
                  </button>
                )}

                {/* Thin, elegant overlay progress indicator on the video box */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-30 overflow-hidden pointer-events-none group-hover:h-1.5 transition-all">
                  <div 
                    className="h-full bg-[#0095ff]" 
                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                  />
                </div>
              </div>

              {/* Video custom controllers bar */}
              <div className="bg-[#161b22]/95 border border-white/10 p-5 rounded-2xl space-y-4 w-full shadow-lg backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  {/* Play/Pause Button */}
                  <button
                    onClick={handlePlayPause}
                    className="p-2.5 bg-white/5 hover:bg-[#0095ff]/20 hover:text-[#0095ff] rounded-xl text-white transition-all cursor-pointer border border-white/5"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="w-4.5 h-4.5 fill-current" /> : <Play className="w-4.5 h-4.5 fill-current ml-0.5" />}
                  </button>

                  {/* Time Indicator */}
                  <span className="text-xs font-mono text-slate-400">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  {/* Custom YouTube-style 3-Layer Progress Bar */}
                  <div 
                    ref={videoProgressBarRef}
                    onMouseDown={(e) => handleProgressBarMouseDown(e, videoProgressBarRef)}
                    onTouchStart={(e) => handleProgressBarTouchStart(e, videoProgressBarRef)}
                    onTouchMove={(e) => handleProgressBarTouchMove(e, videoProgressBarRef)}
                    className="flex-1 min-w-[120px] w-full relative h-[20px] flex items-center group cursor-pointer select-none z-40"
                  >
                    {/* Progress Bar Track Container */}
                    <div className={`w-full bg-white/30 rounded-full overflow-hidden relative transition-all duration-150 ${isDraggingSeek ? 'h-[8px]' : 'h-[5px] group-hover:h-[8px]'}`}>
                      {/* Layer 2: Buffering Line */}
                      <div 
                        className="absolute left-0 top-0 h-full bg-white/50 pointer-events-none transition-all duration-150 z-10"
                        style={{ width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%` }}
                      />
                      
                      {/* Layer 3: Main Red Playback Line */}
                      <div 
                        className="absolute left-0 top-0 h-full bg-red-600 pointer-events-none z-20"
                        style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      />
                    </div>
                    {/* YouTube style Knob/Scrubber */}
                    <div 
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-600 rounded-full pointer-events-none transition-transform duration-150 shadow-md z-30 ${isDraggingSeek ? 'scale-100' : 'scale-0 group-hover:scale-100'}`}
                      style={{ 
                        left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                        transform: `translate(-50%, -50%)`
                      }}
                    />
                  </div>

                  {/* Volume Controls */}
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4.5 h-4.5 text-slate-400" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setVolume(v);
                        if (mediaRef.current) mediaRef.current.volume = v;
                      }}
                      className="w-16 sm:w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#0095ff]"
                    />
                  </div>

                  {/* Rotation Switch (Vertical/Horizontal) */}
                  <button
                    onClick={handleRotate}
                    className="p-2.5 bg-white/5 hover:bg-amber-500/20 hover:text-amber-400 text-slate-300 rounded-xl transition-all cursor-pointer border border-white/5"
                    title="Rotate orientation (Vertical / Horizontal)"
                  >
                    <RotateCw className="w-4.5 h-4.5" />
                  </button>

                  {/* Fullscreen Display Mode Switch */}
                  <button
                    onClick={toggleFullscreen}
                    className="p-2.5 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-300 rounded-xl transition-all cursor-pointer border border-white/5"
                    title="Display Mode Switch (Fullscreen)"
                  >
                    {isFullscreen ? <Minimize2 className="w-4.5 h-4.5" /> : <Maximize2 className="w-4.5 h-4.5" />}
                  </button>

                  {/* Playback Speed */}
                  <select
                    value={playbackSpeed}
                    onChange={(e) => {
                      const sp = parseFloat(e.target.value);
                      setPlaybackSpeed(sp);
                      if (mediaRef.current) mediaRef.current.playbackRate = sp;
                    }}
                    className="bg-[#0d1117] border border-white/10 text-slate-300 text-xs rounded-lg py-1.5 px-2 focus:outline-none cursor-pointer"
                  >
                    <option value="0.5">0.5x</option>
                    <option value="1">1.0x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2.0x</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 2. Audio Player Wave Card */}
          {isAudio && (
            <div className="w-full max-w-xl flex flex-col gap-6">
              <audio
                ref={(el) => { mediaRef.current = el; }}
                src={mediaUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onProgress={handleProgress}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />

              {/* Sound Card container */}
              <div className="bg-[#161b22]/90 border border-white/10 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl" />

                {/* Disc and Waves */}
                <div className="flex items-center gap-5">
                  <div className={`w-20 h-20 bg-gradient-to-tr from-amber-500 to-yellow-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/15 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }}>
                    <Music className="w-10 h-10 text-black" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold text-lg text-white truncate max-w-[280px]">{item.name}</h4>
                    <p className="text-xs text-amber-400 font-bold mt-1 uppercase tracking-wider">Secure Audio Track</p>
                  </div>
                </div>

                {/* Beautiful active sound-frequency waves animation */}
                <div className="h-16 flex items-end justify-between gap-[4px] px-2">
                  {[...Array(36)].map((_, i) => {
                    const factor = 12 + Math.sin(i * 0.4) * 24 + Math.random() * 18;
                    const styleHeight = isPlaying ? `${Math.max(6, factor)}px` : '6px';
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-amber-500 rounded-full transition-all duration-300"
                        style={{ 
                          height: styleHeight,
                          opacity: isPlaying ? 0.7 + Math.random() * 0.3 : 0.3
                        }}
                      />
                    );
                  })}
                </div>

                {/* Controls */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                   {/* Custom YouTube-style 3-Layer Progress Bar */}
                   <div 
                     ref={audioProgressBarRef}
                     onMouseDown={(e) => handleProgressBarMouseDown(e, audioProgressBarRef)}
                     onTouchStart={(e) => handleProgressBarTouchStart(e, audioProgressBarRef)}
                     onTouchMove={(e) => handleProgressBarTouchMove(e, audioProgressBarRef)}
                     className="w-full relative h-[20px] flex items-center group cursor-pointer select-none z-40"
                   >
                     {/* Progress Bar Track Container */}
                     <div className={`w-full bg-white/10 rounded-full overflow-hidden relative transition-all duration-150 ${isDraggingSeek ? 'h-[8px]' : 'h-[5px] group-hover:h-[8px]'}`}>
                       {/* Layer 2: Buffering Line */}
                       <div 
                         className="absolute left-0 top-0 h-full bg-white/20 pointer-events-none transition-all duration-150 z-10"
                         style={{ width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%` }}
                       />
                       
                       {/* Layer 3: Main Playback Line */}
                       <div 
                         className="absolute left-0 top-0 h-full bg-amber-500 pointer-events-none z-20"
                         style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                       />
                     </div>
                     {/* YouTube style Knob/Scrubber */}
                     <div 
                       className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-amber-500 rounded-full pointer-events-none transition-transform duration-150 shadow-md z-30 ${isDraggingSeek ? 'scale-100' : 'scale-0 group-hover:scale-100'}`}
                       style={{ 
                         left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                         transform: `translate(-50%, -50%)`
                       }}
                     />
                   </div>

                  <div className="flex items-center justify-between pt-3">
                    <button
                      onClick={handlePlayPause}
                      className="w-14 h-14 bg-amber-500 hover:bg-yellow-400 text-black rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20 transition-transform transform active:scale-95 cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-0.5" />}
                    </button>

                    <div className="flex items-center gap-3">
                      <Volume2 className="w-5 h-5 text-slate-400" />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 3. Image Preview */}
          {isImage && (
            <div className="w-full max-w-5xl flex items-center justify-center">
              <img
                src={mediaUrl}
                alt={item.name}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] md:max-h-[80vh] object-contain rounded-2xl border border-white/10 shadow-2xl transition-transform transform hover:scale-[1.01]"
              />
            </div>
          )}

          {/* 4. Document / Text Preview */}
          {isText && (
            <div className="w-full max-w-4xl bg-[#0d1117] border border-white/10 rounded-2xl p-6 md:p-8 overflow-auto max-h-[70vh] md:max-h-[75vh] font-mono text-xs md:text-sm text-slate-300 leading-relaxed text-left shadow-2xl">
              <p className="text-slate-500 border-b border-white/5 pb-2 mb-4">// File content raw preview</p>
              <pre className="whitespace-pre-wrap">
                {`Root Haven Integrity Header Verified.
File Reference ID: ${item.fileId || 'MOCK-REF-772'}
Node Partition: Cloud Sync v1

This is a preview of your uploaded text document. Root Haven preserves all binary configurations and file attributes across Backblaze B2 storage safely.

[Active Sync Log]
- Integrity status: Pristine
- Access logs: Signed by current user session
- Server connection: Active (Railway Node Proxy)`}
              </pre>
            </div>
          )}

          {/* 5. ZIP Direct Inspection & Extraction */}
          {isZip && (
            <div className="w-full max-w-4xl flex flex-col gap-6 text-left">
              {/* Alert Indicator */}
              <div className="bg-[#0095ff]/5 border border-[#0095ff]/20 p-5 rounded-2xl flex items-start gap-4 shadow-sm">
                <Layers className="w-6 h-6 text-[#0095ff] flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white">Quantum Cloud Decompression Active</h4>
                  <p className="text-xs text-slate-400 mt-1.5">
                    You can inspect and decompress individual files from this remote archive directly into your current drive directory without full package downloads.
                  </p>
                </div>
              </div>

              {/* ZIP Internal files listing */}
              <div className="bg-[#161b22] border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5 shadow-xl">
                <div className="p-4 bg-white/5 flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-white/5">
                  <span>Archived Elements</span>
                  <span>{zipSimulatedFiles.length} elements</span>
                </div>

                {zipSimulatedFiles.map((f, i) => (
                  <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {f.type === 'video' && <FileVideo className="w-5 h-5 text-emerald-400" />}
                      {f.type === 'audio' && <Music className="w-5 h-5 text-amber-400" />}
                      {f.type === 'text' && <FileText className="w-5 h-5 text-blue-400" />}
                      {f.type === 'image' && <ImageIcon className="w-5 h-5 text-sky-400" />}
                      
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-white truncate">{f.name}</p>
                        <span className="text-[10px] text-slate-500 font-mono">{formatBytes(f.size)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExtract(f.name, f.type, f.size)}
                        disabled={extractedMap[f.name]}
                        className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5
                          ${extractedMap[f.name] 
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-[#0095ff] hover:bg-sky-500 text-white shadow-md'}`}
                      >
                        {extractedMap[f.name] ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Extracted!</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 text-yellow-300" />
                            <span>Extract File</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. General Unknown File Preview */}
          {!isVideo && !isAudio && !isImage && !isZip && !isText && (
            <div className="text-center p-10 space-y-5 max-w-md">
              <div className="w-20 h-20 bg-slate-800/80 text-slate-400 border border-white/10 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <FileIcon className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">No Preview Available</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  This file format cannot be parsed in-browser. You can safely download the original binary backup to inspect locally.
                </p>
              </div>
              <a
                href={mediaUrl}
                download={item.name}
                className="inline-flex items-center gap-2 bg-[#0095ff] hover:bg-sky-500 text-white font-bold text-xs py-3 px-8 rounded-xl transition-colors cursor-pointer shadow-lg shadow-[#0095ff]/15"
              >
                <Download className="w-4.5 h-4.5" />
                <span>Download Original</span>
              </a>
            </div>
          )}

        </div>

        {/* Footer info strip */}
        <div className="px-6 md:px-10 py-5 bg-slate-900/20 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            <span>End-to-End Encryption Enabled</span>
          </span>
          <span className="font-mono">Nexus ID: {item.id}</span>
        </div>

      </div>
    </div>
  );
}
