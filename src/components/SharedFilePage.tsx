import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  FileText, 
  FileVideo, 
  Music, 
  ImageIcon, 
  ArrowLeft, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Clock, 
  HardDrive, 
  Loader2,
  FileArchive,
  AlertTriangle,
  Cloud,
  Menu,
  MoreHorizontal,
  Home,
  Bookmark,
  Search,
  RotateCw,
  Sun,
  Maximize2,
  Minimize2,
  ChevronDown,
  Sparkles,
  Check,
  Lock,
  Unlock
} from 'lucide-react';

interface SharedFilePageProps {
  fileId: string;
  onClose: () => void;
}

interface SharedFileMeta {
  fileId?: string;
  id?: string;
  fileName?: string;
  name?: string;
  fileSize?: number;
  size?: number;
  uploadDate?: string;
  upload_date?: string;
}

export default function SharedFilePage({ fileId, onClose }: SharedFilePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fileMeta, setFileMeta] = useState<SharedFileMeta | null>(null);

  // Video / Audio Player states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const videoProgressBarRef = useRef<HTMLDivElement>(null);
  const audioProgressBarRef = useRef<HTMLDivElement>(null);

  // Advanced Video/Media features
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false); // Vertical (portrait) vs Horizontal (landscape) layout switch
  const [brightness, setBrightness] = useState(1.0); // 0.1 to 2.0
  const [activeGesture, setActiveGesture] = useState<'volume' | 'brightness' | null>(null);
  const [gestureValue, setGestureValue] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [videoRotation, setVideoRotation] = useState<0 | 90 | 180 | 270>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const gestureTimeoutRef = useRef<number | null>(null);

  // Gestures refs
  const touchStartRef = useRef<{ x: number; y: number; side: 'left' | 'right'; startVal: number } | null>(null);
  const mouseStartRef = useRef<{ x: number; y: number; side: 'left' | 'right'; startVal: number } | null>(null);

  useEffect(() => {
    async function loadMetadata() {
      try {
        setLoading(true);
        setError('');
        
        // 1. Fetch from backend API
        const res = await fetch(`/api/file-metadata/${fileId}`);
        if (res.ok) {
          const data = await res.json();
          setFileMeta(data);
          setLoading(false);
          return;
        }

        // 2. Fallback to localStorage for mock/simulated files
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key === 'nexus_cloud_items' || key.startsWith('nexus_cloud_items_'))) {
            const savedItemsStr = localStorage.getItem(key);
            if (savedItemsStr) {
              try {
                const items = JSON.parse(savedItemsStr);
                if (Array.isArray(items)) {
                  const found = items.find((item: any) => item && (item.id === fileId || item.fileId === fileId));
                  if (found) {
                    setFileMeta({
                      fileId: found.fileId || found.id,
                      fileName: found.name,
                      fileSize: found.size,
                      uploadDate: found.uploadDate
                    });
                    setLoading(false);
                    return;
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }
        }

        setError('File not found or the share link is invalid.');
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError('Failed to retrieve share file metadata.');
        setLoading(false);
      }
    }

    loadMetadata();
  }, [fileId]);

  const fileName = fileMeta?.fileName || fileMeta?.name || 'Shared File';
  const fileSize = fileMeta?.fileSize || fileMeta?.size || 0;
  const uploadDate = fileMeta?.uploadDate || fileMeta?.upload_date || new Date().toISOString();
  const downloadUrl = `/api/download/${fileId}`;

  // Helper formats
  const formatBytes = (bytes: number, decimals = 1) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  // Type matches
  const isVideo = fileName.match(/\.(mp4|mkv|mov|avi|webm)$/i);
  const isAudio = fileName.match(/\.(mp3|wav|ogg|aac|m4a)$/i);
  const isImage = fileName.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
  const isZip = fileName.match(/\.(zip|rar|7z|tar|gz)$/i);

  // Playback handlers
  const handlePlayPause = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      if (isPlaying) {
        media.pause();
      } else {
        media.play().catch(err => console.log('Playback error:', err));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleProgress = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      const buffered = media.buffered;
      const curTime = media.currentTime;
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
    }
  };

  const handleTimeUpdate = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      setCurrentTime(media.currentTime);
      handleProgress();
    }
  };

  const handleLoadedMetadata = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      setDuration(media.duration);
      handleProgress();
    }
  };

  const handleSeekToPosition = (clientX: number, barRef: React.RefObject<HTMLDivElement | null>) => {
    const media = videoRef.current || audioRef.current;
    if (!barRef.current || !media || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const width = rect.width;
    const clickX = clientX - rect.left;
    const percentage = Math.min(Math.max(0, clickX / width), 1);
    const targetTime = percentage * duration;
    media.currentTime = targetTime;
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

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const media = videoRef.current || audioRef.current;
    if (media) {
      media.currentTime = value;
      setCurrentTime(value);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setVolume(value);
    const media = videoRef.current || audioRef.current;
    if (media) {
      media.volume = value;
    }
    if (value > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      const nextMute = !isMuted;
      setIsMuted(nextMute);
      media.muted = nextMute;
    }
  };

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Swipe / Drag Gestures logic
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
    if (!isFullscreen || isLocked) return;
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
    if (!isFullscreen || isLocked) return;
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const deltaY = touchStartRef.current.y - (touch.clientY - rect.top);
    const sensitivity = 1.2;
    const change = (deltaY / rect.height) * sensitivity;

    if (touchStartRef.current.side === 'left') {
      const newVal = Math.min(2.0, Math.max(0.1, touchStartRef.current.startVal + change));
      setBrightness(newVal);
      showGestureIndicator('brightness', newVal * 50);
    } else {
      const newVal = Math.min(1.0, Math.max(0.0, touchStartRef.current.startVal + change));
      setVolume(newVal);
      const media = videoRef.current || audioRef.current;
      if (media) {
        media.volume = newVal;
      }
      showGestureIndicator('volume', newVal * 100);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFullscreen || isLocked) return;
    if (e.button !== 0) return; // Only track left click
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const side = x < rect.width / 2 ? 'left' : 'right';
    const startVal = side === 'left' ? brightness : volume;
    mouseStartRef.current = { x, y, side, startVal };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isFullscreen || isLocked) return;
      if (!mouseStartRef.current) return;
      const moveDeltaY = mouseStartRef.current.y - (moveEvt.clientY - rect.top);
      const sensitivity = 1.2;
      const moveChange = (moveDeltaY / rect.height) * sensitivity;

      if (mouseStartRef.current.side === 'left') {
        const newVal = Math.min(2.0, Math.max(0.1, mouseStartRef.current.startVal + moveChange));
        setBrightness(newVal);
        showGestureIndicator('brightness', newVal * 50);
      } else {
        const newVal = Math.min(1.0, Math.max(0.0, mouseStartRef.current.startVal + moveChange));
        setVolume(newVal);
        const media = videoRef.current || audioRef.current;
        if (media) {
          media.volume = newVal;
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

  // Sync state on fullscreen change
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

  const handleSaveToCloudStories = () => {
    setToastMessage("Successfully saved to Root Heaven!");
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between font-sans selection:bg-[#0095ff]/30 relative overflow-x-hidden pb-24">
      {/* Dynamic Cosmic Background */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#0095ff]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />

      {/* 1. TOP HEADER (MEGA.nz layout clone) */}
      <header className="bg-[#0b0c0f] border-b border-white/5 py-4 px-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Left logo and "Root Heaven" text */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0095ff] to-cyan-400 flex items-center justify-center shadow-lg shadow-[#0095ff]/20">
              <Cloud className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-sans font-extrabold text-base sm:text-lg tracking-tight text-white select-none">
              Root<span className="text-[#0095ff]"> Heaven</span>
            </span>
          </div>

          {/* Right User avatar & hamburger menu icon */}
          <div className="flex items-center gap-4">
            <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs select-none">
              R
            </div>
            <button className="text-slate-400 hover:text-white transition-colors cursor-pointer">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. SUB-HEADER ACTION BAR */}
      <div className="max-w-4xl mx-auto w-full px-4 pt-4 flex items-center justify-between text-xs font-semibold">
        <button 
          onClick={onClose}
          className="text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span className="underline decoration-[#0095ff] decoration-2 underline-offset-4 font-sans text-xs">
            Open in Root Heaven
          </span>
        </button>
        <button className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* 3. FILE TITLE BAR */}
      <div className="max-w-4xl mx-auto w-full px-4 pt-4 pb-2 text-left">
        <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight break-all">
          {fileName}
        </h1>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 font-medium">
          <span>{formatBytes(fileSize)}</span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(uploadDate).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* 4. MEDIA PLAYER CONTAINER (Large Centered Aspect Container) */}
      <main className="max-w-4xl w-full mx-auto px-4 py-4 flex-1 flex flex-col justify-center items-center">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-12 h-12 text-[#0095ff] animate-spin" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Verifying Connection Link...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
            <AlertTriangle className="w-12 h-12 mx-auto text-rose-500" />
            <h3 className="font-sans font-bold text-lg text-white">Retrieval Failed</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
            <button
              onClick={onClose}
              className="w-full bg-[#0095ff] hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors cursor-pointer mt-2"
            >
              Return Home
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-4">
            
            {/* The main viewport with 1:1 aspect constraint */}
            <div 
              ref={videoContainerRef}
              className={`relative bg-[#07090d] border border-white/5 shadow-2xl overflow-hidden group select-none transition-all duration-500 ease-in-out ${
                isFullscreen 
                  ? 'fixed inset-0 w-screen h-screen max-w-none max-h-none z-50 flex items-center justify-center bg-black/98' 
                  : 'aspect-square w-full max-w-xs sm:max-w-md rounded-3xl'
              }`}
            >
              {/* Tap / Drag Area helper background overlay */}
              <div 
                className="absolute inset-0 z-20 cursor-ns-resize"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
              />

              {/* VIDEO VIEWER */}
              {isVideo && (
                <video
                  ref={videoRef}
                  src={downloadUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onProgress={handleProgress}
                  className="w-full h-full object-contain select-none pointer-events-none"
                  style={{
                    filter: `brightness(${brightness})`,
                    transition: 'filter 0.1s ease, transform 0.3s ease-in-out',
                    transform: `rotate(${videoRotation}deg)`,
                  }}
                  playsInline
                />
              )}

              {/* AUDIO VIEWER */}
              {isAudio && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1017] p-6 space-y-6">
                  <audio
                    ref={audioRef}
                    src={downloadUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onProgress={handleProgress}
                  />
                  <div className={`w-28 h-28 rounded-full bg-gradient-to-tr from-[#0095ff] to-cyan-500 p-0.5 shadow-xl ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '10s' }}>
                    <div className="w-full h-full bg-[#07090e] rounded-full flex items-center justify-center relative">
                      <Music className="w-8 h-8 text-[#0095ff] opacity-60" />
                      <div className="w-3.5 h-3.5 bg-[#0d1017] rounded-full absolute" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-mono tracking-wider">{formatTime(currentTime)} / {formatTime(duration)}</p>
                  </div>
                </div>
              )}

              {/* IMAGE VIEWER */}
              {isImage && (
                <img
                  src={downloadUrl}
                  alt={fileName}
                  className="w-full h-full object-contain pointer-events-none"
                  referrerPolicy="no-referrer"
                />
              )}

              {/* ZIP OR OTHER DOCUMENTS VIEW */}
              {!isVideo && !isAudio && !isImage && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1017] p-8 text-center space-y-4">
                  <div className="p-5 bg-white/5 border border-white/5 text-slate-400 rounded-3xl shadow-inner">
                    {isZip ? <FileArchive className="w-10 h-10 text-[#0095ff]" /> : <FileText className="w-10 h-10 text-cyan-400" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">Preview Offline</p>
                    <p className="text-[11px] text-slate-400 max-w-[200px] leading-relaxed mx-auto">
                      Please use the download option below to unpack this document safely.
                    </p>
                  </div>
                </div>
              )}

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

              {/* Centered Pause / Play toggle button overlays */}
              {(isVideo || isAudio) && (
                <div 
                  onClick={() => {
                    if (isLocked) {
                      setToastMessage("Controls Locked. Unlock to play/pause.");
                      setTimeout(() => setToastMessage(null), 2000);
                      return;
                    }
                    handlePlayPause();
                  }}
                  className="absolute inset-0 m-auto w-full h-full flex items-center justify-center z-30 cursor-pointer bg-transparent"
                >
                  <div 
                    className={`w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white transition-all duration-300 shadow-2xl ${
                      isPlaying 
                        ? 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100' 
                        : 'opacity-100 scale-100'
                    }`}
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6 fill-white text-white" />
                    ) : (
                      <Play className="w-6 h-6 fill-white text-white ml-0.5" />
                    )}
                  </div>
                </div>
              )}

              {/* Low-profile floating side controls (Lock, Rotation, Aspect toggle) */}
              <div className="absolute right-3.5 top-1/3 -translate-y-1/2 flex flex-col items-center gap-2 z-40">
                {/* Lock button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLocked(!isLocked);
                    setToastMessage(isLocked ? "Screen Controls Unlocked" : "Screen Controls Locked");
                    setTimeout(() => setToastMessage(null), 2000);
                  }}
                  className={`p-2 rounded-xl backdrop-blur-md border border-white/5 transition-all duration-300 shadow-lg ${
                    isLocked 
                      ? 'bg-[#0095ff]/20 text-[#0095ff] border-[#0095ff]/30' 
                      : 'bg-black/35 text-white/40 hover:text-white/90 hover:bg-black/60'
                  }`}
                  title={isLocked ? "Unlock screen controls" : "Lock screen controls"}
                >
                  {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                {/* Vertical/Horizontal Rotate Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isLocked) return;
                    setVideoRotation(prev => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
                  }}
                  disabled={isLocked}
                  className="p-2 rounded-xl bg-black/35 text-white/40 hover:text-white/90 hover:bg-black/60 backdrop-blur-md border border-white/5 transition-all duration-300 shadow-lg disabled:opacity-25 disabled:cursor-not-allowed"
                  title="Rotate view 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                {/* Aspect helper format representation (vertical / horizontal layout mode within 1:1 frame) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isLocked) return;
                    setIsLandscape(!isLandscape);
                  }}
                  disabled={isLocked}
                  className={`p-1.5 rounded-xl backdrop-blur-md border border-white/5 transition-all duration-300 shadow-lg text-[8px] font-black tracking-tighter select-none disabled:opacity-25 disabled:cursor-not-allowed ${
                    isLandscape 
                      ? 'bg-[#0095ff]/15 text-[#0095ff] border-[#0095ff]/30' 
                      : 'bg-black/35 text-white/40 hover:text-white/90 hover:bg-black/60'
                  }`}
                  title="Aspect orientation layout toggle"
                >
                  {isLandscape ? "16:9" : "9:16"}
                </button>
              </div>

              {/* Small Full Screen button on the bottom right edge */}
              {!isLocked && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullscreen();
                  }}
                  className="absolute bottom-3.5 right-3.5 p-2 rounded-xl bg-black/55 backdrop-blur-md border border-white/5 text-white/50 hover:text-white hover:bg-black/75 transition-all z-50 shadow-lg cursor-pointer touch-manipulation"
                  title="Fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4 drop-shadow-md" /> : <Maximize2 className="w-4 h-4 drop-shadow-md" />}
                </button>
              )}

              {/* MEGA Style Bottom Video Controls Overlay (with swipe guidance) */}
              {(isVideo || isAudio) && !isLocked && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-4 flex flex-col gap-2.5 z-40 pointer-events-auto">
                  
                  {/* Custom YouTube-style 3-Layer Progress Bar */}
                  <div 
                    ref={videoProgressBarRef}
                    onMouseDown={(e) => { e.stopPropagation(); handleProgressBarMouseDown(e, videoProgressBarRef); }}
                    onTouchStart={(e) => { e.stopPropagation(); handleProgressBarTouchStart(e, videoProgressBarRef); }}
                    onTouchMove={(e) => { e.stopPropagation(); handleProgressBarTouchMove(e, videoProgressBarRef); }}
                    className="w-full relative h-[20px] flex items-center group/progress cursor-pointer select-none"
                  >
                    {/* Progress Bar Track Container (Handles the thickness transition) */}
                    <div className={`w-full bg-white/30 rounded-full overflow-hidden relative transition-all duration-150 ${isDraggingSeek ? 'h-[8px]' : 'h-[5px] group-hover/progress:h-[8px]'}`}>
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
                    {/* YouTube style Knob/Scrubber - Outside overflow-hidden so it's not clipped */}
                    <div 
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-600 rounded-full pointer-events-none transition-transform duration-150 shadow-md z-30 ${isDraggingSeek ? 'scale-100' : 'scale-0 group-hover/progress:scale-100'}`}
                      style={{ 
                        left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                        transform: `translate(-50%, -50%)`
                      }}
                    />
                  </div>

                  {/* Controls Row */}
                  <div className="flex items-center justify-between text-white text-xs">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePlayPause(); }} 
                        className="hover:text-[#0095ff] transition-colors cursor-pointer p-1"
                      >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                      </button>

                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleMute(); }} 
                        className="hover:text-[#0095ff] transition-colors cursor-pointer p-1"
                      >
                        {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
                      </button>

                      <span className="font-mono text-[10px] text-slate-300 select-none">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>

                    <div className="pr-10">
                      {/* Leave spacing for absolute positioned fullscreen button at bottom-right corner */}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Swipe Instruction Overlays for better onboarding */}
            {(isVideo || isAudio) && (
              <div className="text-[10px] sm:text-xs text-slate-500 font-mono flex items-center justify-between w-full max-w-sm px-2">
                <span>← Up/Down (Left): Brightness</span>
                <span>Up/Down (Right): Volume →</span>
              </div>
            )}

            {/* 5. FOOTER ACTIONS ROW (MEGA-style Clone: Save button + download button next to it) */}
            <div className="w-full max-w-sm sm:max-w-md flex items-center gap-3.5 mt-4">
              <button 
                onClick={handleSaveToCloudStories}
                className="flex-1 bg-white hover:bg-slate-100 text-[#07090e] font-extrabold py-3.5 px-6 rounded-xl transition-all shadow-xl active:scale-98 cursor-pointer text-center text-xs sm:text-sm tracking-wide uppercase font-sans flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4.5 h-4.5 text-[#0095ff]" />
                <span>SAVE TO ROOT HEAVEN</span>
              </button>
              <a
                href={downloadUrl}
                download={fileName}
                className="bg-[#141822] hover:bg-[#1a202e] border border-white/5 hover:border-white/10 text-[#0095ff] p-3.5 sm:p-4 rounded-xl transition-all flex items-center justify-center active:scale-95 cursor-pointer shadow-lg"
                title="Download file"
              >
                <Download className="w-5 h-5 text-white" />
              </a>
            </div>

          </div>
        )}
      </main>

      {/* Modern floating toast message */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-slate-900 border border-emerald-500/30 text-white px-5 py-3 rounded-2xl flex items-center gap-2 shadow-2xl z-50 animate-bounce">
          <Check className="w-4.5 h-4.5 text-emerald-400" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* 6. FIXED BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0b0c10] border-t border-white/5 py-4 px-6 z-50 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center justify-between text-slate-400">
          <button 
            onClick={() => window.location.href = '/'}
            className="flex flex-col items-center gap-1 hover:text-[#0095ff] transition-colors cursor-pointer"
            title="Home"
          >
            <Home className="w-5 h-5" />
          </button>
          
          <button 
            onClick={handleSaveToCloudStories}
            className="flex flex-col items-center gap-1 hover:text-[#0095ff] transition-colors cursor-pointer"
            title="Bookmark"
          >
            <Bookmark className="w-5 h-5" />
          </button>

          <button 
            onClick={() => {
              setToastMessage("Search feature initialized for Cloud Stories");
              setTimeout(() => setToastMessage(null), 2500);
            }}
            className="flex flex-col items-center gap-1 hover:text-[#0095ff] transition-colors cursor-pointer"
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* High Fidelity Tab Counter showing '12' */}
          <button 
            onClick={() => {
              setToastMessage("Active connections: 12 peer node links");
              setTimeout(() => setToastMessage(null), 2500);
            }}
            className="flex items-center justify-center w-7 h-7 border-2 border-slate-400 hover:border-[#0095ff] hover:text-[#0095ff] rounded-lg text-[10px] font-black tracking-tighter transition-all cursor-pointer"
            title="Tabs Counter"
          >
            12
          </button>

          <button 
            onClick={() => {
              setToastMessage("Root Heaven Options: Options Drawer coming soon!");
              setTimeout(() => setToastMessage(null), 2500);
            }}
            className="flex flex-col items-center gap-1 hover:text-[#0095ff] transition-colors cursor-pointer"
            title="More Options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </nav>
    </div>
  );
}
