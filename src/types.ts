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
}

export type ActiveTab = 'files' | 'recent' | 'starred' | 'trash' | 'account';
export type ViewMode = 'grid' | 'list';
