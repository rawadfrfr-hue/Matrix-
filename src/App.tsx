/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  FolderPlus, 
  File as FileIcon, 
  Trash2, 
  User, 
  LogOut, 
  ChevronRight, 
  Search, 
  X, 
  Plus, 
  HardDrive, 
  Download, 
  AlertCircle, 
  Loader2, 
  UploadCloud, 
  Lock, 
  Mail, 
  ArrowLeft,
  Move,
  CornerUpLeft,
  Check,
  Shield,
  Eye,
  EyeOff,
  Menu
} from 'lucide-react';

interface StorageItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number; // in bytes
  uploadDate: string;
  parentId: string | null;
  isTrashed: boolean;
  // If file
  fileId?: string; 
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function App() {
  // Authentication State
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Layout & Navigation
  const [activeTab, setActiveTab] = useState<'files' | 'trash' | 'account'>('files');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Storage Items
  const [items, setItems] = useState<StorageItem[]>([]);
  
  // Modals / Actions state
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState<StorageItem | null>(null);

  // File Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadingName, setCurrentUploadingName] = useState('');
  const [appError, setAppError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local Storage for Auth & Client State Simulation
  useEffect(() => {
    const savedUser = localStorage.getItem('nexus_cloud_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    // Initialize mock folders if nothing is present
    const savedItems = localStorage.getItem('nexus_cloud_items');
    if (savedItems) {
      setItems(JSON.parse(savedItems));
    } else {
      const initialItems: StorageItem[] = [
        { id: 'f-1', name: 'Documents', type: 'folder', size: 0, uploadDate: new Date().toISOString(), parentId: null, isTrashed: false },
        { id: 'f-2', name: 'Images & Photos', type: 'folder', size: 0, uploadDate: new Date().toISOString(), parentId: null, isTrashed: false },
        { id: 'f-3', name: 'Work Projects', type: 'folder', size: 0, uploadDate: new Date().toISOString(), parentId: 'f-1', isTrashed: false },
      ];
      setItems(initialItems);
      localStorage.setItem('nexus_cloud_items', JSON.stringify(initialItems));
    }
  }, []);

  // Fetch real uploaded files from backend and merge into items list
  const fetchBackendFiles = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const backendFiles = await res.json();
        // Convert to StorageItem structure
        const formattedFiles: StorageItem[] = backendFiles.map((f: any) => ({
          id: f.fileId,
          name: f.fileName,
          type: 'file',
          size: f.fileSize || 0,
          uploadDate: f.uploadDate || new Date().toISOString(),
          parentId: f.parentId || null, // Keep existing structure or default to root
          isTrashed: f.isTrashed || false,
          fileId: f.fileId
        }));

        setItems(prevItems => {
          // Keep folders, filter out old files to avoid duplicate list
          const folders = prevItems.filter(item => item.type === 'folder');
          const merged = [...folders, ...formattedFiles];
          localStorage.setItem('nexus_cloud_items', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (e) {
      console.warn('Backend file fetch unavailable or unconfigured yet.');
    }
  };

  useEffect(() => {
    if (user) {
      fetchBackendFiles();
    }
  }, [user]);

  // Persist items whenever they change
  const saveItems = (newItems: StorageItem[]) => {
    setItems(newItems);
    localStorage.setItem('nexus_cloud_items', JSON.stringify(newItems));
  };

  // Auth Actions
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!email || !password) {
      setAuthError('Please fill in all fields.');
      return;
    }
    setAuthLoading(true);

    // Simulate login verification or setup local storage user
    setTimeout(() => {
      const u = { email, name: email.split('@')[0] };
      setUser(u);
      localStorage.setItem('nexus_cloud_user', JSON.stringify(u));
      setAuthLoading(false);
    }, 800);
  };

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!email || !password || !name) {
      setAuthError('Please fill in all fields.');
      return;
    }
    setAuthLoading(true);

    setTimeout(() => {
      const u = { email, name };
      setUser(u);
      localStorage.setItem('nexus_cloud_user', JSON.stringify(u));
      setAuthLoading(false);
    }, 800);
  };

  const handleLogOut = () => {
    setUser(null);
    localStorage.removeItem('nexus_cloud_user');
    setCurrentFolderId(null);
    setActiveTab('files');
  };

  // Folder Actions
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const newFolder: StorageItem = {
      id: 'f-' + Date.now(),
      name: newFolderName,
      type: 'folder',
      size: 0,
      uploadDate: new Date().toISOString(),
      parentId: currentFolderId,
      isTrashed: false
    };

    saveItems([...items, newFolder]);
    setNewFolderName('');
    setIsNewFolderModalOpen(false);
  };

  // Move / Delete Operations
  const handleTrashItem = (id: string) => {
    const updated = items.map(item => {
      if (item.id === id) {
        return { ...item, isTrashed: true };
      }
      return item;
    });
    saveItems(updated);
  };

  const handleRestoreItem = (id: string) => {
    const updated = items.map(item => {
      if (item.id === id) {
        return { ...item, isTrashed: false };
      }
      return item;
    });
    saveItems(updated);
  };

  const handlePermanentDelete = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (item && item.type === 'file') {
      try {
        const res = await fetch(`/api/delete/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          const updated = items.filter(item => item.id !== id);
          saveItems(updated);
        } else {
          const data = await res.json().catch(() => ({}));
          setAppError(data.error || 'Failed to delete file from database.');
        }
      } catch (err) {
        setAppError('Failed to delete file from database.');
      }
    } else {
      const updated = items.filter(item => item.id !== id);
      saveItems(updated);
    }
  };

  const handleMoveItem = (targetFolderId: string | null) => {
    if (!itemToMove) return;
    
    // Prevent moving a folder inside itself
    if (itemToMove.type === 'folder' && itemToMove.id === targetFolderId) {
      setAppError('Cannot move a folder into itself.');
      setIsMoveModalOpen(false);
      return;
    }

    const updated = items.map(item => {
      if (item.id === itemToMove.id) {
        return { ...item, parentId: targetFolderId };
      }
      return item;
    });
    saveItems(updated);
    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  // File Upload Logic
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files[0]);
    }
  };

  const handleUpload = (file: File) => {
    setAppError('');
    setUploading(true);
    setUploadProgress(0);
    setCurrentUploadingName(file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(0);
      setCurrentUploadingName('');
      if (xhr.status === 200) {
        try {
          const res = JSON.parse(xhr.responseText);
          // Insert file metadata with parent folder context
          const uploadedItem: StorageItem = {
            id: res.metadata.fileId,
            name: res.metadata.fileName,
            type: 'file',
            size: res.metadata.fileSize,
            uploadDate: res.metadata.uploadDate,
            parentId: currentFolderId,
            isTrashed: false,
            fileId: res.metadata.fileId
          };
          saveItems([...items, uploadedItem]);
        } catch {
          fetchBackendFiles();
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setAppError(res.error || 'Upload failed');
        } catch {
          setAppError('Upload failed with status ' + xhr.status);
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(0);
      setCurrentUploadingName('');
      setAppError('Network error occurred during upload.');
    };

    const formData = new FormData();
    formData.append('file', file);
    // Keep folder structure context if uploading inside a folder
    if (currentFolderId) {
      formData.append('parentId', currentFolderId);
    }
    xhr.send(formData);
  };

  const downloadFile = (fileId: string) => {
    window.location.href = `/api/download/${fileId}`;
  };

  // Directory navigation calculations
  const getBreadcrumbs = () => {
    const trail: { id: string | null; name: string }[] = [{ id: null, name: 'Home' }];
    let currentId = currentFolderId;
    
    while (currentId) {
      const folder = items.find(item => item.id === currentId);
      if (folder) {
        trail.splice(1, 0, { id: folder.id, name: folder.name });
        currentId = folder.parentId;
      } else {
        break;
      }
    }
    return trail;
  };

  // Filtered lists
  const currentViewItems = items.filter(item => {
    const matchesTrash = activeTab === 'trash' ? item.isTrashed : !item.isTrashed;
    const matchesFolder = activeTab === 'trash' || item.parentId === currentFolderId;
    const matchesSearch = searchQuery
      ? item.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesTrash && matchesFolder && matchesSearch;
  });

  // Calculate stats
  const totalFilesSize = items.reduce((acc, curr) => acc + (curr.type === 'file' ? curr.size : 0), 0);
  const totalFoldersCount = items.filter(i => i.type === 'folder' && !i.isTrashed).length;
  const totalFilesCount = items.filter(i => i.type === 'file' && !i.isTrashed).length;

  // Unlocking Auth Page Render
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
        {/* Abstract Background Accents */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">NexusCloud</h1>
            <p className="text-slate-400 text-sm text-center">Unlimited secure binary cloud storage platform</p>
          </div>

          {authError && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp} className="space-y-5">
            {authMode === 'signup' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Full Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-4 flex items-center text-slate-500">
                    <User className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all text-white placeholder-slate-600"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-slate-500">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all text-white placeholder-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Password</label>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-slate-500">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-3 pl-12 pr-12 text-sm focus:outline-none focus:border-blue-500 transition-all text-white placeholder-slate-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold py-3.5 px-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>{authMode === 'signin' ? 'Sign In to Account' : 'Create Account'}</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-slate-800/80 pt-6">
            <p className="text-sm text-slate-500">
              {authMode === 'signin' ? "Don't have an account yet?" : "Already have an account?"}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                  setAuthError('');
                }}
                className="text-blue-400 hover:text-blue-300 font-medium ml-1.5 focus:outline-none"
              >
                {authMode === 'signin' ? 'Create an Account' : 'Sign In instead'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Master Dashboard Render
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans overflow-hidden">
      {/* Mobile Sidebar Backdrop overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-45 md:hidden transition-opacity duration-300"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div>
          <div className="p-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <span className="font-bold text-xl tracking-tight text-white">NexusCloud</span>
            </div>
            
            {/* Mobile close sidebar button */}
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white md:hidden transition-colors cursor-pointer"
              title="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 mb-6">
            <div className="relative">
              <input
                type="text"
                placeholder="Search everything..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:border-blue-500 text-white placeholder-slate-500"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            </div>
          </div>

          <nav className="px-4 space-y-1.5">
            <button
              onClick={() => { setActiveTab('files'); setCurrentFolderId(null); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-medium text-sm transition-all text-left cursor-pointer
                ${activeTab === 'files' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500 pl-3.5' : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'}`}
            >
              <HardDrive className="w-5 h-5" />
              My Storage
            </button>
            <button
              onClick={() => { setActiveTab('trash'); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-medium text-sm transition-all text-left cursor-pointer
                ${activeTab === 'trash' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500 pl-3.5' : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'}`}
            >
              <Trash2 className="w-5 h-5" />
              Recycle Trash
            </button>
            <button
              onClick={() => { setActiveTab('account'); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-medium text-sm transition-all text-left cursor-pointer
                ${activeTab === 'account' ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500 pl-3.5' : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'}`}
            >
              <User className="w-5 h-5" />
              My Account
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Stats */}
        <div className="p-6 border-t border-slate-800">
          <div className="bg-slate-950/60 border border-slate-800/50 rounded-2xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Storage Stats</span>
              <span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">Unlimited</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Space Used</span>
                <span>{formatBytes(totalFilesSize)}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: totalFilesSize > 0 ? '45%' : '2%' }} />
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500">
              <span>{totalFoldersCount} folders</span>
              <span>{totalFilesCount} files</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-400 truncate max-w-[140px]">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-blue-400 border border-slate-700">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium truncate">{user.name}</span>
            </div>
            <button
              onClick={handleLogOut}
              title="Logout"
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800/60 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>

       {/* Main Panel Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header Bar */}
        <header className="h-20 border-b border-slate-800 flex items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-4">
            {/* Hamburger menu button for mobile */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-slate-300 hover:text-white md:hidden cursor-pointer transition-colors"
              title="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            {activeTab === 'files' ? (
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-400 overflow-x-auto whitespace-nowrap py-1">
                {getBreadcrumbs().map((crumb, idx, arr) => (
                  <React.Fragment key={crumb.id || 'root'}>
                    <button
                      onClick={() => setCurrentFolderId(crumb.id)}
                      className="hover:text-blue-400 font-medium cursor-pointer transition-colors"
                    >
                      {crumb.name}
                    </button>
                    {idx < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <h1 className="text-base sm:text-lg font-semibold text-white capitalize">{activeTab}</h1>
            )}
          </div>

          {/* Quick Stats or status banner */}
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 border border-slate-800 px-3 sm:px-4 py-1.5 rounded-full flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="hidden xs:inline">Firebase Database: Sync Active</span>
              <span className="xs:hidden">Synced</span>
            </div>
          </div>
        </header>

        {/* Primary View Router */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-6 sm:space-y-8">
          {appError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{appError}</span>
              </div>
              <button onClick={() => setAppError('')} className="p-1 hover:bg-slate-800/80 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'files' && (
            <>
              {/* Compact Unified Toolbar */}
              <div className="flex flex-col md:flex-row gap-4 items-stretch">
                {/* Create New Folder Button */}
                <button
                  onClick={() => setIsNewFolderModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-3.5 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 cursor-pointer whitespace-nowrap h-[54px] md:h-[54px]"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Create New Folder</span>
                </button>

                {/* Compact Drag & Drop / Click Upload Zone */}
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  className={`flex-1 border border-dashed border-slate-800 bg-slate-900/10 hover:bg-slate-900/30 rounded-2xl px-5 py-3.5 flex items-center justify-center text-center transition-all cursor-pointer group relative overflow-hidden h-[54px]
                    ${isDragging ? 'border-blue-500 bg-blue-500/5' : ''}
                    ${uploading ? 'pointer-events-none' : ''}`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={onFileSelect}
                    className="hidden"
                  />
                  {uploading ? (
                    <div className="flex items-center gap-3 w-full justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
                      <div className="flex-1 max-w-md flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px]">{currentUploadingName}</span>
                        <span className="text-[10px] text-blue-400 font-bold whitespace-nowrap">{uploadProgress}%</span>
                        <div className="flex-1 h-1.5 bg-slate-850 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full shadow-[0_0_6px_rgba(59,130,246,0.5)]"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400 group-hover:text-white transition-colors">
                      <UploadCloud className="w-4.5 h-4.5 text-blue-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-slate-300 group-hover:text-white truncate">
                        Drag & drop files or click to upload to <span className="text-blue-400 font-semibold">{currentFolderId ? 'this folder' : 'Home'}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Back out button if in subfolder */}
              {currentFolderId && (
                <button
                  onClick={() => {
                    const currentFolder = items.find(i => i.id === currentFolderId);
                    setCurrentFolderId(currentFolder ? currentFolder.parentId : null);
                  }}
                  className="inline-flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 font-semibold focus:outline-none"
                >
                  <CornerUpLeft className="w-4 h-4" />
                  <span>Go Up Folder</span>
                </button>
              )}

              {/* Storage Items Viewer */}
              <div className="bg-slate-900/40 rounded-3xl border border-slate-800 overflow-hidden">
                <div className="px-8 py-4 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-white">Files & Folders</h3>
                  <span className="text-xs text-slate-400">{currentViewItems.length} elements</span>
                </div>

                <div className="divide-y divide-slate-900">
                  {currentViewItems.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <Folder className="w-12 h-12 text-slate-600 mx-auto" />
                      <div>
                        <p className="text-sm font-semibold text-slate-400">Folder is empty</p>
                        <p className="text-xs text-slate-600 mt-1">Upload a file or create folders to organize your cloud storage.</p>
                      </div>
                    </div>
                  ) : (
                    currentViewItems.map((item) => (
                      <div
                        key={item.id}
                        onDoubleClick={() => {
                          if (item.type === 'folder') {
                            setCurrentFolderId(item.id);
                          }
                        }}
                        className="px-4 sm:px-8 py-4 hover:bg-slate-900/30 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 group"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          {item.type === 'folder' ? (
                            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                              <Folder className="w-5 h-5" />
                            </div>
                          ) : (
                            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
                              <FileIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p 
                              className={`text-sm font-medium text-white truncate max-w-xs md:max-w-md ${item.type === 'folder' ? 'cursor-pointer hover:text-blue-400 hover:underline' : ''}`}
                              onClick={() => {
                                if (item.type === 'folder') {
                                  setCurrentFolderId(item.id);
                                }
                              }}
                            >
                              {item.name}
                            </p>
                            <span className="text-[10px] text-slate-500">
                              Added {new Date(item.uploadDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                          <span className="text-xs text-slate-400 text-left sm:text-right">
                            {item.type === 'folder' ? '--' : formatBytes(item.size)}
                          </span>

                          <div className="flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            {item.type === 'file' && item.fileId && (
                              <button
                                onClick={() => downloadFile(item.fileId!)}
                                className="p-2 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer animate-none"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => { setItemToMove(item); setIsMoveModalOpen(true); }}
                              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
                              title="Move Location"
                            >
                              <Move className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleTrashItem(item.id)}
                              className="p-2 bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'trash' && (
            <div className="space-y-6">
              <div className="bg-slate-900/40 rounded-3xl border border-slate-800 overflow-hidden">
                <div className="px-8 py-4 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-white">Recycle Trash Bin</h3>
                  <span className="text-xs text-slate-400">Deleted files are retained temporarily</span>
                </div>

                <div className="divide-y divide-slate-900">
                  {currentViewItems.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <Trash2 className="w-12 h-12 text-slate-700 mx-auto" />
                      <div>
                        <p className="text-sm font-semibold text-slate-400">Trash is empty</p>
                        <p className="text-xs text-slate-600 mt-1">There are no items currently marked for deletion.</p>
                      </div>
                    </div>
                  ) : (
                    currentViewItems.map((item) => (
                      <div
                        key={item.id}
                        className="px-4 sm:px-8 py-4 hover:bg-slate-900/30 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                          <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl flex-shrink-0">
                            {item.type === 'folder' ? <Folder className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{item.name}</p>
                            <span className="text-[10px] text-slate-500 block sm:inline">
                              Originally uploaded {new Date(item.uploadDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                          <button
                            onClick={() => handleRestoreItem(item.id)}
                            className="flex-1 sm:flex-none px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(item.id)}
                            className="flex-1 sm:flex-none px-3.5 py-1.5 bg-red-950/40 hover:bg-red-900 text-red-400 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center whitespace-nowrap"
                          >
                            Delete Forever
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Account profile card */}
              <div className="col-span-1 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-6">
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold text-white border-2 border-slate-700 shadow-xl shadow-blue-500/10">
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">{user.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-5 space-y-4">
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Member Level</span>
                    <span className="text-blue-400 font-semibold">Pro Partner</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Status</span>
                    <span className="text-green-400 font-semibold">Active Sync</span>
                  </div>
                </div>
              </div>

              {/* Stats and service configurations */}
              <div className="col-span-1 md:col-span-2 space-y-6">
                <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-6">
                  <h3 className="font-bold text-base text-white">Storage Node Credentials</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    NexusCloud connects natively to Matrix storage backend and Firebase Realtime Database. Below is your current session client health state.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Matrix Homeseven</p>
                      <p className="text-xs font-semibold text-white mt-1 truncate">https://matrix.org</p>
                    </div>
                    <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Storage Node Type</p>
                      <p className="text-xs font-semibold text-white mt-1">Chunked Matrix Streams</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-4">
                  <h3 className="font-bold text-base text-white">System Security Info</h3>
                  <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
                    <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-white">Self-Managed Cloud Integrity</p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Files uploaded are partitioned into 40MB payloads within Matrix Client-Server API networks. Data is safe from single point deletion.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* New Folder Creation Modal */}
      {isNewFolderModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-white">Create New Folder</h3>
              <button 
                onClick={() => { setIsNewFolderModalOpen(false); setNewFolderName(''); }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Folder Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Invoices, Personal Documents"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 text-white placeholder-slate-600"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsNewFolderModalOpen(false); setNewFolderName(''); }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-4 rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Location Modal */}
      {isMoveModalOpen && itemToMove && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-white">Move Location</h3>
                <p className="text-xs text-slate-400 mt-1 truncate max-w-xs">Move "{itemToMove.name}" to another folder</p>
              </div>
              <button 
                onClick={() => { setIsMoveModalOpen(false); setItemToMove(null); }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Destination Folder</p>
              
              <div className="bg-slate-950 border border-slate-850 rounded-2xl divide-y divide-slate-900 max-h-60 overflow-y-auto">
                {/* Root Destination Option */}
                <div
                  onClick={() => handleMoveItem(null)}
                  className="p-4 hover:bg-slate-900/40 cursor-pointer flex items-center justify-between transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-white">Home Storage Root</span>
                  </div>
                  {itemToMove.parentId === null && <Check className="w-4 h-4 text-blue-400" />}
                </div>

                {/* Other folders */}
                {items
                  .filter(item => item.type === 'folder' && !item.isTrashed && item.id !== itemToMove.id)
                  .map(folder => (
                    <div
                      key={folder.id}
                      onClick={() => handleMoveItem(folder.id)}
                      className="p-4 hover:bg-slate-900/40 cursor-pointer flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <Folder className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold text-white">{folder.name}</span>
                      </div>
                      {itemToMove.parentId === folder.id && <Check className="w-4 h-4 text-blue-400" />}
                    </div>
                  ))}
              </div>

              <button
                onClick={() => { setIsMoveModalOpen(false); setItemToMove(null); }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-4 rounded-2xl text-xs transition-colors cursor-pointer"
              >
                Close Dialog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
