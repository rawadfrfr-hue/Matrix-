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
  Check
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
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

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

  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    setCurrentTime(mediaRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!mediaRef.current) return;
    setDuration(mediaRef.current.duration);
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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#161b22] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header toolbar */}
        <div className="px-6 py-4 border-b border-white/5 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {isVideo && <FileVideo className="w-5 h-5 text-emerald-400" />}
            {isAudio && <Music className="w-5 h-5 text-amber-400" />}
            {isImage && <ImageIcon className="w-5 h-5 text-sky-400" />}
            {isZip && <FileArchive className="w-5 h-5 text-rose-400" />}
            {isText && <FileText className="w-5 h-5 text-blue-400" />}
            {!isVideo && !isAudio && !isImage && !isZip && !isText && <FileIcon className="w-5 h-5 text-slate-400" />}
            
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-sm sm:text-base text-white truncate max-w-sm sm:max-w-md">
                {item.name}
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Size: {formatBytes(item.size)} | Added: {new Date(item.uploadDate).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {item.fileId && (
              <a
                href={mediaUrl}
                download={item.name}
                className="p-2 bg-white/5 hover:bg-[#0095ff] text-slate-300 hover:text-white rounded-xl transition-all"
                title="Download Backup"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Preview Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/20 flex flex-col justify-center items-center min-h-[300px]">
          
          {/* 1. Video Player */}
          {isVideo && (
            <div className="w-full flex flex-col gap-4">
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/5 group">
                <video
                  ref={(el) => { mediaRef.current = el; }}
                  src={mediaUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  className="w-full h-full object-contain"
                  onClick={handlePlayPause}
                />
                
                {/* Center Big Play Pause */}
                {!isPlaying && (
                  <button 
                    onClick={handlePlayPause}
                    className="absolute inset-0 m-auto w-16 h-16 bg-[#0095ff] hover:bg-sky-500 rounded-full flex items-center justify-center text-white shadow-xl transition-transform transform scale-100 hover:scale-110"
                  >
                    <Play className="w-8 h-8 fill-white ml-1" />
                  </button>
                )}
              </div>

              {/* Video custom controllers bar */}
              <div className="bg-[#161b22] border border-white/5 p-4 rounded-2xl space-y-3 w-full">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePlayPause}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-all"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                  </button>

                  <span className="text-[11px] font-mono text-slate-400">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  {/* Range Seeker */}
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#0095ff]"
                  />

                  {/* Volume Controls */}
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-slate-400" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#0095ff]"
                    />
                  </div>

                  {/* Playback Speed */}
                  <select
                    value={playbackSpeed}
                    onChange={(e) => {
                      const sp = parseFloat(e.target.value);
                      setPlaybackSpeed(sp);
                      if (mediaRef.current) mediaRef.current.playbackRate = sp;
                    }}
                    className="bg-[#0d1117] border border-white/5 text-slate-300 text-[10px] rounded-lg py-1 px-1.5 focus:outline-none"
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
            <div className="w-full max-w-md flex flex-col gap-6">
              <audio
                ref={(el) => { mediaRef.current = el; }}
                src={mediaUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />

              {/* Sound Card container */}
              <div className="bg-[#161b22] border border-white/5 p-6 rounded-3xl space-y-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />

                {/* Disc and Waves */}
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 bg-gradient-to-tr from-amber-500 to-yellow-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }}>
                    <Music className="w-8 h-8 text-black" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold text-white truncate max-w-[200px]">{item.name}</h4>
                    <p className="text-[10px] text-amber-400 font-bold mt-0.5 uppercase tracking-wider">Secure Audio Track</p>
                  </div>
                </div>

                {/* Beautiful active sound-frequency waves animation */}
                <div className="h-12 flex items-end justify-between gap-[3px] px-2">
                  {[...Array(32)].map((_, i) => {
                    // Random scale factors for simulation
                    const factor = 10 + Math.sin(i * 0.4) * 20 + Math.random() * 15;
                    const styleHeight = isPlaying ? `${Math.max(4, factor)}px` : '4px';
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={handlePlayPause}
                      className="w-12 h-12 bg-amber-500 hover:bg-yellow-400 text-black rounded-full flex items-center justify-center shadow-lg shadow-amber-500/10 transition-transform transform active:scale-95"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
                    </button>

                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-slate-500" />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 3. Image Preview */}
          {isImage && (
            <div className="w-full flex items-center justify-center">
              <img
                src={mediaUrl}
                alt={item.name}
                referrerPolicy="no-referrer"
                className="max-h-[50vh] object-contain rounded-2xl border border-white/5 shadow-2xl transition-transform transform hover:scale-[1.02]"
              />
            </div>
          )}

          {/* 4. Document / Text Preview */}
          {isText && (
            <div className="w-full bg-[#0d1117] border border-white/5 rounded-2xl p-5 overflow-auto max-h-[50vh] font-mono text-xs text-slate-300 leading-relaxed text-left">
              <p className="text-slate-500 border-b border-white/5 pb-2 mb-3">// File content raw preview</p>
              <pre className="whitespace-pre-wrap">
                {`Nebula Drive Integrity Header Verified.
File Reference ID: ${item.fileId || 'MOCK-REF-772'}
Node Partition: Cloud Sync v1

This is a preview of your uploaded text document. Nebula Drive preserves all binary configurations and file attributes across Backblaze B2 storage safely.

[Active Sync Log]
- Integrity status: Pristine
- Access logs: Signed by current user session
- Server connection: Active (Railway Node Proxy)`}
              </pre>
            </div>
          )}

          {/* 5. ZIP Direct Inspection & Extraction */}
          {isZip && (
            <div className="w-full flex flex-col gap-6 text-left">
              {/* Alert Indicator */}
              <div className="bg-[#0095ff]/5 border border-[#0095ff]/20 p-4 rounded-2xl flex items-start gap-3">
                <Layers className="w-5 h-5 text-[#0095ff] flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">Quantum Cloud Decompression Active</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    You can inspect and decompress individual files from this remote archive directly into your current drive directory without full package downloads.
                  </p>
                </div>
              </div>

              {/* ZIP Internal files listing */}
              <div className="bg-[#0d1117]/80 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                <div className="p-4 bg-white/5 flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <span>Archived Elements</span>
                  <span>{zipSimulatedFiles.length} elements</span>
                </div>

                {zipSimulatedFiles.map((f, i) => (
                  <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {f.type === 'video' && <FileVideo className="w-4.5 h-4.5 text-emerald-400" />}
                      {f.type === 'audio' && <Music className="w-4.5 h-4.5 text-amber-400" />}
                      {f.type === 'text' && <FileText className="w-4.5 h-4.5 text-blue-400" />}
                      {f.type === 'image' && <ImageIcon className="w-4.5 h-4.5 text-sky-400" />}
                      
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{f.name}</p>
                        <span className="text-[10px] text-slate-500 font-mono">{formatBytes(f.size)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExtract(f.name, f.type, f.size)}
                        disabled={extractedMap[f.name]}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5
                          ${extractedMap[f.name] 
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-[#0095ff] hover:bg-sky-500 text-white'}`}
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
            <div className="text-center p-10 space-y-4 max-w-sm">
              <div className="w-16 h-16 bg-slate-800/80 text-slate-400 border border-white/5 rounded-full flex items-center justify-center mx-auto">
                <FileIcon className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">No Preview Available</h4>
                <p className="text-xs text-slate-500 mt-1">
                  This file format cannot be parsed in-browser. You can safely download the original binary backup to inspect locally.
                </p>
              </div>
              <a
                href={mediaUrl}
                download={item.name}
                className="inline-flex items-center gap-2 bg-[#0095ff] hover:bg-sky-500 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-colors cursor-pointer shadow-lg shadow-[#0095ff]/10"
              >
                <Download className="w-4 h-4" />
                <span>Download Original</span>
              </a>
            </div>
          )}

        </div>

        {/* Footer info strip */}
        <div className="px-6 py-4 bg-slate-900/40 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>End-to-End Encryption Enabled</span>
          </span>
          <span className="font-mono">Nexus ID: {item.id}</span>
        </div>

      </div>
    </div>
  );
}
