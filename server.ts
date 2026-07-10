import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import axios from 'axios';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert as adminCert } from 'firebase-admin/app';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { initializeApp as initClientApp } from 'firebase/app';
import { getDatabase as getClientDatabase, ref as dbRef, set as dbSet, get as dbGet, remove as dbRemove } from 'firebase/database';
import cors from 'cors';
import { randomUUID } from 'crypto';

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

async function startServer() {
  // Safe environment diagnostic logging (only logs variable names, never values)
  const matrixKeys = Object.keys(process.env).filter(k => k.startsWith("MATRIX_"));
  const firebaseKeys = Object.keys(process.env).filter(k => k.startsWith("FIREBASE_"));
  console.log(`[Env Diagnostic] Detected Matrix keys in process.env:`, matrixKeys);
  console.log(`[Env Diagnostic] Detected Firebase keys in process.env:`, firebaseKeys);

  const projectId = process.env.FIREBASE_PROJECT_ID || "zetta-cloud-79576";
  try {
    discoveredDatabaseURL = await discoverDatabaseUrl(projectId);
    console.log(`[Firebase Start] Resolved database URL to: ${discoveredDatabaseURL}`);
  } catch (err) {
    console.warn('[Firebase Start] Failed to auto-discover database URL:', err);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  const storage = multer.memoryStorage();
  const upload = multer({ storage });
  const CHUNK_SIZE = 40 * 1024 * 1024; // 40MB

  // 4. Advanced Upload & File Splitting Logic
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const { MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN, MATRIX_ROOM_ID } = process.env;
      if (!MATRIX_HOMESERVER || !MATRIX_ACCESS_TOKEN) {
        const missing = [];
        if (!MATRIX_HOMESERVER) missing.push('MATRIX_HOMESERVER');
        if (!MATRIX_ACCESS_TOKEN) missing.push('MATRIX_ACCESS_TOKEN');
        const detectedKeys = Object.keys(process.env).filter(k => k.startsWith('MATRIX_'));
        const errStr = `Matrix credentials missing or empty in environment: ${missing.join(', ')}. Please verify that you added these under the 'Variables' tab in your Railway project, saved them, and redeployed the service. Detected Matrix keys: ${detectedKeys.length ? detectedKeys.join(', ') : 'None'}`;
        console.error(`[Upload Error] ${errStr}`);
        return res.status(500).json({ error: errStr });
      }

      const buffer = req.file.buffer;
      const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
      const chunkUris: string[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, buffer.length);
        const chunk = buffer.slice(start, end);
        
        const filename = `${req.file.originalname}_part${i}`;
        const uploadUrlV3 = `${MATRIX_HOMESERVER}/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`;
        const uploadUrlR0 = `${MATRIX_HOMESERVER}/_matrix/media/r0/upload?filename=${encodeURIComponent(filename)}`;
        const uploadUrlV1 = `${MATRIX_HOMESERVER}/_matrix/client/v1/media/upload?filename=${encodeURIComponent(filename)}`;
        
        let response;
        try {
          console.log(`[Matrix Upload] Attempting standard media/v3 upload endpoint: ${uploadUrlV3}`);
          response = await axios.post(uploadUrlV3, chunk, {
            headers: {
              'Authorization': `Bearer ${MATRIX_ACCESS_TOKEN}`,
              'Content-Type': 'application/octet-stream'
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
          });
        } catch (v3Err: any) {
          console.warn(`[Matrix Upload] media/v3 upload failed (Status: ${v3Err?.response?.status || v3Err.message}), trying legacy media/r0 fallback...`);
          try {
            response = await axios.post(uploadUrlR0, chunk, {
              headers: {
                'Authorization': `Bearer ${MATRIX_ACCESS_TOKEN}`,
                'Content-Type': 'application/octet-stream'
              },
              maxBodyLength: Infinity,
              maxContentLength: Infinity
            });
          } catch (r0Err: any) {
            console.warn(`[Matrix Upload] media/r0 upload failed (Status: ${r0Err?.response?.status || r0Err.message}), trying client/v1 fallback...`);
            response = await axios.post(uploadUrlV1, chunk, {
              headers: {
                'Authorization': `Bearer ${MATRIX_ACCESS_TOKEN}`,
                'Content-Type': 'application/octet-stream'
              },
              maxBodyLength: Infinity,
              maxContentLength: Infinity
            });
          }
        }
        
        if (!response.data || !response.data.content_uri) {
           throw new Error('Failed to get content_uri from Matrix');
        }
        const mxcUri = response.data.content_uri;
        chunkUris.push(mxcUri);

        // Clean up process.env.MATRIX_ROOM_ID
        let cleanRoomId = (process.env.MATRIX_ROOM_ID || '').replace(/['"\s]/g, '').trim();
        if (cleanRoomId && !cleanRoomId.startsWith('!')) {
          cleanRoomId = '!' + cleanRoomId;
        }

        if (cleanRoomId) {
          const chunkName = filename;
          const chunkSize = chunk.length;
          const txnId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const messageUrl = `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(cleanRoomId)}/send/m.room.message/${txnId}`;
          
          console.log(`[Matrix Room Send] Sending file chunk message to room ${cleanRoomId}: ${messageUrl}`);
          try {
            await axios.put(messageUrl, {
              "msgtype": "m.file",
              "body": chunkName,
              "url": mxcUri,
              "info": { 
                "size": chunkSize, 
                "mimetype": "application/octet-stream" 
              }
            }, {
              headers: {
                'Authorization': `Bearer ${MATRIX_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              }
            });
            console.log(`[Matrix Room Send] Message sent successfully to room for chunk ${i}`);
          } catch (msgErr: any) {
            console.error(`[Matrix Room Send] Failed to send message to room (Status: ${msgErr?.response?.status || msgErr.message}):`, msgErr?.response?.data || msgErr);
          }
        }
      }

      const fileId = randomUUID();
      const metadata = {
        fileId,
        fileName: req.file.originalname,
        totalChunks,
        fileSize: buffer.length,
        uploadDate: new Date().toISOString(),
        chunks: chunkUris,
        parentId: req.body.parentId || null
      };

      const db = getDb();
      await db.ref(`/files/${fileId}`).set(metadata);

      res.json({ success: true, metadata });
    } catch (error: any) {
      console.error('Upload error:', error?.response?.data || error);
      res.status(500).json({ error: error.message || 'Upload failed' });
    }
  });

  app.get('/api/files', async (req, res) => {
    try {
      const db = getDb();
      const snapshot = await db.ref('/files').once('value');
      const files = snapshot.val() || {};
      const filesList = Object.values(files).sort((a: any, b: any) => 
        new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
      );
      res.json(filesList);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch files' });
    }
  });

  app.delete('/api/delete/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      console.log(`[DELETE File] Request received to delete file ${fileId}`);
      const db = getDb();
      await db.ref('files/' + fileId).remove();
      res.json({ success: true, message: 'File deleted successfully from database' });
    } catch (error: any) {
      console.error('Delete error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete file' });
    }
  });

  // 5. Advanced Streaming & Merging Logic
  app.get('/api/download/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      const db = getDb();
      const snapshot = await db.ref(`/files/${fileId}`).once('value');
      const metadata = snapshot.val();

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      const { MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN } = process.env;
      if (!MATRIX_HOMESERVER || !MATRIX_ACCESS_TOKEN) {
        return res.status(500).json({ error: 'Matrix credentials missing.' });
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', metadata.fileSize);

      for (const mxcUri of metadata.chunks) {
        const mxcUrl = mxcUri.replace('mxc://', ''); // becomes server.name/mediaId
        const downloadUrlV1 = `${MATRIX_HOMESERVER}/_matrix/client/v1/media/download/${mxcUrl}`;
        const downloadUrlV3 = `${MATRIX_HOMESERVER}/_matrix/media/v3/download/${mxcUrl}`;
        
        let response;
        try {
          console.log(`[Matrix Download] Attempting client/v1 endpoint: ${downloadUrlV1}`);
          response = await axios({
            method: 'get',
            url: downloadUrlV1,
            responseType: 'stream',
            headers: {
              'Authorization': `Bearer ${MATRIX_ACCESS_TOKEN}`
            }
          });
        } catch (v1Err: any) {
          console.warn(`[Matrix Download] client/v1 download failed (Status: ${v1Err?.response?.status || v1Err.message}), trying media/v3 fallback: ${downloadUrlV3}`);
          response = await axios({
            method: 'get',
            url: downloadUrlV3,
            responseType: 'stream',
            headers: {
              'Authorization': `Bearer ${MATRIX_ACCESS_TOKEN}`
            }
          });
        }
        
        await new Promise((resolve, reject) => {
          response.data.pipe(res, { end: false });
          response.data.on('end', resolve);
          response.data.on('error', reject);
        });
      }
      
      res.end();
    } catch (error: any) {
      console.error('Download error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Download failed' });
      } else {
        res.end();
      }
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
