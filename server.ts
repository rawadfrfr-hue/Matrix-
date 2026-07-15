import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert as adminCert } from 'firebase-admin/app';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { initializeApp as initClientApp } from 'firebase/app';
import { getDatabase as getClientDatabase, ref as dbRef, set as dbSet, get as dbGet, remove as dbRemove } from 'firebase/database';
import cors from 'cors';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Storage, File } from 'megajs';

// Interface for Storage Accounts configured in process.env.STORAGE_ACCOUNTS_JSON or B2_ACCOUNTS_JSON
export interface StorageAccount {
  provider: 'b2' | 'r2' | 'mega';
  email: string;
  bucket: string;
  keyId: string;
  appKey: string;
  endpoint: string;
  region: string;
}

let storageAccounts: StorageAccount[] = [];
const usedSpaceMap: Record<string, number> = {}; // email -> bytes

// Limit defined by user: 9.5 GB
const FREE_TIER_LIMIT = 9.5 * 1024 * 1024 * 1024; 

let dbClient: any = null;
let discoveredDatabaseURL = "";

async function discoverDatabaseUrl(projectId: string): Promise<string> {
  const { FIREBASE_DATABASE_URL } = process.env;
  if (FIREBASE_DATABASE_URL) {
    return FIREBASE_DATABASE_URL;
  }
  
  const candidates = [
    `https://${projectId}-default-rtdb.firebaseio.com`,
    `https://${projectId}.firebaseio.com`,
    `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`,
    `https://${projectId}.europe-west1.firebasedatabase.app`,
    `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`,
    `https://${projectId}.asia-southeast1.firebasedatabase.app`
  ];

  for (const url of candidates) {
    try {
      const response = await axios.get(`${url}/.json`, { timeout: 3000 });
      console.log(`[Firebase Discovery] Successfully connected to: ${url} (Status: ${response.status})`);
      return url;
    } catch (err: any) {
      if (err.response && (err.response.status === 401 || err.response.status === 403 || err.response.status === 200)) {
        console.log(`[Firebase Discovery] Found valid database URL: ${url} (Status: ${err.response.status})`);
        return url;
      }
      console.log(`[Firebase Discovery] Candidate ${url} not reachable: ${err.message}`);
    }
  }

  return `https://${projectId}-default-rtdb.firebaseio.com`;
}

function getDb() {
  if (dbClient) return dbClient;
  
  const { 
    FIREBASE_PROJECT_ID, 
    FIREBASE_CLIENT_EMAIL, 
    FIREBASE_PRIVATE_KEY, 
    FIREBASE_DATABASE_URL,
    FIREBASE_API_KEY
  } = process.env;

  // If service account credentials are provided, use firebase-admin
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY && FIREBASE_DATABASE_URL) {
    try {
      if (!getAdminApps().length) {
        initAdminApp({
          credential: adminCert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
          databaseURL: FIREBASE_DATABASE_URL,
        });
      }
      dbClient = getAdminDatabase();
      console.log('Firebase initialized using Admin SDK.');
      return dbClient;
    } catch (err) {
      console.warn('Failed to initialize Admin SDK, falling back to Client SDK:', err);
    }
  }

  // Fallback to client config using the user's provided Firebase config
  const projectId = FIREBASE_PROJECT_ID || "zetta-cloud-79576";
  const apiKey = FIREBASE_API_KEY || "AIzaSyDdOlFojXzAgbpaG-IUvSumtYe3Y1EdKqI";
  const databaseURL = FIREBASE_DATABASE_URL || discoveredDatabaseURL || `https://${projectId}-default-rtdb.firebaseio.com`;

  const firebaseConfig = {
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: `${projectId}.firebasestorage.app`,
    messagingSenderId: "1550730436",
    appId: "1:1550730436:web:b0d748b19f918fed907591",
    databaseURL
  };

  try {
    console.log('Firebase initializing using Client SDK fallback with config:', { projectId, databaseURL });
    const app = initClientApp(firebaseConfig);
    const db = getClientDatabase(app);
    
    // Create an adapter that mimics the Firebase Admin Database interface used in server.ts
    dbClient = {
      ref: (path: string) => {
        return {
          set: async (value: any) => {
            await dbSet(dbRef(db, path), value);
          },
          remove: async () => {
            await dbRemove(dbRef(db, path));
          },
          once: async (event: string) => {
            const snapshot = await dbGet(dbRef(db, path));
            return {
              val: () => snapshot.val()
            };
          }
        };
      }
    };
    return dbClient;
  } catch (err: any) {
    throw new Error(`Failed to initialize Firebase DB: ${err.message}`);
  }
}

function parseStorageAccounts() {
  let accounts: StorageAccount[] = [];
  
  const b2Str = process.env.B2_ACCOUNTS_JSON;
  if (b2Str) {
    try {
      const parsed = JSON.parse(b2Str);
      accounts = accounts.concat(parsed.map((a: any) => ({ ...a, provider: 'b2' })));
    } catch (err: any) {
      console.error("[Storage Config] Failed to parse B2_ACCOUNTS_JSON:", err.message);
    }
  }

  const r2Str = process.env.R2_ACCOUNTS_JSON;
  if (r2Str) {
    try {
      const parsed = JSON.parse(r2Str);
      accounts = accounts.concat(parsed.map((a: any) => ({ ...a, provider: 'r2' })));
    } catch (err: any) {
      console.error("[Storage Config] Failed to parse R2_ACCOUNTS_JSON:", err.message);
    }
  }

  const megaStr = process.env.MEGA_ACCOUNTS_JSON;
  if (megaStr) {
    try {
      const parsed = JSON.parse(megaStr);
      accounts = accounts.concat(parsed.map((a: any) => ({ ...a, provider: 'mega' })));
    } catch (err: any) {
      console.error("[Storage Config] Failed to parse MEGA_ACCOUNTS_JSON:", err.message);
    }
  }

  storageAccounts = accounts;
  console.log(`[Storage Config] Loaded ${storageAccounts.length} storage accounts.`);
  for (const acct of storageAccounts) {
    usedSpaceMap[acct.email] = 0;
  }
}

async function initializeUsedSpace() {
  try {
    const db = getDb();
    const snapshot = await db.ref('/files').once('value');
    const files = snapshot.val() || {};

    // Reset space map values to 0
    for (const acct of storageAccounts) {
      usedSpaceMap[acct.email] = 0;
    }

    Object.values(files).forEach((file: any) => {
      if (file && file.b2AccountEmail && file.fileSize) {
        if (usedSpaceMap[file.b2AccountEmail] !== undefined) {
          usedSpaceMap[file.b2AccountEmail] += Number(file.fileSize);
        } else {
          usedSpaceMap[file.b2AccountEmail] = Number(file.fileSize);
        }
      }
    });

    console.log("[Storage Tracker] In-memory space utilization initialized:", usedSpaceMap);
  } catch (err: any) {
    console.error("[Storage Tracker] Failed to initialize space tracker:", err.message);
  }
}

function selectStorageAccount(fileSize: number, preferredEmail?: string): StorageAccount {
  if (storageAccounts.length === 0) {
    throw new Error("No storage accounts configured in system settings.");
  }
  
  if (preferredEmail) {
    const pref = storageAccounts.find(a => a.email === preferredEmail);
    if (pref) return pref;
  }

  for (const acct of storageAccounts) {
    const currentUsed = usedSpaceMap[acct.email] || 0;
    if (currentUsed + fileSize <= FREE_TIER_LIMIT) {
      return acct;
    }
  }

  throw new Error("Storage Limit Exceeded: No storage account has enough remaining space.");
}

function getS3Client(acct: StorageAccount): S3Client {
  let endpoint = (acct.endpoint || '').trim();
  if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = 'https://' + endpoint;
  }
  return new S3Client({
    endpoint,
    region: acct.region || 'auto',
    forcePathStyle: true, // often needed for B2/R2
    credentials: {
      accessKeyId: acct.keyId,
      secretAccessKey: acct.appKey
    }
  });
}

async function checkUserQuota(ownerEmail: string, fileSize: number): Promise<void> {
  const quotaGb = parseFloat(process.env.STORAGE_QUOTA_GB || '15');
  const maxQuotaBytes = quotaGb * 1024 * 1024 * 1024;

  if (ownerEmail && ownerEmail !== 'anonymous') {
    const db = getDb();
    const filesSnap = await db.ref('/files').once('value');
    const filesVal = filesSnap.val() || {};
    let userUsedSpace = 0;
    Object.values(filesVal).forEach((file: any) => {
      if (file && file.ownerEmail === ownerEmail && file.fileSize) {
        userUsedSpace += Number(file.fileSize);
      }
    });

    if (userUsedSpace + fileSize > maxQuotaBytes) {
      const usedGb = (userUsedSpace / (1024 * 1024 * 1024)).toFixed(2);
      const fileMb = (fileSize / (1024 * 1024)).toFixed(2);
      throw new Error(`Storage Quota Exceeded. You have used ${usedGb} GB out of ${quotaGb} GB. Uploading this file (${fileMb} MB) would exceed your limit.`);
    }
  }
}

async function startServer() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "zetta-cloud-79576";
  try {
    discoveredDatabaseURL = await discoverDatabaseUrl(projectId);
    console.log(`[Firebase Start] Resolved database URL to: ${discoveredDatabaseURL}`);
  } catch (err) {
    console.warn('[Firebase Start] Failed to auto-discover database URL:', err);
  }

  // Parse configuration and load Storage accounts
  parseStorageAccounts();

  // Initialize Used Space Tracking from database on startup
  try {
    await initializeUsedSpace();
  } catch (err: any) {
    console.warn("[Firebase Start] Could not run initial space calculation on launch:", err.message);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  app.post('/api/upload/mega', upload.single('file'), async (req, res) => {
    try {
      const { ownerEmail, parentId, storageAccountId } = req.body;
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file provided" });

      const acct = storageAccounts.find(a => a.email === storageAccountId);
      if (!acct || acct.provider !== 'mega') return res.status(400).json({ error: "Invalid MEGA account" });

      await checkUserQuota(ownerEmail, file.size);

      // Upload to mega
      const megaStorage = await new Storage({ email: acct.keyId, password: acct.appKey, userAgent: 'ZettaCloud' }).ready;
      
      const uploadedFile = await new Promise<any>((resolve, reject) => {
         const megaUpload = megaStorage.upload({ name: file.originalname, size: file.size }, file.buffer);
         megaUpload.on('complete', resolve);
         megaUpload.on('error', reject);
      });

      const link = await uploadedFile.link();

      const fileId = randomUUID();
      const metadata = {
          fileId,
          fileName: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadDate: new Date().toISOString(),
          b2AccountEmail: acct.email,
          b2BucketName: 'mega',
          b2FileId: link,
          parentId: parentId || null,
          ownerEmail: ownerEmail || 'anonymous',
          isTrashed: false,
          isStarred: false,
          thumbnailUrl: null
      };

      const db = getDb();
      await db.ref(`/files/${fileId}`).set(metadata);

      usedSpaceMap[acct.email] = (usedSpaceMap[acct.email] || 0) + file.size;

      res.json({ success: true, metadata });
    } catch (err: any) {
      console.error("MEGA upload error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Multipart initiate route
  app.post('/api/upload/multipart/initiate', async (req, res) => {
    try {
      const { fileName, fileSize, fileType, ownerEmail, storageAccountId } = req.body;
      if (!fileName || fileSize == null) {
        return res.status(400).json({ error: 'Missing file metadata' });
      }

      // Check User Storage Quota
      try {
        await checkUserQuota(ownerEmail, fileSize);
      } catch (quotaErr: any) {
        return res.status(403).json({ error: quotaErr.message });
      }

      // Smart Load Balancer
      let selectedAccount: StorageAccount;
      try {
        selectedAccount = selectStorageAccount(fileSize, storageAccountId);
      } catch (lbErr: any) {
        console.error(`[Upload Load Balancer] Failed to select account: ${lbErr.message}`);
        return res.status(507).json({ error: lbErr.message });
      }

      console.log(`[Multipart Initiate] Selected account ${selectedAccount.email} for file: ${fileName}`);

      const s3 = getS3Client(selectedAccount);
      const uniqueKey = `${Date.now()}-${fileName}`;
      const contentType = fileType || 'application/octet-stream';

      const command = new CreateMultipartUploadCommand({
        Bucket: selectedAccount.bucket,
        Key: uniqueKey,
        ContentType: contentType
      });

      const response = await s3.send(command);
      
      res.json({
        success: true,
        uploadId: response.UploadId,
        key: uniqueKey,
        uploadDetails: {
          b2AccountEmail: selectedAccount.email,
          b2BucketName: selectedAccount.bucket,
          b2FileId: uniqueKey,
          fileName,
          fileSize,
          contentType
        }
      });
    } catch (error: any) {
      console.error('Multipart Initiate error:', error);
      res.status(500).json({ error: error.message || 'Multipart initiate failed' });
    }
  });

  // Multipart presign parts route
  app.post('/api/upload/multipart/presign-parts', async (req, res) => {
    try {
      const { uploadId, key, b2AccountEmail, partNumbers } = req.body;
      if (!uploadId || !key || !b2AccountEmail || !partNumbers || !Array.isArray(partNumbers)) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      const selectedAccount = storageAccounts.find(a => a.email === b2AccountEmail);
      if (!selectedAccount) {
        return res.status(404).json({ error: 'Storage account not found' });
      }

      const s3 = getS3Client(selectedAccount);
      const presignedUrls: Record<number, string> = {};

      for (const partNumber of partNumbers) {
        const command = new UploadPartCommand({
          Bucket: selectedAccount.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber
        });
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        presignedUrls[partNumber] = url;
      }

      res.json({
        success: true,
        presignedUrls
      });
    } catch (error: any) {
      console.error('Multipart Presign Parts error:', error);
      res.status(500).json({ error: error.message || 'Presign parts failed' });
    }
  });

  // Multipart complete route
  app.post('/api/upload/multipart/complete', async (req, res) => {
    try {
      const { uploadId, key, b2AccountEmail, parts, parentId, ownerEmail, uploadDetails } = req.body;
      if (!uploadId || !key || !b2AccountEmail || !parts || !Array.isArray(parts)) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      const selectedAccount = storageAccounts.find(a => a.email === b2AccountEmail);
      if (!selectedAccount) {
        return res.status(404).json({ error: 'Storage account not found' });
      }

      const s3 = getS3Client(selectedAccount);
      const command = new CompleteMultipartUploadCommand({
        Bucket: selectedAccount.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber)
        }
      });

      await s3.send(command);
      console.log(`[Multipart Complete] Successfully completed multipart upload ${key}`);

      const fileId = randomUUID();
      const isImage = (uploadDetails.contentType || '').startsWith('image/') || 
                      uploadDetails.fileName.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
      const thumbnailUrl = isImage ? `/api/download/${fileId}` : null;

      const metadata = {
        fileId,
        fileName: uploadDetails.fileName,
        originalName: uploadDetails.fileName,
        mimeType: uploadDetails.contentType,
        fileSize: uploadDetails.fileSize,
        uploadDate: new Date().toISOString(),
        b2AccountEmail: uploadDetails.b2AccountEmail,
        b2BucketName: uploadDetails.b2BucketName,
        b2FileId: uploadDetails.b2FileId,
        parentId: parentId || null,
        ownerEmail: ownerEmail || 'anonymous',
        isTrashed: false,
        isStarred: false,
        thumbnailUrl
      };

      const db = getDb();
      await db.ref(`/files/${fileId}`).set(metadata);

      usedSpaceMap[uploadDetails.b2AccountEmail] = (usedSpaceMap[uploadDetails.b2AccountEmail] || 0) + uploadDetails.fileSize;
      console.log(`[Storage Tracker] Updated used space for ${uploadDetails.b2AccountEmail} to ${usedSpaceMap[uploadDetails.b2AccountEmail]} bytes`);

      res.json({
        success: true,
        metadata: {
          fileId,
          fileName: uploadDetails.fileName,
          fileSize: uploadDetails.fileSize,
          uploadDate: metadata.uploadDate,
          parentId,
          thumbnailUrl
        }
      });
    } catch (error: any) {
      console.error('Multipart Complete error:', error);
      res.status(500).json({ error: error.message || 'Multipart completion failed' });
    }
  });

  // Multipart abort route
  app.post('/api/upload/multipart/abort', async (req, res) => {
    try {
      const { uploadId, key, b2AccountEmail } = req.body;
      if (!uploadId || !key || !b2AccountEmail) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      const selectedAccount = storageAccounts.find(a => a.email === b2AccountEmail);
      if (!selectedAccount) {
        return res.status(404).json({ error: 'Storage account not found' });
      }

      const s3 = getS3Client(selectedAccount);
      const command = new AbortMultipartUploadCommand({
        Bucket: selectedAccount.bucket,
        Key: key,
        UploadId: uploadId
      });

      await s3.send(command);
      console.log(`[Multipart Abort] Aborted multipart upload ${key}`);
      res.json({ success: true });
    } catch (error: any) {
      console.warn('Multipart Abort error:', error);
      res.status(500).json({ error: error.message || 'Multipart abort failed' });
    }
  });

  // 1a. PRESIGNED URL ROUTE
  app.post('/api/upload/presign', async (req, res) => {
    try {
      const { fileName, fileSize, fileType, ownerEmail, storageAccountId } = req.body;
      if (!fileName || fileSize == null) {
        return res.status(400).json({ error: 'Missing file metadata' });
      }

      // Check User Storage Quota
      try {
        await checkUserQuota(ownerEmail, fileSize);
      } catch (quotaErr: any) {
        return res.status(403).json({ error: quotaErr.message });
      }

      // Smart Load Balancer
      let selectedAccount: StorageAccount;
      try {
        selectedAccount = selectStorageAccount(fileSize, storageAccountId);
      } catch (lbErr: any) {
        console.error(`[Upload Load Balancer] Failed to select account: ${lbErr.message}`);
        return res.status(507).json({ error: lbErr.message });
      }

      console.log(`[Upload Load Balancer] Selected account ${selectedAccount.email} for file: ${fileName}`);

      // AWS SDK S3Client instantiation for B2/R2
      const s3 = getS3Client(selectedAccount);

      // Generate unique name to prevent collisions in the bucket
      const uniqueKey = `${Date.now()}-${fileName}`;
      const contentType = fileType || 'application/octet-stream';

      const command = new PutObjectCommand({
        Bucket: selectedAccount.bucket,
        Key: uniqueKey,
        ContentType: contentType
      });

      // Generate presigned URL valid for 1 hour (3600 seconds)
      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      
      res.json({
        success: true,
        presignedUrl,
        uploadDetails: {
          b2AccountEmail: selectedAccount.email,
          b2BucketName: selectedAccount.bucket,
          b2FileId: uniqueKey,
          fileName,
          fileSize,
          contentType
        }
      });
    } catch (error: any) {
      console.error('Presign error:', error);
      res.status(500).json({ error: error.message || 'Presign failed' });
    }
  });

  // 1b. CONFIRM UPLOAD ROUTE
  app.post('/api/upload/confirm', async (req, res) => {
    try {
      const { uploadDetails, parentId, ownerEmail } = req.body;

      if (!uploadDetails || !uploadDetails.b2FileId) {
        return res.status(400).json({ error: 'Missing upload details' });
      }

      // Generate unique file ID and save metadata to Firebase Database
      const fileId = randomUUID();
      const isImage = (uploadDetails.contentType || '').startsWith('image/') || 
                      uploadDetails.fileName.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
      const thumbnailUrl = isImage ? `/api/download/${fileId}` : null;

      const metadata = {
        fileId,
        fileName: uploadDetails.fileName,
        originalName: uploadDetails.fileName,
        mimeType: uploadDetails.contentType,
        fileSize: uploadDetails.fileSize,
        uploadDate: new Date().toISOString(),
        b2AccountEmail: uploadDetails.b2AccountEmail,
        b2BucketName: uploadDetails.b2BucketName,
        b2FileId: uploadDetails.b2FileId,
        parentId: parentId || null,
        ownerEmail: ownerEmail || 'anonymous',
        isTrashed: false,
        isStarred: false,
        thumbnailUrl
      };

      const db = getDb();
      await db.ref(`/files/${fileId}`).set(metadata);

      // Update in-memory tracker
      usedSpaceMap[uploadDetails.b2AccountEmail] = (usedSpaceMap[uploadDetails.b2AccountEmail] || 0) + uploadDetails.fileSize;
      console.log(`[Storage Tracker] Updated used space for ${uploadDetails.b2AccountEmail} to ${usedSpaceMap[uploadDetails.b2AccountEmail]} bytes`);

      res.json({
        success: true,
        metadata: {
          fileId,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          uploadDate: metadata.uploadDate,
          parentId: metadata.parentId,
          mimeType: metadata.mimeType,
          thumbnailUrl: metadata.thumbnailUrl
        }
      });
    } catch (error: any) {
      console.error('Confirm error:', error);
      res.status(500).json({ error: error.message || 'Confirm failed' });
    }
  });

  // 2. DOWNLOAD HANDLER (Presigned URL Redirection)
  const handleDownload = async (req: express.Request, res: express.Response) => {
    try {
      const fileId = req.params.fileId;
      if (!fileId || fileId.startsWith('preset-') || /[.#$\[\]]/.test(fileId)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const db = getDb();
      const snapshot = await db.ref(`/files/${fileId}`).once('value');
      const metadata = snapshot.val();

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Locate corresponding storage account credentials
      const acct = storageAccounts.find(a => a.email === metadata.b2AccountEmail);
      if (!acct) {
        return res.status(500).json({ error: 'Storage account credentials matching this file are not configured.' });
      }

      if (acct.provider === 'mega') {
        const file = File.fromURL(metadata.b2FileId);
        await file.loadAttributes();
        
        const size = file.size || metadata.fileSize;
        const range = req.headers.range;
        
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const partialstart = parts[0];
          const partialend = parts[1];
      
          const start = parseInt(partialstart, 10);
          const end = partialend ? parseInt(partialend, 10) : size - 1;
          const chunksize = (end - start) + 1;
          
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': metadata.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${encodeURIComponent(metadata.fileName)}"`
          });
          
          const stream = file.download({ start, end });
          stream.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': size,
            'Content-Type': metadata.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${encodeURIComponent(metadata.fileName)}"`
          });
          const stream = file.download({});
          stream.pipe(res);
        }
        return;
      }

      // Instantiate S3 Client for the matching account
      const s3 = getS3Client(acct);

      // Generate GetObject command with proper content disposition
      const command = new GetObjectCommand({
        Bucket: acct.bucket,
        Key: metadata.b2FileId,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(metadata.fileName)}"`
      });

      // Generate presigned URL valid for 1 hour (3600 seconds)
      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      console.log(`[Download B2] Generated presigned URL for ${metadata.fileName} using account: ${acct.email}`);

      // Seamlessly hand off download stream to B2 (Redirect with zero-server-bandwidth)
      res.redirect(presignedUrl);
    } catch (error: any) {
      console.error('Download error:', error);
      res.status(500).json({ error: error.message || 'Download failed' });
    }
  };

  app.get('/api/download/:fileId', handleDownload);
  app.get('/api/file/:fileId', handleDownload);

  // 2b. GET CONFIG ROUTE
  app.get('/api/config', (req, res) => {
    const quotaGb = parseFloat(process.env.STORAGE_QUOTA_GB || '15');
    const projectId = process.env.FIREBASE_PROJECT_ID || "zetta-cloud-79576";
    const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyDdOlFojXzAgbpaG-IUvSumtYe3Y1EdKqI";
    const databaseURL = process.env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`;

    res.json({
      storageQuotaGb: quotaGb,
      storageQuotaBytes: quotaGb * 1024 * 1024 * 1024,
      storageProviders: storageAccounts.map(a => ({
        id: a.email,
        provider: a.provider,
        name: `${a.provider.toUpperCase()} (${a.email})`
      })),
      firebaseConfig: {
        apiKey,
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
        storageBucket: `${projectId}.firebasestorage.app`,
        messagingSenderId: "1550730436",
        appId: "1:1550730436:web:b0d748b19f918fed907591",
        databaseURL
      }
    });
  });

  // 3. GET FILES ROUTE
  app.get('/api/files', async (req, res) => {
    try {
      const db = getDb();
      const snapshot = await db.ref('/files').once('value');
      const files = snapshot.val() || {};
      const ownerEmail = req.query.ownerEmail;
      
      let filesList = Object.values(files)
        .filter((f: any) => f && f.fileId && (f.fileName || f.originalName));

      if (ownerEmail) {
        filesList = filesList.filter((f: any) => f.ownerEmail === ownerEmail);
      }

      filesList.sort((a: any, b: any) => 
        new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
      );
      res.json(filesList);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch files' });
    }
  });

  // 4. GET METADATA ROUTE
  app.get('/api/file-metadata/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      if (!fileId || fileId.startsWith('preset-') || /[.#$\[\]]/.test(fileId)) {
        return res.status(404).json({ error: 'File not found' });
      }
      const db = getDb();
      const snapshot = await db.ref(`/files/${fileId}`).once('value');
      const file = snapshot.val();
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.json(file);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch file metadata' });
    }
  });

  // 4b. UPDATE THUMBNAIL ROUTE

  app.post('/api/file/:fileId/thumbnail', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      const { thumbnailUrl } = req.body;
      if (!fileId || !thumbnailUrl) {
        return res.status(400).json({ error: 'Missing fileId or thumbnailUrl' });
      }
      const db = getDb();
      await db.ref(`/files/${fileId}`).update({ thumbnailUrl });
      res.json({ success: true, message: 'Thumbnail updated successfully' });
    } catch (error: any) {
      console.error('Failed to update thumbnail:', error);
      res.status(500).json({ error: error.message || 'Failed to update thumbnail' });
    }
  });

  // 5. DELETE FILE ROUTE
  app.delete('/api/delete/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      console.log(`[DELETE File] Request received to delete file: ${fileId}`);
      if (!fileId || fileId.startsWith('preset-') || /[.#$\[\]]/.test(fileId)) {
        console.log(`[DELETE File] Bypassing deletion for local/invalid file ID: ${fileId}`);
        return res.json({ success: true, message: 'Local or preset file removed successfully' });
      }

      const db = getDb();
      const snapshot = await db.ref(`/files/${fileId}`).once('value');
      const metadata = snapshot.val();

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Locate corresponding Storage account credentials
      const acct = storageAccounts.find(a => a.email === metadata.b2AccountEmail);
      if (acct) {
        try {
          if (acct.provider !== 'mega') {
            const s3 = getS3Client(acct);

            await s3.send(new DeleteObjectCommand({
              Bucket: acct.bucket,
              Key: metadata.b2FileId
            }));
            console.log(`[DELETE Storage] Successfully deleted key ${metadata.b2FileId} from bucket ${acct.bucket}`);
          }
        } catch (b2Err: any) {
          console.warn(`[DELETE Storage] Non-blocking warning: Failed to delete key from storage: ${b2Err.message}`);
        }
      }

      // Update in-memory space utilization tracker
      if (metadata.b2AccountEmail && usedSpaceMap[metadata.b2AccountEmail] !== undefined) {
        usedSpaceMap[metadata.b2AccountEmail] = Math.max(0, usedSpaceMap[metadata.b2AccountEmail] - Number(metadata.fileSize || 0));
        console.log(`[Storage Tracker] Subtracted deleted space. Used: ${usedSpaceMap[metadata.b2AccountEmail]} bytes`);
      }

      // Remove from database
      await db.ref(`/files/${fileId}`).remove();
      res.json({ success: true, message: 'File deleted successfully from database and B2' });
    } catch (error: any) {
      console.error('Delete error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete file' });
    }
  });

  // Vite middleware for development
  // Catch unmatched API routes to prevent Vite from returning SPA HTML
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler for API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    if (req.path.startsWith('/api/')) {
      res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
    } else {
      next(err);
    }
  });

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
