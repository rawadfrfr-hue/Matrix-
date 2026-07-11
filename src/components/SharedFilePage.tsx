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
  AlertTriangle
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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
  const uploadDate = fileMeta?.uploadDate || new Date().toISOString();
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

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
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

  const handleTimeUpdate = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      setCurrentTime(media.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      setDuration(media.duration);
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

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between font-sans selection:bg-[#0095ff]/30 relative overflow-x-hidden">
      {/* Decorative cosmic background glow */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#0095ff]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />

      {/* Top Header */}
      <header className="border-b border-white/5 bg-[#05070a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 border border-white/10 rounded-2xl flex items-center justify-center shadow-lg shadow-[#0095ff]/10">
              <svg className="w-5.5 h-5.5 text-[#0095ff] drop-shadow-[0_0_8px_rgba(0,149,255,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div>
              <span className="font-display font-bold text-xl tracking-tight text-white block">
                Nebula<span className="bg-gradient-to-r from-[#0095ff] to-cyan-400 bg-clip-text text-transparent"> Drive</span>
              </span>
              <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase block">Secure Cloud Storage</span>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="flex items-center gap-2 text-xs font-bold bg-white/5 hover:bg-[#0095ff] hover:text-white border border-white/5 py-2.5 px-4 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to Drive</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 flex-1 flex flex-col justify-center items-center">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-16 animate-pulse">
            <Loader2 className="w-12 h-12 text-[#0095ff] animate-spin" />
            <p className="text-sm font-semibold text-slate-400">Loading secure file page...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
            <AlertTriangle className="w-12 h-12 mx-auto text-rose-500" />
            <h3 className="font-display font-bold text-lg text-white">Retrieval Failed</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
            <button
              onClick={onClose}
              className="w-full bg-[#0095ff] hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors cursor-pointer mt-2"
            >
              Return Home
            </button>
          </div>
        ) : (
          <div className="w-full bg-[#111622]/80 border border-white/5 rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl backdrop-blur-md">
            
            {/* Header description of file */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
              <div className="flex items-center gap-4 text-left">
                <div className="p-4 bg-[#0095ff]/10 text-[#0095ff] border border-[#0095ff]/20 rounded-2xl">
                  {isVideo ? <FileVideo className="w-7 h-7" /> : 
                   isAudio ? <Music className="w-7 h-7" /> : 
                   isImage ? <ImageIcon className="w-7 h-7" /> : 
                   isZip ? <FileArchive className="w-7 h-7" /> : 
                   <FileText className="w-7 h-7" />}
                </div>
                <div className="space-y-1">
                  <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight break-all max-w-lg">
                    {fileName}
                  </h1>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {formatDate(uploadDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                      {formatBytes(fileSize)}
                    </span>
                  </div>
                </div>
              </div>

              <a
                href={downloadUrl}
                download={fileName}
                className="w-full sm:w-auto bg-[#0095ff] hover:bg-sky-500 text-white font-bold py-3.5 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#0095ff]/20 active:scale-95 cursor-pointer text-xs"
              >
                <Download className="w-4 h-4" />
                <span>Download File</span>
              </a>
            </div>

            {/* Formatted File Viewer Section */}
            <div className="bg-[#0b0e14] border border-white/5 rounded-2xl overflow-hidden shadow-inner flex flex-col justify-center items-center">
              
              {/* VIDEO FORMAT */}
              {isVideo && (
                <div className="w-full relative group">
                  <video
                    ref={videoRef}
                    src={downloadUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={handlePlayPause}
                    className="w-full max-h-[480px] object-contain bg-black cursor-pointer"
                    playsInline
                  />
                  {/* Custom Player Controls */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 space-y-3">
                    {/* Progress Slider */}
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      value={currentTime}
                      onChange={handleSeekChange}
                      className="w-full accent-[#0095ff] cursor-pointer h-1.5 rounded-lg bg-white/20"
                    />
                    <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                      <div className="flex items-center gap-4">
                        <button onClick={handlePlayPause} className="text-white hover:text-[#0095ff] transition-colors">
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                      </div>

                      {/* Volume */}
                      <div className="flex items-center gap-2">
                        <button onClick={toggleMute} className="text-white hover:text-[#0095ff] transition-colors">
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-16 accent-[#0095ff] cursor-pointer h-1 rounded-lg bg-white/20"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AUDIO FORMAT */}
              {isAudio && (
                <div className="w-full p-8 max-w-xl mx-auto space-y-6">
                  <audio
                    ref={audioRef}
                    src={downloadUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    className="hidden"
                  />
                  
                  {/* Circular Disk Rotating Visualization */}
                  <div className="flex justify-center">
                    <div className={`w-32 h-32 rounded-full bg-gradient-to-tr from-[#0095ff] to-cyan-500 p-0.5 shadow-xl ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }}>
                      <div className="w-full h-full bg-[#0b0e14] rounded-full flex items-center justify-center relative">
                        <Music className="w-8 h-8 text-[#0095ff] opacity-60" />
                        <div className="w-3.5 h-3.5 bg-black rounded-full absolute" />
                      </div>
                    </div>
                  </div>

                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-white truncate px-4">{fileName}</p>
                    <p className="text-xs text-slate-400 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</p>
                  </div>

                  {/* Player controls */}
                  <div className="space-y-4">
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      value={currentTime}
                      onChange={handleSeekChange}
                      className="w-full accent-[#0095ff] cursor-pointer h-1.5 rounded-lg bg-white/10"
                    />

                    <div className="flex items-center justify-between">
                      <button 
                        onClick={toggleMute} 
                        className="p-2 hover:bg-white/5 rounded-xl text-slate-300 hover:text-white transition-colors"
                      >
                        {isMuted ? <VolumeX className="w-4.5 h-4.5 text-rose-400" /> : <Volume2 className="w-4.5 h-4.5" />}
                      </button>

                      <button
                        onClick={handlePlayPause}
                        className="w-12 h-12 rounded-full bg-[#0095ff] hover:bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-[#0095ff]/15 hover:scale-105 active:scale-95 transition-all"
                      >
                        {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                      </button>

                      <div className="w-20">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-full accent-[#0095ff] cursor-pointer h-1 rounded-lg bg-white/10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* IMAGE FORMAT */}
              {isImage && (
                <div className="p-4 w-full flex justify-center bg-black/40">
                  <img
                    src={downloadUrl}
                    alt={fileName}
                    className="max-w-full max-h-[480px] object-contain rounded-xl shadow-lg border border-white/5 select-none"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              {/* BINARY/DOC/ZIP FORMAT */}
              {!isVideo && !isAudio && !isImage && (
                <div className="py-12 px-6 text-center space-y-4 max-w-md">
                  <div className="p-5 bg-white/5 border border-white/5 text-slate-400 rounded-3xl w-fit mx-auto shadow-inner">
                    {isZip ? <FileArchive className="w-10 h-10 text-[#0095ff]" /> : <FileText className="w-10 h-10" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">No Preview Available</p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      This file format cannot be parsed in-browser. Download the original backup safely to inspect locally.
                    </p>
                  </div>
                  <a
                    href={downloadUrl}
                    download={fileName}
                    className="inline-flex bg-white/5 hover:bg-white/10 text-slate-200 border border-white/5 hover:border-white/10 font-bold py-3 px-6 rounded-2xl text-xs transition-all cursor-pointer items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-[#0095ff]" />
                    <span>Download original</span>
                  </a>
                </div>
              )}

            </div>

            {/* Bottom info footer */}
            <div className="flex items-center gap-2 justify-center text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              <span>● Encrypted Tunnel</span>
              <span>● Decentered Nodes</span>
              <span>● Safe Peer Download</span>
            </div>

          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="border-t border-white/5 py-6 bg-[#040609] text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} Nebula Drive, inc. All binary pathways verified.</p>
      </footer>
    </div>
  );
}
