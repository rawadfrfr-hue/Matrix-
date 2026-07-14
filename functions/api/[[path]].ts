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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS, DELETE, PATCH, PUT",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

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

export const onRequest = async (context: any) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Handle Options pre-flight requests
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Base Firebase RTDB URL
  const dbUrl = env.FIREBASE_DATABASE_URL || `https://${env.FIREBASE_PROJECT_ID || "zetta-cloud-79576"}-default-rtdb.firebaseio.com`;

  try {
    // 0. GET /api/config
    if (path === "/api/config" && method === "GET") {
      const quotaGb = parseFloat(env.STORAGE_QUOTA_GB || '15');
      const projectId = env.FIREBASE_PROJECT_ID || "zetta-cloud-79576";
      const apiKey = env.FIREBASE_API_KEY || "AIzaSyDdOlFojXzAgbpaG-IUvSumtYe3Y1EdKqI";
      const databaseURL = env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`;

      return new Response(JSON.stringify({
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. GET /api/files
    if (path === "/api/files" && method === "GET") {
      const resDb = await fetch(`${dbUrl}/files.json`);
      const files = await resDb.json() || {};
      const ownerEmail = url.searchParams.get('ownerEmail');
      
      let filesList = Object.values(files).filter(
        (f: any) => f && f.fileId && (f.fileName || f.originalName)
      );

      if (ownerEmail) {
        filesList = filesList.filter((f: any) => f.ownerEmail === ownerEmail);
      }

      filesList.sort((a: any, b: any) => 
        new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
      );

      return new Response(JSON.stringify(filesList), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. GET /api/file-metadata/:fileId
    if (path.startsWith("/api/file-metadata/") && method === "GET") {
      const fileId = path.split("/").pop();
      if (!fileId) {
        return new Response(JSON.stringify({ error: "Missing fileId" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const resDb = await fetch(`${dbUrl}/files/${fileId}.json`);
      const file = await resDb.json();

      if (!file) {
        return new Response(JSON.stringify({ error: "File not found" }), {
          status: 404,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify(file), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. POST /api/file/:fileId/thumbnail
    if (path.startsWith("/api/file/") && path.endsWith("/thumbnail") && method === "POST") {
      const parts = path.split("/");
      const fileId = parts[3]; // /api/file/:fileId/thumbnail
      const body: any = await request.json();
      const { thumbnailUrl } = body;

      if (!fileId || !thumbnailUrl) {
        return new Response(JSON.stringify({ error: "Missing fileId or thumbnailUrl" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      await fetch(`${dbUrl}/files/${fileId}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnailUrl })
      });

      return new Response(JSON.stringify({ success: true, message: 'Thumbnail updated' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. GET /api/download/:fileId or GET /api/file/:fileId
    if ((path.startsWith("/api/download/") || path.startsWith("/api/file/")) && method === "GET") {
      const fileId = path.split("/").pop();
      if (!fileId) {
        return new Response(JSON.stringify({ error: "Missing fileId" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const resDb = await fetch(`${dbUrl}/files/${fileId}.json`);
      const metadata: any = await resDb.json();

      if (!metadata) {
        return new Response(JSON.stringify({ error: "File not found" }), {
          status: 404,
          headers: corsHeaders
        });
      }

      const b2Accounts = JSON.parse(env.B2_ACCOUNTS_JSON || '[]');
      const acct = b2Accounts.find((a: any) => a.email === metadata.b2AccountEmail);
      if (!acct) {
        return new Response(JSON.stringify({ error: "B2 account matching this file is not configured." }), {
          status: 500,
          headers: corsHeaders
        });
      }

      const s3 = getS3Client(acct);
      const command = new GetObjectCommand({
        Bucket: acct.bucket,
        Key: metadata.b2FileId,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(metadata.fileName)}"`
      });

      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return Response.redirect(presignedUrl, 302);
    }

    // 5. POST /api/upload/presign
    if (path === "/api/upload/presign" && method === "POST") {
      const body: any = await request.json();
      const { fileName, fileSize, fileType, ownerEmail } = body;

      if (!fileName || fileSize == null) {
        return new Response(JSON.stringify({ error: 'Missing file metadata' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const b2Accounts = JSON.parse(env.B2_ACCOUNTS_JSON || '[]');
      
      // Calculate used space
      const resDbAll = await fetch(`${dbUrl}/files.json`);
      const allFiles = await resDbAll.json() || {};

      // ENFORCE USER QUOTA FIRST
      const actualOwner = ownerEmail || 'anonymous';
      const quotaGb = parseFloat(env.STORAGE_QUOTA_GB || '15');
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
          return new Response(JSON.stringify({
            error: `Storage Quota Exceeded. You have used ${usedGb} GB out of ${quotaGb} GB. Uploading this file (${fileMb} MB) would exceed your limit.`
          }), {
            status: 403,
            headers: corsHeaders
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
          return new Response(JSON.stringify({ error: "No B2 accounts configured." }), {
            status: 500,
            headers: corsHeaders
          });
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

      return new Response(JSON.stringify({
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 6. POST /api/upload/confirm
    if (path === "/api/upload/confirm" && method === "POST") {
      const body: any = await request.json();
      const { uploadDetails, parentId, ownerEmail } = body;

      if (!uploadDetails || !uploadDetails.b2FileId) {
        return new Response(JSON.stringify({ error: 'Missing upload details' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const fileId = crypto.randomUUID();
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

      await fetch(`${dbUrl}/files/${fileId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });

      return new Response(JSON.stringify({
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 7. POST /api/upload/multipart/initiate
    if (path === "/api/upload/multipart/initiate" && method === "POST") {
      const body: any = await request.json();
      const { fileName, fileSize, fileType, ownerEmail } = body;

      if (!fileName || fileSize == null) {
        return new Response(JSON.stringify({ error: 'Missing file metadata' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const b2Accounts = JSON.parse(env.B2_ACCOUNTS_JSON || '[]');
      
      const resDbAll = await fetch(`${dbUrl}/files.json`);
      const allFiles = await resDbAll.json() || {};

      // ENFORCE USER QUOTA FIRST
      const actualOwner = ownerEmail || 'anonymous';
      const quotaGb = parseFloat(env.STORAGE_QUOTA_GB || '15');
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
          return new Response(JSON.stringify({
            error: `Storage Quota Exceeded. You have used ${usedGb} GB out of ${quotaGb} GB. Uploading this file (${fileMb} MB) would exceed your limit.`
          }), {
            status: 403,
            headers: corsHeaders
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
          return new Response(JSON.stringify({ error: "No B2 accounts configured." }), {
            status: 500,
            headers: corsHeaders
          });
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

      return new Response(JSON.stringify({
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 8. POST /api/upload/multipart/presign-parts
    if (path === "/api/upload/multipart/presign-parts" && method === "POST") {
      const body: any = await request.json();
      const { uploadId, key, b2AccountEmail, partNumbers } = body;

      if (!uploadId || !key || !b2AccountEmail || !partNumbers || !Array.isArray(partNumbers)) {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const b2Accounts = JSON.parse(env.B2_ACCOUNTS_JSON || '[]');
      const selectedAccount = b2Accounts.find((a: any) => a.email === b2AccountEmail);
      if (!selectedAccount) {
        return new Response(JSON.stringify({ error: 'B2 account not found' }), {
          status: 404,
          headers: corsHeaders
        });
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

      return new Response(JSON.stringify({
        success: true,
        presignedUrls
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 9. POST /api/upload/multipart/complete
    if (path === "/api/upload/multipart/complete" && method === "POST") {
      const body: any = await request.json();
      const { uploadId, key, b2AccountEmail, parts, parentId, ownerEmail, uploadDetails } = body;

      if (!uploadId || !key || !b2AccountEmail || !parts || !Array.isArray(parts)) {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const b2Accounts = JSON.parse(env.B2_ACCOUNTS_JSON || '[]');
      const selectedAccount = b2Accounts.find((a: any) => a.email === b2AccountEmail);
      if (!selectedAccount) {
        return new Response(JSON.stringify({ error: 'B2 account not found' }), {
          status: 404,
          headers: corsHeaders
        });
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

      const fileId = crypto.randomUUID();
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

      await fetch(`${dbUrl}/files/${fileId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });

      return new Response(JSON.stringify({
        success: true,
        metadata: {
          fileId,
          fileName: uploadDetails.fileName,
          fileSize: uploadDetails.fileSize,
          uploadDate: metadata.uploadDate,
          parentId,
          thumbnailUrl
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 10. POST /api/upload/multipart/abort
    if (path === "/api/upload/multipart/abort" && method === "POST") {
      const body: any = await request.json();
      const { uploadId, key, b2AccountEmail } = body;

      if (!uploadId || !key || !b2AccountEmail) {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const b2Accounts = JSON.parse(env.B2_ACCOUNTS_JSON || '[]');
      const selectedAccount = b2Accounts.find((a: any) => a.email === b2AccountEmail);
      if (!selectedAccount) {
        return new Response(JSON.stringify({ error: 'B2 account not found' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      const s3 = getS3Client(selectedAccount);
      const command = new AbortMultipartUploadCommand({
        Bucket: selectedAccount.bucket,
        Key: key,
        UploadId: uploadId
      });

      await s3.send(command);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 11. DELETE /api/delete/:fileId
    if (path.startsWith("/api/delete/") && method === "DELETE") {
      const fileId = path.split("/").pop();
      if (!fileId || fileId.startsWith('preset-')) {
        return new Response(JSON.stringify({ success: true, message: 'Local/preset file deleted' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const resDb = await fetch(`${dbUrl}/files/${fileId}.json`);
      const metadata: any = await resDb.json();

      if (!metadata) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      const b2Accounts = JSON.parse(env.B2_ACCOUNTS_JSON || '[]');
      const acct = b2Accounts.find((a: any) => a.email === metadata.b2AccountEmail);
      if (acct) {
        try {
          const s3 = getS3Client(acct);
          await s3.send(new DeleteObjectCommand({
            Bucket: acct.bucket,
            Key: metadata.b2FileId
          }));
        } catch (b2Err: any) {
          console.warn("Worker delete warning:", b2Err.message);
        }
      }

      await fetch(`${dbUrl}/files/${fileId}.json`, {
        method: 'DELETE'
      });

      return new Response(JSON.stringify({ success: true, message: 'File deleted' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Handle 404 for unmatched API requests
    return new Response(JSON.stringify({ error: "API Route Not Found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
