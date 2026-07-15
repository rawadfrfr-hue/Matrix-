/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StorageItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number; // in bytes
  uploadDate: string;
  parentId: string | null;
  isTrashed: boolean;
  fileId?: string;
  isStarred?: boolean;
  thumbnailUrl?: string | null;
}

export type ActiveTab = 'files' | 'recent' | 'starred' | 'trash' | 'account';
export type ViewMode = 'grid' | 'list';

export interface StorageProvider {
  id: string;
  provider: 'b2' | 'r2' | 'mega';
  name: string;
}
