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
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Interface for Backblaze B2 Account configured in process.env.B2_ACCOUNTS_JSON
interface B2Account {
  email: string;
  bucket: string;
  keyId: string;
  appKey: string;
  endpoint: string;
  region: string;
}

let b2Accounts: B2Account[] = [];
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

function parseB2Accounts() {
  const jsonStr = process.env.B2_ACCOUNTS_JSON;
  if (!jsonStr) {
    console.warn("[B2 Config] B2_ACCOUNTS_JSON environment variable is missing.");
    return;
  }
  try {
    b2Accounts = JSON.parse(jsonStr);
    console.log(`[B2 Config] Loaded ${b2Accounts.length} Backblaze B2 accounts.`);
    for (const acct of b2Accounts) {
      usedSpaceMap[acct.email] = 0;
    }
  } catch (err: any) {
    console.error("[B2 Config] Failed to parse B2_ACCOUNTS_JSON:", err.message);
  }
}

async function initializeUsedSpace() {
  try {
    const db = getDb();
    const snapshot = await db.ref('/files').once('value');
    const files = snapshot.val() || {};

    // Reset space map values to 0
    for (const acct of b2Accounts) {
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

    console.log("[B2 Tracker] In-memory space utilization initialized:", usedSpaceMap);
  } catch (err: any) {
    console.error("[B2 Tracker] Failed to initialize space tracker:", err.message);
  }
}

function selectB2Account(fileSize: number): B2Account {
  if (b2Accounts.length === 0) {
    throw new Error("No Backblaze B2 accounts configured in system settings.");
  }

  for (const acct of b2Accounts) {
    const currentUsed = usedSpaceMap[acct.email] || 0;
    if (currentUsed + fileSize <= FREE_TIER_LIMIT) {
      return acct;
    }
  }

  throw new Error("Free Tier Storage Limit Exceeded: No B2 account has enough remaining space (9.5 GB ceiling).");
}

function getS3Client(acct: B2Account): S3Client {
  let endpoint = (acct.endpoint || '').trim();
  if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = 'https://' + endpoint;
  }
  return new S3Client({
    endpoint,
    region: acct.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: acct.keyId,
      secretAccessKey: acct.appKey
    }
  });
}

async function startServer() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "zetta-cloud-79576";
  try {
    discoveredDatabaseURL = await discoverDatabaseUrl(projectId);
    console.log(`[Firebase Start] Resolved database URL to: ${discoveredDatabaseURL}`);
  } catch (err) {
    console.warn('[Firebase Start] Failed to auto-discover database URL:', err);
  }

  // Parse configuration and load B2 accounts
  parseB2Accounts();

  // Initialize Used Space Tracking from database on startup
  try {
    await initializeUsedSpace();
  } catch (err: any) {
    console.warn("[Firebase Start] Could not run initial space calculation on launch:", err.message);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 1a. GET PRESIGNED UPLOAD PARAMETERS (Cloudflare worker parity)
  app.post('/api/get-upload-url', async (req, res) => {
    try {
      const fileName = req.body.fileName || 'file';
      if (b2Accounts.length === 0) {
        return res.status(500).json({ error: 'No B2 accounts configured' });
      }

      // Latency calculation: Select fastest account based on real-time ping
      const pingPromises = b2Accounts.map(async (acct) => {
        let url = acct.endpoint || "https://api.backblazeb2.com";
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          await fetch(url, { method: 'HEAD', signal: controller.signal });
          clearTimeout(timeoutId);
          return { acct, latency: Date.now() - start };
        } catch {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);
            return { acct, latency: Date.now() - start };
          } catch {
            return { acct, latency: 9999 };
          }
        }
      });

      const results = await Promise.all(pingPromises);
      results.sort((a, b) => a.latency - b.latency);
      const fastestAcct = results[0].acct;

      // Authorize with B2 Native REST API
      const credentials = Buffer.from(`${fastestAcct.keyId}:${fastestAcct.appKey}`).toString('base64');
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        method: "GET",
        headers: { "Authorization": `Basic ${credentials}` }
      });
      if (!authRes.ok) {
        throw new Error(`B2 Authorize failed: ${await authRes.text()}`);
      }
      const authData: any = await authRes.json();

      // Get bucket ID
      const bucketRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_buckets`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ accountId: authData.accountId, bucketName: fastestAcct.bucket })
      });
      if (!bucketRes.ok) {
        throw new Error(`B2 List Buckets failed: ${await bucketRes.text()}`);
      }
      const bucketData: any = await bucketRes.json();
      const bucketId = bucketData.buckets[0].bucketId;

      // Get upload URL
      const uploadRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ bucketId })
      });
      if (!uploadRes.ok) {
        throw new Error(`B2 Get Upload URL failed: ${await uploadRes.text()}`);
      }
      const uploadData: any = await uploadRes.json();

      const uniqueKey = `${Date.now()}-${fileName}`;

      res.json({
        uploadUrl: uploadData.uploadUrl,
        uploadAuthToken: uploadData.authorizationToken,
        b2FileId: uniqueKey,
        b2AccountEmail: fastestAcct.email,
        b2BucketName: fastestAcct.bucket
      });
    } catch (error: any) {
      console.error('get-upload-url error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate upload URL' });
    }
  });

  // 1b. LOG COMPLETED UPLOAD METADATA (Cloudflare worker parity)
  app.post('/api/upload-metadata', async (req, res) => {
    try {
      const {
        fileName,
        fileSize,
        mimeType,
        b2AccountEmail,
        b2BucketName,
        b2FileId,
        b2NativeFileId,
        parentId,
        ownerEmail,
        thumbnailUrl
      } = req.body;

      const fileId = randomUUID();
      const metadata = {
        fileId,
        fileName,
        originalName: fileName,
        mimeType: mimeType || 'application/octet-stream',
        fileSize: Number(fileSize),
        uploadDate: new Date().toISOString(),
        b2AccountEmail,
        b2BucketName,
        b2FileId,
        b2NativeFileId: b2NativeFileId || null,
        parentId: parentId || null,
        ownerEmail: ownerEmail || 'anonymous',
        isTrashed: false,
        isStarred: false,
        thumbnailUrl: thumbnailUrl || null
      };

      const db = getDb();
      await db.ref(`/files/${fileId}`).set(metadata);

      // Update in-memory tracker
      usedSpaceMap[b2AccountEmail] = (usedSpaceMap[b2AccountEmail] || 0) + Number(fileSize);
      console.log(`[B2 Tracker] Updated used space for ${b2AccountEmail} to ${usedSpaceMap[b2AccountEmail]} bytes`);

      res.json({
        success: true,
        metadata
      });
    } catch (error: any) {
      console.error('upload-metadata error:', error);
      res.status(500).json({ error: error.message || 'Failed to save metadata' });
    }
  });

  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  // 1. FILE UPLOAD ROUTE
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fileSize = req.file.size;

      // Smart Load Balancer
      let selectedAccount: B2Account;
      try {
        selectedAccount = selectB2Account(fileSize);
      } catch (lbErr: any) {
        console.error(`[Upload Load Balancer] Failed to select account: ${lbErr.message}`);
        return res.status(507).json({ error: lbErr.message });
      }

      console.log(`[Upload Load Balancer] Selected account ${selectedAccount.email} for file: ${req.file.originalname}`);

      // AWS SDK S3Client instantiation for B2
      const s3 = getS3Client(selectedAccount);

      // Generate unique name to prevent collisions in the bucket
      const uniqueKey = `${Date.now()}-${req.file.originalname}`;

      // Upload to Backblaze B2
      await s3.send(new PutObjectCommand({
        Bucket: selectedAccount.bucket,
        Key: uniqueKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream'
      }));

      console.log(`[Upload B2] Successfully uploaded ${uniqueKey} to bucket ${selectedAccount.bucket}`);

      // Generate unique file ID and save metadata to Firebase Database
      const fileId = randomUUID();
      const isImage = (req.file.mimetype || '').startsWith('image/') || 
                      req.file.originalname.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
      const thumbnailUrl = isImage ? `/api/download/${fileId}` : null;

      const metadata = {
        fileId,
        fileName: req.file.originalname,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        fileSize,
        uploadDate: new Date().toISOString(),
        b2AccountEmail: selectedAccount.email,
        b2BucketName: selectedAccount.bucket,
        b2FileId: uniqueKey,
        parentId: req.body.parentId || null,
        ownerEmail: req.body.ownerEmail || 'anonymous',
        isTrashed: false,
        isStarred: false,
        thumbnailUrl
      };

      const db = getDb();
      await db.ref(`/files/${fileId}`).set(metadata);

      // Update in-memory tracker
      usedSpaceMap[selectedAccount.email] = (usedSpaceMap[selectedAccount.email] || 0) + fileSize;
      console.log(`[B2 Tracker] Updated used space for ${selectedAccount.email} to ${usedSpaceMap[selectedAccount.email]} bytes`);

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
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message || 'Upload failed' });
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

      // Locate corresponding B2 account credentials
      const acct = b2Accounts.find(a => a.email === metadata.b2AccountEmail);
      if (!acct) {
        return res.status(500).json({ error: 'Storage account credentials matching this file are not configured.' });
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

      // Locate corresponding B2 account credentials
      const acct = b2Accounts.find(a => a.email === metadata.b2AccountEmail);
      if (acct) {
        try {
          const s3 = getS3Client(acct);

          await s3.send(new DeleteObjectCommand({
            Bucket: acct.bucket,
            Key: metadata.b2FileId
          }));
          console.log(`[DELETE B2] Successfully deleted key ${metadata.b2FileId} from bucket ${acct.bucket}`);
        } catch (b2Err: any) {
          console.warn(`[DELETE B2] Non-blocking warning: Failed to delete key from Backblaze: ${b2Err.message}`);
        }
      }

      // Update in-memory space utilization tracker
      if (metadata.b2AccountEmail && usedSpaceMap[metadata.b2AccountEmail] !== undefined) {
        usedSpaceMap[metadata.b2AccountEmail] = Math.max(0, usedSpaceMap[metadata.b2AccountEmail] - Number(metadata.fileSize || 0));
        console.log(`[B2 Tracker] Subtracted deleted space. Used: ${usedSpaceMap[metadata.b2AccountEmail]} bytes`);
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

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
