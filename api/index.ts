import express from 'express';
import cors from 'cors';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  CreateMultipartUploadCommand, 
  UploadPartCommand, 
  CompleteMultipartUploadCommand, 
  AbortMultipartUploadCommand 
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

function getS3Client(acct: any) {
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

// Helper to get database url
function getDbUrl() {
  const { FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID } = process.env;
  return FIREBASE_DATABASE_URL || `https://${FIREBASE_PROJECT_ID || "zetta-cloud-79576"}-default-rtdb.firebaseio.com`;
}

// 0. GET /api/config
app.get('/api/config', (req, res) => {
  const quotaGb = parseFloat(process.env.STORAGE_QUOTA_GB || '15');
  const projectId = process.env.FIREBASE_PROJECT_ID || "zetta-cloud-79576";
  const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyDdOlFojXzAgbpaG-IUvSumtYe3Y1EdKqI";
  const databaseURL = getDbUrl();

  res.json({
    storageQuotaGb: quotaGb,
    storageQuotaBytes: quotaGb * 1024 * 1024 * 1024,
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

// 1. GET /api/files
app.get('/api/files', async (req, res) => {
  try {
    const dbUrl = getDbUrl();
    const response = await fetch(`${dbUrl}/files.json`);
    const files = await response.json() || {};
    const ownerEmail = req.query.ownerEmail as string | undefined;
    
    let filesList = Object.values(files).filter(
      (f: any) => f && f.fileId && (f.fileName || f.originalName)
    );

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

// 2. GET /api/file-metadata/:fileId
app.get('/api/file-metadata/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.startsWith('preset-')) {
      return res.status(404).json({ error: 'File not found' });
    }
    const dbUrl = getDbUrl();
    const response = await fetch(`${dbUrl}/files/${fileId}.json`);
    const file = await response.json();
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json(file);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch file metadata' });
  }
});

// 3. POST /api/file/:fileId/thumbnail
app.post('/api/file/:fileId/thumbnail', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { thumbnailUrl } = req.body;
    if (!fileId || !thumbnailUrl) {
      return res.status(400).json({ error: 'Missing fileId or thumbnailUrl' });
    }
    const dbUrl = getDbUrl();
    await fetch(`${dbUrl}/files/${fileId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thumbnailUrl })
    });
    res.json({ success: true, message: 'Thumbnail updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update thumbnail' });
  }
});

// Helper for download redirection
const handleDownload = async (req: express.Request, res: express.Response) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.startsWith('preset-')) {
      return res.status(404).json({ error: 'File not found' });
    }

    const dbUrl = getDbUrl();
    const response = await fetch(`${dbUrl}/files/${fileId}.json`);
    const metadata: any = await response.json();

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
    const acct = b2Accounts.find((a: any) => a.email === metadata.b2AccountEmail);
    if (!acct) {
      return res.status(500).json({ error: 'Storage account credentials matching this file are not configured.' });
    }

    const s3 = getS3Client(acct);
    const command = new GetObjectCommand({
      Bucket: acct.bucket,
      Key: metadata.b2FileId,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(metadata.fileName)}"`
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.redirect(presignedUrl);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Download failed' });
  }
};

app.get('/api/download/:fileId', handleDownload);
app.get('/api/file/:fileId', handleDownload);

// 4. POST /api/upload/presign
app.post('/api/upload/presign', async (req, res) => {
  try {
    const { fileName, fileSize, fileType, ownerEmail } = req.body;
    if (!fileName || fileSize == null) {
      return res.status(400).json({ error: 'Missing file metadata' });
    }

    const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
    const dbUrl = getDbUrl();
    
    // Fetch all files for load balancing and quota calculation
    const allFilesResponse = await fetch(`${dbUrl}/files.json`);
    const allFiles = await allFilesResponse.json() || {};

    // Quota Enforcement
    const actualOwner = ownerEmail || 'anonymous';
    const quotaGb = parseFloat(process.env.STORAGE_QUOTA_GB || '15');
    const maxQuotaBytes = quotaGb * 1024 * 1024 * 1024;
    
    if (actualOwner && actualOwner !== 'anonymous') {
      let userUsedSpace = 0;
      Object.values(allFiles).forEach((file: any) => {
        if (file && file.ownerEmail === actualOwner && file.fileSize) {
          userUsedSpace += Number(file.fileSize);
        }
      });
      if (userUsedSpace + fileSize > maxQuotaBytes) {
        const usedGb = (userUsedSpace / (1024 * 1024 * 1024)).toFixed(2);
        const fileMb = (fileSize / (1024 * 1024)).toFixed(2);
        return res.status(403).json({
          error: `Storage Quota Exceeded. You have used ${usedGb} GB out of ${quotaGb} GB. Uploading this file (${fileMb} MB) would exceed your limit.`
        });
      }
    }

    // Load Balancing across B2 accounts
    const usedSpaceMap: Record<string, number> = {};
    for (const acct of b2Accounts) {
      usedSpaceMap[acct.email] = 0;
    }
    Object.values(allFiles).forEach((file: any) => {
      if (file && file.b2AccountEmail && file.fileSize) {
        if (usedSpaceMap[file.b2AccountEmail] !== undefined) {
          usedSpaceMap[file.b2AccountEmail] += Number(file.fileSize);
        }
      }
    });

    const FREE_TIER_LIMIT = 9.5 * 1024 * 1024 * 1024;
    let selectedAccount = null;

    for (const acct of b2Accounts) {
      const currentUsed = usedSpaceMap[acct.email] || 0;
      if (currentUsed + fileSize <= FREE_TIER_LIMIT) {
        selectedAccount = acct;
        break;
      }
    }

    if (!selectedAccount) {
      if (b2Accounts.length > 0) {
        selectedAccount = b2Accounts[0];
      } else {
        return res.status(500).json({ error: "No B2 accounts configured." });
      }
    }

    const s3 = getS3Client(selectedAccount);
    const uniqueKey = `${Date.now()}-${fileName}`;
    const contentType = fileType || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: selectedAccount.bucket,
      Key: uniqueKey,
      ContentType: contentType
    });

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
    res.status(500).json({ error: error.message || 'Presign failed' });
  }
});

// 5. POST /api/upload/confirm
app.post('/api/upload/confirm', async (req, res) => {
  try {
    const { uploadDetails, parentId, ownerEmail } = req.body;
    if (!uploadDetails || !uploadDetails.b2FileId) {
      return res.status(400).json({ error: 'Missing upload details' });
    }

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

    const dbUrl = getDbUrl();
    await fetch(`${dbUrl}/files/${fileId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });

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
    res.status(500).json({ error: error.message || 'Confirm failed' });
  }
});

// 6. POST /api/upload/multipart/initiate
app.post('/api/upload/multipart/initiate', async (req, res) => {
  try {
    const { fileName, fileSize, fileType, ownerEmail } = req.body;
    if (!fileName || fileSize == null) {
      return res.status(400).json({ error: 'Missing file metadata' });
    }

    const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
    const dbUrl = getDbUrl();
    const allFilesResponse = await fetch(`${dbUrl}/files.json`);
    const allFiles = await allFilesResponse.json() || {};

    const actualOwner = ownerEmail || 'anonymous';
    const quotaGb = parseFloat(process.env.STORAGE_QUOTA_GB || '15');
    const maxQuotaBytes = quotaGb * 1024 * 1024 * 1024;
    
    if (actualOwner && actualOwner !== 'anonymous') {
      let userUsedSpace = 0;
      Object.values(allFiles).forEach((file: any) => {
        if (file && file.ownerEmail === actualOwner && file.fileSize) {
          userUsedSpace += Number(file.fileSize);
        }
      });
      if (userUsedSpace + fileSize > maxQuotaBytes) {
        const usedGb = (userUsedSpace / (1024 * 1024 * 1024)).toFixed(2);
        const fileMb = (fileSize / (1024 * 1024)).toFixed(2);
        return res.status(403).json({
          error: `Storage Quota Exceeded. You have used ${usedGb} GB out of ${quotaGb} GB. Uploading this file (${fileMb} MB) would exceed your limit.`
        });
      }
    }

    const usedSpaceMap: Record<string, number> = {};
    for (const acct of b2Accounts) {
      usedSpaceMap[acct.email] = 0;
    }
    Object.values(allFiles).forEach((file: any) => {
      if (file && file.b2AccountEmail && file.fileSize) {
        if (usedSpaceMap[file.b2AccountEmail] !== undefined) {
          usedSpaceMap[file.b2AccountEmail] += Number(file.fileSize);
        }
      }
    });

    const FREE_TIER_LIMIT = 9.5 * 1024 * 1024 * 1024;
    let selectedAccount = null;

    for (const acct of b2Accounts) {
      const currentUsed = usedSpaceMap[acct.email] || 0;
      if (currentUsed + fileSize <= FREE_TIER_LIMIT) {
        selectedAccount = acct;
        break;
      }
    }

    if (!selectedAccount) {
      if (b2Accounts.length > 0) {
        selectedAccount = b2Accounts[0];
      } else {
        return res.status(500).json({ error: "No B2 accounts configured." });
      }
    }

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
    res.status(500).json({ error: error.message || 'Multipart initiate failed' });
  }
});

// 7. POST /api/upload/multipart/presign-parts
app.post('/api/upload/multipart/presign-parts', async (req, res) => {
  try {
    const { uploadId, key, b2AccountEmail, partNumbers } = req.body;
    if (!uploadId || !key || !b2AccountEmail || !partNumbers || !Array.isArray(partNumbers)) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
    const selectedAccount = b2Accounts.find((a: any) => a.email === b2AccountEmail);
    if (!selectedAccount) {
      return res.status(404).json({ error: 'B2 account not found' });
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

    res.json({ success: true, presignedUrls });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Presign parts failed' });
  }
});

// 8. POST /api/upload/multipart/complete
app.post('/api/upload/multipart/complete', async (req, res) => {
  try {
    const { uploadId, key, b2AccountEmail, parts, parentId, ownerEmail, uploadDetails } = req.body;
    if (!uploadId || !key || !b2AccountEmail || !parts || !Array.isArray(parts)) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
    const selectedAccount = b2Accounts.find((a: any) => a.email === b2AccountEmail);
    if (!selectedAccount) {
      return res.status(404).json({ error: 'B2 account not found' });
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

    const dbUrl = getDbUrl();
    await fetch(`${dbUrl}/files/${fileId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });

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
    res.status(500).json({ error: error.message || 'Multipart completion failed' });
  }
});

// 9. POST /api/upload/multipart/abort
app.post('/api/upload/multipart/abort', async (req, res) => {
  try {
    const { uploadId, key, b2AccountEmail } = req.body;
    if (!uploadId || !key || !b2AccountEmail) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
    const selectedAccount = b2Accounts.find((a: any) => a.email === b2AccountEmail);
    if (!selectedAccount) {
      return res.status(404).json({ error: 'B2 account not found' });
    }

    const s3 = getS3Client(selectedAccount);
    const command = new AbortMultipartUploadCommand({
      Bucket: selectedAccount.bucket,
      Key: key,
      UploadId: uploadId
    });

    await s3.send(command);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Multipart abort failed' });
  }
});

// 10. DELETE /api/delete/:fileId
app.delete('/api/delete/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.startsWith('preset-')) {
      return res.json({ success: true, message: 'Local/preset file deleted' });
    }

    const dbUrl = getDbUrl();
    const resDb = await fetch(`${dbUrl}/files/${fileId}.json`);
    const metadata: any = await resDb.json();

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
    const acct = b2Accounts.find((a: any) => a.email === metadata.b2AccountEmail);
    if (acct) {
      try {
        const s3 = getS3Client(acct);
        await s3.send(new DeleteObjectCommand({
          Bucket: acct.bucket,
          Key: metadata.b2FileId
        }));
      } catch (b2Err: any) {
        console.warn("Vercel delete warning:", b2Err.message);
      }
    }

    await fetch(`${dbUrl}/files/${fileId}.json`, {
      method: 'DELETE'
    });

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete file' });
  }
});

export default app;
