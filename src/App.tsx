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
  ChevronRight, 
  Search, 
  X, 
  Plus, 
  HardDrive, 
  Download, 
  AlertCircle, 
  Loader2, 
  UploadCloud, 
  CornerUpLeft,
  Check,
  Menu,
  Star,
  Grid,
  List,
  MoreVertical,
  ExternalLink,
  Move,
  Share2,
  FileVideo,
  Music,
  FileArchive,
  ImageIcon,
  FileText
} from 'lucide-react';

import { StorageItem, ActiveTab, ViewMode } from './types';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import LandingPage from './components/LandingPage';
import FilePreviewModal from './components/FilePreviewModal';
import Sidebar from './components/Sidebar';
import SharedFilePage from './components/SharedFilePage';
import { generateVideoThumbnail, generateVideoThumbnailFromUrl } from './utils/thumbnail';

export default function App() {
  // Authentication State
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Layout & Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('files');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedFormatFilter, setSelectedFormatFilter] = useState<'all' | 'folders' | 'video' | 'audio' | 'archives' | 'docs'>('all');

  // Storage Items State
  const [items, setItems] = useState<StorageItem[]>([]);
  
  // Modals & Popups State
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState<StorageItem | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // File Preview & Share States
  const [previewItem, setPreviewItem] = useState<StorageItem | null>(null);
  const [shareLinkItem, setShareLinkItem] = useState<StorageItem | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [sharedFileId, setSharedFileId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const sId = params.get('share');
    if (sId) return sId;

    const pathParts = window.location.pathname.split('/');
    const idx = pathParts.findIndex(p => p === 'share' || p === 'shared');
    if (idx !== -1 && pathParts[idx + 1]) {
      return pathParts[idx + 1];
    }
    return null;
  });

  // File Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadingName, setCurrentUploadingName] = useState('');
  const [appError, setAppError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedThumbnailIds = useRef<Set<string>>(new Set());

  // FAB & New Text File States
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isNewTextFileModalOpen, setIsNewTextFileModalOpen] = useState(false);
  const [newTextFileName, setNewTextFileName] = useState('');
  const [newTextFileContent, setNewTextFileContent] = useState('');

  // Profile Edit & Password Reset States
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Sync profile editing fields with logged in user data
  useEffect(() => {
    if (user) {
      setProfileName(user.name);
      setProfileEmail(user.email);
    }
  }, [user]);

  // Initialize and load user on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('nexus_cloud_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Initialize and load user-specific persistent elements
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    const savedItemsKey = `nexus_cloud_items_${user.email}`;
    const savedItems = localStorage.getItem(savedItemsKey);
    if (savedItems) {
      try {
        const parsed = JSON.parse(savedItems);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(item => item && item.id && item.name && item.id !== 'undefined' && item.name !== 'Untitled File');
          setItems(cleaned);
        } else {
          setItems([]);
        }
      } catch (err) {
        setItems([]);
      }
    } else {
      const initialItems: StorageItem[] = [];
      setItems(initialItems);
      localStorage.setItem(savedItemsKey, JSON.stringify(initialItems));
    }
  }, [user]);

  // Sync real uploaded files from the backend database for current user
  const fetchBackendFiles = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/files?ownerEmail=${encodeURIComponent(user.email)}`);
      if (res.ok) {
        const backendFiles = await res.json();
        const formattedFiles: StorageItem[] = (backendFiles || [])
          .filter((f: any) => f && f.fileId && f.fileName && f.fileName !== 'Untitled File')
          .map((f: any) => ({
            id: f.fileId,
            name: f.fileName,
            type: 'file',
            size: f.fileSize || 0,
            uploadDate: f.uploadDate || new Date().toISOString(),
            parentId: f.parentId || null,
            isTrashed: f.isTrashed || false,
            fileId: f.fileId,
            isStarred: f.isStarred || false,
            thumbnailUrl: f.thumbnailUrl || null
          }));

        setItems(prevItems => {
          const nonBackendItems = prevItems.filter(item => {
            return item && (item.type === 'folder' || item.id.startsWith('preset-'));
          });

          // Filter unique items by ID
          const uniqueItemsMap = new Map<string, StorageItem>();
          nonBackendItems.forEach(item => uniqueItemsMap.set(item.id, item));
          formattedFiles.forEach(item => uniqueItemsMap.set(item.id, item));

          const merged = Array.from(uniqueItemsMap.values());
          localStorage.setItem(`nexus_cloud_items_${user.email}`, JSON.stringify(merged));
          return merged;
        });
      }
    } catch (e) {
      console.warn('Backend file synchronization offline or unconfigured.');
    }
  };

  useEffect(() => {
    if (user) {
      fetchBackendFiles();
    }
  }, [user]);

  // Background thumbnail generation effect for videos without a thumbnail
  useEffect(() => {
    if (!user || items.length === 0) return;

    const itemsToProcess = items.filter(item => {
      if (item.type !== 'file' || !item.fileId) return false;
      if (item.id.startsWith('preset-')) return false;
      const isVideo = item.name.match(/\.(mp4|webm|mov|avi|mkv)$/i);
      if (!isVideo) return false;
      if (item.thumbnailUrl) return false;
      if (processedThumbnailIds.current.has(item.id)) return false;
      return true;
    });

    if (itemsToProcess.length === 0) return;

    const processNext = async () => {
      const nextItem = itemsToProcess[0];
      if (!nextItem || !nextItem.fileId) return;

      processedThumbnailIds.current.add(nextItem.id);
      
      try {
        const downloadUrl = `/api/download/${nextItem.fileId}`;
        const base64Thumb = await generateVideoThumbnailFromUrl(downloadUrl);
        
        // Update local state
        setItems(prev => prev.map(item => {
          if (item.id === nextItem.id) {
            return { ...item, thumbnailUrl: base64Thumb };
          }
          return item;
        }));

        // Send to backend silently
        await fetch(`/api/file/${nextItem.fileId}/thumbnail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thumbnailUrl: base64Thumb })
        });
      } catch (err) {
        console.warn(`Failed background video thumbnail generation for ${nextItem.name}:`, err);
      }
    };

    // Delay background generation slightly to not interfere with page load or rendering
    const timer = setTimeout(() => {
      processNext();
    }, 1500);

    return () => clearTimeout(timer);
  }, [items, user]);

  const saveItems = (newItems: StorageItem[]) => {
    setItems(newItems);
    if (user) {
      localStorage.setItem(`nexus_cloud_items_${user.email}`, JSON.stringify(newItems));
    }
  };

  // Auth Handling
  const handleAuthSuccess = (u: { email: string; name: string }) => {
    setAuthLoading(true);
    setTimeout(() => {
      setUser(u);
      localStorage.setItem('nexus_cloud_user', JSON.stringify(u));
      setAuthLoading(false);
    }, 400);
  };

  const handleLogOut = () => {
    setUser(null);
    localStorage.removeItem('nexus_cloud_user');
    setCurrentFolderId(null);
    setActiveTab('files');
  };

  // Profile and Password Update Handling
  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg('');
    setProfileErrorMsg('');

    if (!profileName.trim()) {
      setProfileErrorMsg('Name cannot be empty.');
      return;
    }
    if (!profileEmail.trim() || !profileEmail.includes('@')) {
      setProfileErrorMsg('Please enter a valid email address.');
      return;
    }

    // Update user name/email in state and localStorage
    const updatedUser = { ...user, name: profileName.trim(), email: profileEmail.trim() } as { name: string; email: string };
    setUser(updatedUser);
    localStorage.setItem('nexus_cloud_user', JSON.stringify(updatedUser));

    // Handle Password Reset if requested
    if (newPassword) {
      if (newPassword.length < 6) {
        setProfileErrorMsg('New password must be at least 6 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setProfileErrorMsg('Passwords do not match.');
        return;
      }
      // Password changed successfully
      setNewPassword('');
      setConfirmPassword('');
      setProfileSuccessMsg('Profile and password updated successfully!');
    } else {
      setProfileSuccessMsg('Profile updated successfully!');
    }
  };

  // Folder Handling
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
      isTrashed: false,
      isStarred: false
    };

    saveItems([...items, newFolder]);
    setNewFolderName('');
    setIsNewFolderModalOpen(false);
  };

  const handleCreateTextFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTextFileName.trim()) return;

    let finalName = newTextFileName.trim();
    if (!finalName.endsWith('.txt')) {
      finalName += '.txt';
    }

    const blob = new Blob([newTextFileContent], { type: 'text/plain' });
    const file = new File([blob], finalName, { type: 'text/plain' });

    setIsNewTextFileModalOpen(false);
    setNewTextFileName('');
    setNewTextFileContent('');

    handleUpload(file);
  };

  // Move / Delete / Star Options
  const handleTrashItem = (id: string) => {
    const updated = items.map(item => {
      if (item.id === id) {
        return { ...item, isTrashed: true };
      }
      return item;
    });
    saveItems(updated);
    setActiveMenuId(null);
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

  const handleToggleStar = (id: string) => {
    const updated = items.map(item => {
      if (item.id === id) {
        return { ...item, isStarred: !item.isStarred };
      }
      return item;
    });
    saveItems(updated);
    setActiveMenuId(null);
  };

  const handlePermanentDelete = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (item && item.type === 'file') {
      if (id.startsWith('preset-')) {
        const updated = items.filter(item => item.id !== id);
        saveItems(updated);
        return;
      }
      try {
        const res = await fetch(`/api/delete/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          const updated = items.filter(item => item.id !== id);
          saveItems(updated);
        } else {
          const data = await res.json().catch(() => ({}));
          setAppError(data.error || 'Failed to remove file from server storage.');
        }
      } catch (err) {
        setAppError('Failed to delete file from backend node.');
      }
    } else {
      const updated = items.filter(item => item.id !== id);
      saveItems(updated);
    }
  };

  const handleMoveItem = (targetFolderId: string | null) => {
    if (!itemToMove) return;
    
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

  // Simulated extraction inside ZIP Inspection Modal
  const handleExtractSimulated = (fileName: string, type: 'file' | 'folder', size: number) => {
    const extractedItem: StorageItem = {
      id: 'ext-' + Date.now() + '-' + Math.floor(Math.random()*100),
      name: fileName,
      type,
      size,
      uploadDate: new Date().toISOString(),
      parentId: currentFolderId,
      isTrashed: false,
      isStarred: false,
      fileId: 'mock-file-' + Date.now() // Let users preview the extracted files
    };
    saveItems([...items, extractedItem]);
  };

  // Upload zones
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

  // Direct Client-side Upload with Presigned URL
  const handleUpload = async (file: File) => {
    setAppError('');
    setUploading(true);
    setUploadProgress(0);
    setCurrentUploadingName(file.name);

    try {
      // 1. Get presigned URL
      const { data: presignData } = await axios.post('/api/get-upload-url', {
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size
      });

      const { uploadUrl, uniqueKey, b2AccountEmail, b2BucketName } = presignData;

      // 2. Upload file directly to B2
      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      // 3. Save metadata to backend
      const { data: res } = await axios.post('/api/save-metadata', {
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        uniqueKey,
        b2AccountEmail,
        b2BucketName,
        parentId: currentFolderId,
        ownerEmail: user ? user.email : 'anonymous'
      });

      setUploading(false);
      setUploadProgress(0);
      setCurrentUploadingName('');

      const uploadedItem: StorageItem = {
        id: res.metadata.fileId,
        name: res.metadata.fileName,
        type: 'file',
        size: res.metadata.fileSize,
        uploadDate: res.metadata.uploadDate,
        parentId: currentFolderId,
        isTrashed: false,
        fileId: res.metadata.fileId,
        isStarred: false,
        thumbnailUrl: res.metadata.thumbnailUrl || null
      };

      const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i);
      if (isVideo) {
        generateVideoThumbnail(file)
          .then(async (base64Thumb) => {
            uploadedItem.thumbnailUrl = base64Thumb;
            saveItems([...items, uploadedItem]);

            // Send to backend silently
            try {
              await fetch(`/api/file/${res.metadata.fileId}/thumbnail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ thumbnailUrl: base64Thumb })
              });
            } catch (err) {
              console.warn('Failed to save generated video thumbnail to database:', err);
            }
          })
          .catch((err) => {
            console.warn('Failed to generate local video thumbnail, relying on background processor:', err);
            saveItems([...items, uploadedItem]);
          });
      } else {
        saveItems([...items, uploadedItem]);
      }
    } catch (error: any) {
      setUploading(false);
      setUploadProgress(0);
      setCurrentUploadingName('');
      setAppError(
        error.response?.data?.error || 
        error.message || 
        'Direct upload failed'
      );
    }
  };

  const downloadFile = (fileId: string) => {
    window.location.href = `/api/download/${fileId}`;
  };

  const triggerOpenShareModal = (item: StorageItem) => {
    setShareLinkItem(item);
    setCopiedShareLink(false);
    setActiveMenuId(null);
  };

  const copyShareLink = () => {
    if (!shareLinkItem) return;
    const link = `${window.location.origin}/share/${shareLinkItem.fileId || shareLinkItem.id}`;
    navigator.clipboard.writeText(link);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  };

  // Breadcrumbs
  const getBreadcrumbs = () => {
    const trail: { id: string | null; name: string }[] = [{ id: null, name: 'Root' }];
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

  // Formatting specific file indicators
  const getFileFormatStyles = (name: string = '') => {
    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    if (ext.match(/(mp4|mov|avi|mkv|webm)/)) {
      return { icon: FileVideo, bg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
    }
    if (ext.match(/(mp3|wav|m4a|aac|ogg)/)) {
      return { icon: Music, bg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' };
    }
    if (ext.match(/(zip|rar|7z|tar|gz)/)) {
      return { icon: FileArchive, bg: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' };
    }
    if (ext.match(/(png|jpg|jpeg|gif|webp|svg)/)) {
      return { icon: ImageIcon, bg: 'bg-sky-500/10 text-sky-400 border border-sky-500/20' };
    }
    if (ext === 'pdf') {
      return { icon: FileText, bg: 'bg-red-500/10 text-red-400 border border-red-500/20' };
    }
    if (ext.match(/(doc|docx)/)) {
      return { icon: FileText, bg: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' };
    }
    if (ext.match(/(xls|xlsx|csv)/)) {
      return { icon: FileText, bg: 'bg-teal-500/10 text-teal-400 border border-teal-500/20' };
    }
    if (ext === 'apk') {
      return { icon: FileIcon, bg: 'bg-lime-500/10 text-lime-400 border border-lime-500/20' };
    }
    if (ext.match(/(txt|md|json|js|ts|html|css)/)) {
      return { icon: FileText, bg: 'bg-slate-500/10 text-slate-400 border border-white/10' };
    }
    return { icon: FileIcon, bg: 'bg-violet-500/10 text-violet-400 border border-violet-500/20' };
  };

  // Calculated and Filtered lists
  const filteredViewItems = items.filter(item => {
    if (!item || !item.id || !item.name || item.name === 'Untitled File' || item.id === 'undefined') return false;
    const isMatchedTrash = activeTab === 'trash' ? item.isTrashed : !item.isTrashed;
    
    // Tab filtering
    if (activeTab === 'starred' && !item.isStarred) return false;
    
    // Root / Parent folder restriction
    const isMatchedFolder = activeTab === 'trash' || activeTab === 'starred' || activeTab === 'recent' || item.parentId === currentFolderId;
    
    // Search query matches
    const isMatchedSearch = searchQuery
      ? item.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    // Type filter rail
    if (selectedFormatFilter === 'folders' && item.type !== 'folder') return false;
    if (selectedFormatFilter === 'video' && (!item.name.match(/\.(mp4|mov|mkv|avi|webm)$/i) || item.type === 'folder')) return false;
    if (selectedFormatFilter === 'audio' && (!item.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i) || item.type === 'folder')) return false;
    if (selectedFormatFilter === 'archives' && (!item.name.match(/\.(zip|rar|7z|tar|gz)$/i) || item.type === 'folder')) return false;
    if (selectedFormatFilter === 'docs' && (!item.name.match(/\.(txt|md|json|pdf|docx)$/i) || item.type === 'folder')) return false;

    return isMatchedTrash && isMatchedFolder && isMatchedSearch;
  });

  // Recent files sorted by date
  const finalItemsToRender = activeTab === 'recent' 
    ? [...filteredViewItems].filter(i => i.type === 'file').sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()).slice(0, 12)
    : filteredViewItems;

  const totalFilesSize = items.reduce((acc, curr) => acc + (curr.type === 'file' ? curr.size : 0), 0);
  const totalFoldersCount = items.filter(i => i.type === 'folder' && !i.isTrashed).length;
  const totalFilesCount = items.filter(i => i.type === 'file' && !i.isTrashed).length;

  // Render Shared File Page if requested via share link
  if (sharedFileId) {
    return (
      <SharedFilePage
        fileId={sharedFileId}
        onClose={() => {
          setSharedFileId(null);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  // Render Authentication and Landing UI if not logged in
  if (!user) {
    return (
      <LandingPage
        onAuthSuccess={handleAuthSuccess}
        authLoading={authLoading}
        authError={authError}
        setAuthError={setAuthError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex font-sans overflow-hidden select-none">
      
      {/* Sidebar navigation component */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setCurrentFolderId={setCurrentFolderId}
        isMobileSidebarOpen={isMobileSidebarOpen}
        setIsMobileSidebarOpen={setIsMobileSidebarOpen}
        totalFilesSize={totalFilesSize}
        totalFoldersCount={totalFoldersCount}
        totalFilesCount={totalFilesCount}
        onLogOut={handleLogOut}
      />

      {/* Main Panel Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0d1117] relative">
        {/* Glow Background */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#0095ff]/5 rounded-full blur-[130px] pointer-events-none" />

        {/* Global Toolbar Header */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 md:px-10 z-20 bg-[#0d1117]/40 backdrop-blur-md sticky top-0">
          <div className="flex items-center gap-4">
            {/* Hamburger trigger for mobile sidebar drawer */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 bg-slate-900 border border-white/5 hover:bg-slate-800 rounded-xl text-slate-300 hover:text-white md:hidden cursor-pointer transition-colors"
              title="Open Navigation Drawer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Navigation Trails */}
            {activeTab === 'files' ? (
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-400 overflow-x-auto whitespace-nowrap py-1">
                {getBreadcrumbs().map((crumb, idx, arr) => (
                  <React.Fragment key={`${crumb.id || 'root'}-${idx}`}>
                    <button
                      onClick={() => setCurrentFolderId(crumb.id)}
                      className="hover:text-[#0095ff] font-medium cursor-pointer transition-colors"
                    >
                      {crumb.name}
                    </button>
                    {idx < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight uppercase font-display bg-gradient-to-r from-[#0095ff] to-cyan-400 bg-clip-text text-transparent">
                {activeTab === 'trash' ? 'Recycle Bin' : activeTab === 'starred' ? 'Starred elements' : activeTab === 'recent' ? 'Recent Backups' : 'My Account Settings'}
              </h1>
            )}
          </div>

          {/* Centered Floating Brand Identifier */}
          <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0095ff] shadow-[0_0_6px_rgba(0,149,255,0.8)]" />
            <span className="text-[10px] font-bold text-slate-300 tracking-wider font-mono">ROOT HAVEN</span>
          </div>

          {/* Server Sync Indicator & Avatar */}
          <div className="flex items-center gap-4">
            <div className="bg-slate-900/60 border border-white/5 px-3 sm:px-4 py-1.5 rounded-full flex items-center gap-2 text-[10px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden xs:inline font-semibold">Active Server: Railway</span>
              <span className="xs:hidden font-semibold">Synced</span>
            </div>
            
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border border-white/10 flex items-center justify-center font-bold text-xs text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Dashboard Workspace */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-6 sm:space-y-8 z-10 relative">
          
          {/* App-level alerts */}
          {appError && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl flex items-center justify-between gap-3 animate-fade-in-up">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-xs font-semibold">{appError}</span>
              </div>
              <button onClick={() => setAppError('')} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tab 1: Files Manager (Primary Explore Workspace) */}
          {activeTab === 'files' && (
            <>
              {/* Toolbar Settings & Actions row */}
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                
                {/* Search Bar pill inputs */}
                <div className="w-full md:max-w-md relative">
                  <input
                    type="text"
                    placeholder="Search in this folder..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-[54px] bg-[#161b22]/70 border border-white/5 rounded-2xl py-2.5 pl-12 pr-4 text-xs focus:outline-none focus:border-[#0095ff] text-white placeholder-slate-500"
                  />
                  <Search className="w-4.5 h-4.5 text-slate-500 absolute left-4.5 top-[16px]" />
                </div>
              </div>

              {/* Uploading Status Overlay card */}
              <AnimatePresence>
                {uploading && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 150 }}
                    className="relative bg-gradient-to-br from-[#161b22] to-[#1e2530] border border-white/10 p-5 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col gap-3 w-full"
                  >
                    {/* Glowing background accent */}
                    <div className="absolute top-0 left-0 w-32 h-32 bg-[#0095ff]/5 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="flex items-center gap-4 relative z-10">
                      {/* Animated Upload Icon Box */}
                      <div className="relative w-12 h-12 bg-[#0095ff]/10 rounded-2xl flex items-center justify-center border border-[#0095ff]/20 overflow-hidden flex-shrink-0">
                        {/* Pulse Ring */}
                        <motion.div 
                          className="absolute inset-0 bg-[#0095ff]/10 rounded-2xl"
                          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        />
                        {/* Floating File/Upload Icon */}
                        <motion.div
                          animate={{ y: [-2, 2, -2] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                          className="text-[#0095ff]"
                        >
                          <UploadCloud className="w-6 h-6" />
                        </motion.div>
                      </div>

                      {/* File Details & Status */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-400 font-mono tracking-wide uppercase">
                            Uploading your file...
                          </span>
                          <span className="text-sm font-black text-[#0095ff] font-mono">
                            {uploadProgress}%
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate mt-0.5 max-w-[280px] sm:max-w-[400px]">
                          {currentUploadingName}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="relative w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-white/5 p-[1px] z-10">
                      <motion.div 
                        className="h-full rounded-full bg-gradient-to-r from-[#0095ff] via-cyan-400 to-[#0095ff] shadow-[0_0_8px_rgba(0,149,255,0.6)]"
                        initial={{ width: '0%' }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ ease: "easeOut", duration: 0.3 }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hidden File Input for Triggering Upload via Floating Action Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={onFileSelect}
                className="hidden"
              />

              {/* Back Folder Navigation Arrow */}
              {currentFolderId && (
                <button
                  onClick={() => {
                    const currentFolder = items.find(i => i.id === currentFolderId);
                    setCurrentFolderId(currentFolder ? currentFolder.parentId : null);
                  }}
                  className="p-1.5 hover:bg-white/5 rounded-xl text-red-500 hover:text-red-400 transition-all duration-200 cursor-pointer active:scale-95"
                  title="Go back"
                >
                  <CornerUpLeft className="w-5.5 h-5.5" />
                </button>
              )}

              {/* Grid / List Layout toggle buttons */}
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="font-display font-semibold text-sm text-white">Active Explorer Partition</h3>
                
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-[#161b22] text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Grid Layout"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-[#161b22] text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    title="List Layout"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Bento Grid layout items rendering */}
              {finalItemsToRender.length === 0 ? (
                <div className="bg-[#161b22]/30 border border-white/5 rounded-3xl p-16 text-center space-y-4">
                  <div className="w-16 h-16 bg-[#161b22] border border-white/5 rounded-2xl flex items-center justify-center mx-auto text-slate-500">
                    <Folder className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold text-white">Workspace Empty</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Create a folder or drop files into this cloud partition to synchronize.</p>
                  </div>
                </div>
              ) : viewMode === 'grid' ? (
                // 1. GRID LAYOUT (BENTO GRID STYLE) - 2 CARDS PER LINE
                <div className="grid grid-cols-2 gap-4">
                  {finalItemsToRender.map((item) => {
                    const isFolder = item.type === 'folder';
                    const formatDetails = getFileFormatStyles(item.name);
                    const CardIcon = isFolder ? Folder : formatDetails.icon;

                    return (
                      <div
                        key={item.id}
                        onDoubleClick={() => {
                          if (isFolder) setCurrentFolderId(item.id);
                        }}
                        className={`bg-[#161b22]/80 border rounded-3xl p-5 flex flex-col justify-between aspect-square hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer relative select-none
                          ${isFolder ? 'border-white/5 hover:border-[#0095ff]/30' : 'border-white/5 hover:border-slate-800'}`}
                      >
                        {/* Upper row: icon and three-dots */}
                        <div className="flex items-start justify-between">
                          {item.thumbnailUrl ? (
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden border border-white/10 bg-slate-900/40 flex items-center justify-center relative group-hover:scale-105 transition-transform duration-300 shadow-inner">
                              <div className="absolute inset-0 bg-white/5 animate-pulse" />
                              <img 
                                src={item.thumbnailUrl} 
                                alt={item.name}
                                className="w-full h-full object-cover relative z-10 transition-opacity duration-500"
                                style={{ opacity: 0 }}
                                onLoad={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                }}
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : item.name?.match(/\.(mp3|wav|m4a|aac|ogg)$/i) ? (
                            <div 
                              onClick={() => { if (isFolder) setCurrentFolderId(item.id); }}
                              className="p-3 rounded-2xl transition-transform group-hover:scale-105 duration-300 flex-shrink-0 bg-amber-500/10 text-amber-400 border border-amber-500/20 flex flex-col items-center justify-center"
                            >
                              <CardIcon className="w-5 h-5 animate-pulse" />
                              <div className="flex items-end gap-0.5 h-2.5 mt-1.5 justify-center">
                                <span className="w-0.5 bg-amber-400 rounded-full animate-bounce h-1.5" style={{ animationDelay: '0.1s' }} />
                                <span className="w-0.5 bg-amber-400 rounded-full animate-bounce h-2.5" style={{ animationDelay: '0.3s' }} />
                                <span className="w-0.5 bg-amber-400 rounded-full animate-bounce h-1" style={{ animationDelay: '0.5s' }} />
                                <span className="w-0.5 bg-amber-400 rounded-full animate-bounce h-2" style={{ animationDelay: '0.2s' }} />
                              </div>
                            </div>
                          ) : (
                            <div 
                              onClick={() => { if (isFolder) setCurrentFolderId(item.id); }}
                              className={`p-3 rounded-2xl transition-transform group-hover:scale-105 duration-300 flex-shrink-0
                                ${isFolder ? 'bg-[#0095ff]/10 text-[#0095ff] border border-[#0095ff]/20' : formatDetails.bg}`}
                            >
                              <CardIcon className="w-5 h-5" />
                            </div>
                          )}

                          {/* Float Menu Toggle */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === item.id ? null : item.id);
                              }}
                              className="p-1.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                            >
                              <MoreVertical className="w-4.5 h-4.5" />
                            </button>

                            {/* Actions Dropdown context menu overlay */}
                            {activeMenuId === item.id && (
                              <div className="absolute right-0 mt-2 w-48 bg-[#161b22] border border-white/10 rounded-2xl p-2 shadow-2xl z-30 divide-y divide-white/5">
                                <div className="py-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleToggleStar(item.id); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                  >
                                    <Star className={`w-3.5 h-3.5 ${item.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-slate-400'}`} />
                                    <span>{item.isStarred ? 'Unstar Element' : 'Star Element'}</span>
                                  </button>

                                  {!isFolder && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); triggerOpenShareModal(item); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Create Share Link</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={(e) => { e.stopPropagation(); setItemToMove(item); setIsMoveModalOpen(true); setActiveMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                  >
                                    <Move className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Move Location</span>
                                  </button>
                                </div>

                                <div className="py-1 pt-1">
                                  {!isFolder && item.fileId && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); downloadFile(item.fileId!); setActiveMenuId(null); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                    >
                                      <Download className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Download Original</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleTrashItem(item.id); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Move to Trash</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Text and size statistics */}
                        <div className="mt-6 text-left" onClick={() => { if (isFolder) { setCurrentFolderId(item.id); } else { setPreviewItem(item); } }}>
                          <p className="text-sm font-semibold text-white truncate group-hover:text-[#0095ff] transition-colors">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-mono text-slate-500 font-semibold uppercase">
                              {isFolder ? 'Folder node' : 'File backup'}
                            </span>
                            {!isFolder && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {item.size > 1000000 ? `${(item.size/1000000).toFixed(1)} MB` : `${(item.size/1024).toFixed(0)} KB`}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Star marker indicator overlay */}
                        {item.isStarred && (
                          <div className="absolute top-2.5 left-2.5">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 drop-shadow" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // 2. LIST LAYOUT
                <div className="bg-[#161b22]/50 border border-white/5 rounded-3xl divide-y divide-white/5">
                  {finalItemsToRender.map((item) => {
                    const isFolder = item.type === 'folder';
                    const formatDetails = getFileFormatStyles(item.name);
                    const CardIcon = isFolder ? Folder : formatDetails.icon;

                    return (
                      <div
                        key={item.id}
                        onClick={() => { if (isFolder) { setCurrentFolderId(item.id); } else { setPreviewItem(item); } }}
                        className="p-4 hover:bg-white/5 transition-all flex items-center justify-between gap-4 cursor-pointer group first:rounded-t-[22px] last:rounded-b-[22px]"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          {item.thumbnailUrl ? (
                            <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10 bg-slate-900/40 flex items-center justify-center relative flex-shrink-0">
                              <div className="absolute inset-0 bg-white/5 animate-pulse" />
                              <img 
                                src={item.thumbnailUrl} 
                                alt={item.name}
                                className="w-full h-full object-cover relative z-10 transition-opacity duration-300"
                                style={{ opacity: 0 }}
                                onLoad={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                }}
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : item.name?.match(/\.(mp3|wav|m4a|aac|ogg)$/i) ? (
                            <div className="w-9 h-9 p-2 rounded-xl flex-shrink-0 bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                              <CardIcon className="w-4.5 h-4.5 animate-pulse" />
                            </div>
                          ) : (
                            <div className={`p-2.5 rounded-xl flex-shrink-0 ${isFolder ? 'bg-[#0095ff]/10 text-[#0095ff]' : formatDetails.bg}`}>
                              <CardIcon className="w-4.5 h-4.5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold text-white truncate group-hover:text-[#0095ff] transition-colors">
                                {item.name}
                              </p>
                              {item.isStarred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Added {new Date(item.uploadDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[10px] font-mono text-slate-400">
                            {isFolder ? '--' : item.size > 1000000 ? `${(item.size/1000000).toFixed(1)} MB` : `${(item.size/1024).toFixed(0)} KB`}
                          </span>

                          {/* 3-dot context menu option toggle */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === item.id ? null : item.id);
                              }}
                              className="p-1.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Actions Dropdown context menu overlay */}
                            {activeMenuId === item.id && (
                              <div className="absolute right-0 mt-2 w-48 bg-[#161b22] border border-white/10 rounded-2xl p-2 shadow-2xl z-30 divide-y divide-white/5 text-left">
                                <div className="py-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleToggleStar(item.id); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                  >
                                    <Star className={`w-3.5 h-3.5 ${item.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-slate-400'}`} />
                                    <span>{item.isStarred ? 'Unstar Element' : 'Star Element'}</span>
                                  </button>

                                  {!isFolder && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); triggerOpenShareModal(item); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Create Share Link</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={(e) => { e.stopPropagation(); setItemToMove(item); setIsMoveModalOpen(true); setActiveMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                  >
                                    <Move className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Move Location</span>
                                  </button>
                                </div>

                                <div className="py-1 pt-1">
                                  {!isFolder && item.fileId && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); downloadFile(item.fileId!); setActiveMenuId(null); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 rounded-xl hover:text-white"
                                    >
                                      <Download className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Download Original</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleTrashItem(item.id); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Move to Trash</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Tab 2: Recent and Starred Tabs */}
          {(activeTab === 'starred' || activeTab === 'recent') && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="font-display font-semibold text-sm text-white">
                  {activeTab === 'starred' ? 'Your Starred Elements' : 'Recent Upload History'}
                </h3>
                <span className="text-xs font-mono text-slate-400">{finalItemsToRender.length} element(s)</span>
              </div>

              {finalItemsToRender.length === 0 ? (
                <div className="bg-[#161b22]/30 border border-white/5 rounded-3xl p-16 text-center space-y-4">
                  <div className="w-16 h-16 bg-[#161b22] border border-white/5 rounded-2xl flex items-center justify-center mx-auto text-slate-500">
                    <Star className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold text-white">No items found</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Items you star or upload recently will populate this fast-access list.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-[#161b22]/50 border border-white/5 rounded-3xl overflow-hidden divide-y divide-white/5">
                  {finalItemsToRender.map((item) => {
                    const isFolder = item.type === 'folder';
                    const formatDetails = getFileFormatStyles(item.name);
                    const CardIcon = isFolder ? Folder : formatDetails.icon;

                    return (
                      <div
                        key={item.id}
                        onClick={() => { if (!isFolder) setPreviewItem(item); }}
                        className="p-4 hover:bg-white/5 transition-all flex items-center justify-between gap-4 cursor-pointer group"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`p-2.5 rounded-xl ${isFolder ? 'bg-[#0095ff]/10 text-[#0095ff]' : formatDetails.bg}`}>
                            <CardIcon className="w-4.5 h-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Originally added {new Date(item.uploadDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleStar(item.id)}
                            className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"
                          >
                            <Star className={`w-4 h-4 ${item.isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-slate-500'}`} />
                          </button>
                          
                          {!isFolder && item.fileId && (
                            <button
                              onClick={() => downloadFile(item.fileId!)}
                              className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Recycle Trash */}
          {activeTab === 'trash' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="bg-[#161b22]/50 border border-white/5 rounded-3xl overflow-hidden">
                <div className="px-8 py-4 border-b border-white/5 bg-slate-900/40 flex items-center justify-between">
                  <h3 className="font-display font-semibold text-sm text-white">Recycle Bin</h3>
                  <span className="text-xs text-slate-400">Items are stored securely here for recovery</span>
                </div>

                <div className="divide-y divide-white/5">
                  {filteredViewItems.length === 0 ? (
                    <div className="p-16 text-center space-y-4">
                      <div className="w-16 h-16 bg-[#161b22] border border-white/5 rounded-2xl flex items-center justify-center mx-auto text-slate-500">
                        <Trash2 className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="font-display font-semibold text-white">Recycle Bin is empty</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">When elements are deleted, they are temporarily retained here for restoration.</p>
                      </div>
                    </div>
                  ) : (
                    filteredViewItems.map((item) => (
                      <div
                        key={item.id}
                        className="px-6 py-4 hover:bg-white/5 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl flex-shrink-0 border border-rose-500/20">
                            {item.type === 'folder' ? <Folder className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                            <span className="text-[10px] text-slate-500 block">
                              Originally uploaded {new Date(item.uploadDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleRestoreItem(item.id)}
                            className="px-4 py-2 bg-[#0095ff]/10 hover:bg-[#0095ff] text-[#0095ff] hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                          >
                            Restore Element
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(item.id)}
                            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                          >
                            Delete Permanently
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: My Account Settings page */}
          {activeTab === 'account' && (
            <div className="max-w-2xl mx-auto bg-[#161b22]/50 border border-white/5 rounded-3xl p-6 sm:p-8 space-y-6 animate-fade-in-up">
              <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-white/5">
                <div className="w-20 h-20 bg-gradient-to-tr from-indigo-500 to-[#0095ff] rounded-full flex items-center justify-center text-3xl font-bold text-white border-2 border-white/10 shadow-xl">
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-center sm:text-left space-y-1">
                  <h3 className="font-display font-semibold text-lg text-white">Account Settings</h3>
                  <p className="text-xs text-slate-500">Update your profile information and manage your password securely.</p>
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6">
                {profileSuccessMsg && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-400 font-semibold">
                    {profileSuccessMsg}
                  </div>
                )}
                {profileErrorMsg && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-400 font-semibold">
                    {profileErrorMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-[#0d1117]/80 border border-white/5 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-[#0095ff] text-white transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
                    <input
                      type="email"
                      required
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="w-full bg-[#0d1117]/80 border border-white/5 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-[#0095ff] text-white transition-all"
                    />
                  </div>
                </div>

                <div className="border-t border-white/5 pt-6 space-y-4">
                  <h4 className="font-display font-semibold text-sm text-white">Reset Password</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">New Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-[#0d1117]/80 border border-white/5 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-[#0095ff] text-white transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Confirm New Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#0d1117]/80 border border-white/5 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-[#0095ff] text-white transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="bg-[#0095ff] hover:bg-sky-500 text-white font-bold py-3.5 px-6 rounded-2xl text-xs transition-colors cursor-pointer shadow-lg shadow-[#0095ff]/15"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </main>

      {/* MODAL 1: Create Folder */}
      {isNewFolderModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b22] border border-white/10 rounded-3xl w-full max-w-sm p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-semibold text-white">Create Folder</h3>
              <button 
                onClick={() => { setIsNewFolderModalOpen(false); setNewFolderName(''); }}
                className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase block">Folder Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Cinematic Tracks, PDFs"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-[#0d1117] border border-white/10 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-[#0095ff] text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsNewFolderModalOpen(false); setNewFolderName(''); }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3.5 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0095ff] hover:bg-sky-500 text-white font-bold py-3.5 px-4 rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-[#0095ff]/15"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Move Location */}
      {isMoveModalOpen && itemToMove && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b22] border border-white/10 rounded-3xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-semibold text-white">Move Location</h3>
                <p className="text-[11px] text-slate-400 mt-1 truncate max-w-xs">Relocate "{itemToMove.name}" to another sub-node</p>
              </div>
              <button 
                onClick={() => { setIsMoveModalOpen(false); setItemToMove(null); }}
                className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Destination Folder</p>
              
              <div className="bg-[#0d1117] border border-white/5 rounded-2xl divide-y divide-white/5 max-h-60 overflow-y-auto">
                {/* Home Option */}
                <div
                  onClick={() => handleMoveItem(null)}
                  className="p-4 hover:bg-white/5 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-white">Root Drive Location</span>
                  </div>
                  {itemToMove.parentId === null && <Check className="w-4 h-4 text-[#0095ff]" />}
                </div>

                {/* Sub-Folders listing */}
                {items
                  .filter(item => item.type === 'folder' && !item.isTrashed && item.id !== itemToMove.id)
                  .map((folder, idx) => (
                    <div
                      key={`${folder.id}-${idx}`}
                      onClick={() => handleMoveItem(folder.id)}
                      className="p-4 hover:bg-white/5 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Folder className="w-4 h-4 text-[#0095ff]" />
                        <span className="text-xs font-semibold text-white">{folder.name}</span>
                      </div>
                      {itemToMove.parentId === folder.id && <Check className="w-4 h-4 text-[#0095ff]" />}
                    </div>
                  ))}
              </div>

              <button
                onClick={() => { setIsMoveModalOpen(false); setItemToMove(null); }}
                className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-semibold py-3 px-4 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel Location Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: File Previewer with ZIP Extractor built-in */}
      {previewItem && (
        <FilePreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onExtractSimulated={handleExtractSimulated}
        />
      )}

      {/* MODAL 4: Share Link Dialog */}
      {shareLinkItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b22] border border-white/10 rounded-3xl w-full max-w-sm p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-semibold text-white">Share Secure Link</h3>
              <button 
                onClick={() => setShareLinkItem(null)}
                className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Copy and share this direct URL token for fast-stream downloads. Token bypasses node authorization boundaries safely.
              </p>

              <div className="bg-[#0d1117] border border-white/5 p-3.5 rounded-2xl break-all select-all font-mono text-[10px] text-slate-300">
                {`${window.location.origin}/share/${shareLinkItem.fileId || shareLinkItem.id}`}
              </div>

              <button
                onClick={copyShareLink}
                className="w-full py-3 bg-[#0095ff] hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
              >
                {copiedShareLink ? 'Link Copied!' : 'Copy Share Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Create Text File */}
      {isNewTextFileModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#161b22] border border-white/10 rounded-3xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-semibold text-white text-base">New Text File</h3>
              <button 
                onClick={() => { setIsNewTextFileModalOpen(false); setNewTextFileName(''); setNewTextFileContent(''); }}
                className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTextFile} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase block">File Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. notes.txt"
                  value={newTextFileName}
                  onChange={(e) => setNewTextFileName(e.target.value)}
                  className="w-full bg-[#0d1117] border border-white/10 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-[#0095ff] text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase block">Content</label>
                <textarea
                  placeholder="Type your file content here..."
                  value={newTextFileContent}
                  onChange={(e) => setNewTextFileContent(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0d1117] border border-white/10 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-[#0095ff] text-white resize-none font-mono"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsNewTextFileModalOpen(false); setNewTextFileName(''); setNewTextFileContent(''); }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3.5 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0095ff] hover:bg-sky-500 text-white font-bold py-3.5 px-4 rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-[#0095ff]/15"
                >
                  Create File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) inside the bottom-right corner */}
      {user && activeTab === 'files' && (
        <div className="fixed bottom-8 right-8 z-50">
          {/* Transparent Backdrop overlay to close when clicking outside */}
          {isFabOpen && (
            <div 
              className="fixed inset-0 z-40 bg-transparent cursor-default" 
              onClick={() => setIsFabOpen(false)}
            />
          )}

          {/* Popover Menu options */}
          {isFabOpen && (
            <div className="absolute bottom-16 right-0 mb-3 w-48 bg-[#161b22]/95 border border-white/10 rounded-2xl p-2 shadow-2xl space-y-1 z-50 backdrop-blur-md animate-fade-in-up">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setIsFabOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left"
              >
                <UploadCloud className="w-4 h-4 text-[#0095ff]" />
                <span>Upload file</span>
              </button>

              <button
                onClick={() => {
                  setIsNewFolderModalOpen(true);
                  setIsFabOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left"
              >
                <FolderPlus className="w-4 h-4 text-[#0095ff]" />
                <span>New folder</span>
              </button>

              <button
                onClick={() => {
                  setIsNewTextFileModalOpen(true);
                  setIsFabOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left"
              >
                <FileText className="w-4 h-4 text-[#0095ff]" />
                <span>New text file</span>
              </button>
            </div>
          )}

          {/* Actual Trigger Button with rotating Plus icon */}
          <button
            onClick={() => setIsFabOpen(!isFabOpen)}
            className={`w-14 h-14 bg-gradient-to-r from-[#0095ff] to-cyan-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-[#0095ff]/35 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer z-50 relative`}
            title="Add Item"
          >
            <Plus className={`w-7 h-7 transition-transform duration-300 ${isFabOpen ? 'rotate-45' : 'rotate-0'}`} />
          </button>
        </div>
      )}

    </div>
  );
}
