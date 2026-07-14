/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  HardDrive, 
  Trash2, 
  User, 
  LogOut, 
  X, 
  Star, 
  Clock, 
  Layers
} from 'lucide-react';
import { ActiveTab } from '../types';

interface SidebarProps {
  user: { name: string; email: string };
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  setCurrentFolderId: (id: string | null) => void;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  totalFilesSize: number;
  totalFoldersCount: number;
  totalFilesCount: number;
  storageQuotaGb?: number;
  onLogOut: () => void;
}

export default function Sidebar({
  user,
  activeTab,
  setActiveTab,
  setCurrentFolderId,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  totalFilesSize,
  totalFoldersCount,
  totalFilesCount,
  storageQuotaGb = 15,
  onLogOut
}: SidebarProps) {
  
  const formatBytes = (bytes: number, decimals = 1) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const navItems = [
    { id: 'files', label: 'My Files', icon: HardDrive },
    { id: 'recent', label: 'Recent Files', icon: Clock },
    { id: 'starred', label: 'Starred Elements', icon: Star },
    { id: 'trash', label: 'Recycle Trash', icon: Trash2 },
    { id: 'account', label: 'My Account', icon: User },
  ] as const;

  return (
    <>
      {/* Mobile Sidebar Backdrop overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 md:hidden transition-opacity duration-300"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#05070a] border-r border-white/5 flex flex-col justify-between shrink-0 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div>
          {/* Logo Branding */}
          <div className="p-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center shadow-lg shadow-[#0095ff]/10">
                <svg className="w-5 h-5 text-[#0095ff] drop-shadow-[0_0_8px_rgba(0,149,255,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <span className="font-display font-bold text-lg tracking-tight text-white">
                Root<span className="bg-gradient-to-r from-[#0095ff] to-cyan-400 bg-clip-text text-transparent"> Haven</span>
              </span>
            </div>
            
            {/* Mobile close sidebar button */}
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white md:hidden transition-colors cursor-pointer"
              title="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="px-4 space-y-1.5 mt-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { 
                    setActiveTab(item.id); 
                    if (item.id === 'files') {
                      setCurrentFolderId(null); 
                    }
                    setIsMobileSidebarOpen(false); 
                  }}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-medium text-sm transition-all text-left cursor-pointer active:scale-[0.98]
                    ${isActive 
                      ? 'bg-[#0095ff]/10 text-[#0095ff] border-l-2 border-[#0095ff] pl-3.5' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-[#0095ff]' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Stats & User Details */}
        <div className="p-6 border-t border-white/5">
          {/* Storage stats bento box */}
          <div className="bg-[#161b22]/50 border border-white/5 rounded-2xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cloud Stats</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Storage Used</span>
                <span className="font-semibold text-slate-200">
                  {(() => {
                    const quota = storageQuotaGb * 1024 * 1024 * 1024;
                    const usedPercent = Math.min(100, Math.max(0, (totalFilesSize / quota) * 100));
                    const percentStr = usedPercent % 1 === 0 ? usedPercent.toFixed(0) : usedPercent.toFixed(1);
                    return `${percentStr}% of ${storageQuotaGb} GB Used`;
                  })()}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                {/* Dynamically update the progress bar */}
                <div 
                  className="bg-[#0095ff] h-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,149,255,0.4)]" 
                  style={{ 
                    width: (() => {
                      const quota = storageQuotaGb * 1024 * 1024 * 1024;
                      const usedPercent = Math.min(100, Math.max(0, (totalFilesSize / quota) * 100));
                      return `${usedPercent}%`;
                    })()
                  }} 
                />
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>{totalFoldersCount} folders</span>
              <span>{totalFilesCount} files</span>
            </div>
          </div>

          {/* User Profile Card */}
          <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
            <div className="flex items-center gap-2.5 truncate max-w-[150px]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-[#0095ff] flex items-center justify-center font-bold text-xs text-white border border-white/10 shadow-md">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-tight">{user.name}</p>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{user.email}</p>
              </div>
            </div>
            <button
              onClick={onLogOut}
              title="Sign Out Session"
              className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer active:scale-95"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
