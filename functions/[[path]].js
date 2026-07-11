/**
 * Cloudflare Backend Worker / Pages Function
 * Fully compatible with BOTH Cloudflare Pages Functions (onRequest) AND Standalone Workers (export default fetch).
 * Location: /functions/[[path]].js
 */

async function handleRequest(request, env) {
  // Set up CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name',
    'Access-Control-Max-Age': '86400',
  };

  const method = request.method;
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');

  try {
    const safeEnv = env || {};

    // Parse Firebase environment settings (separate individual variables as requested)
    const projectId = safeEnv.FIREBASE_PROJECT_ID || "zetta-cloud-79576";
    let databaseUrl = safeEnv.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`;
    if (!databaseUrl.endsWith('/')) {
      databaseUrl += '/';
    }

    // Resolve accounts
    let b2Accounts = [];
    const jsonStr = safeEnv.B2_ACCOUNTS_JSON;
    if (!jsonStr) {
      return new Response(JSON.stringify({ 
        error: 'Cloudflare Configuration Error: B2_ACCOUNTS_JSON environment variable is missing or empty in your Cloudflare Settings.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      b2Accounts = JSON.parse(jsonStr);
    } catch (err) {
      return new Response(JSON.stringify({ 
        error: `Cloudflare Configuration Error: Failed to parse B2_ACCOUNTS_JSON: ${err.message}. Please verify the JSON formatting.` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!Array.isArray(b2Accounts) || b2Accounts.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Cloudflare Configuration Error: B2_ACCOUNTS_JSON parsed successfully but contains no account objects.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // 1. GET FILES LIST
    if (path === '/api/files' && method === 'GET') {
      const rtdbRes = await fetch(`${databaseUrl}files.json`);
      if (!rtdbRes.ok) {
        throw new Error(`Firebase RTDB returned status ${rtdbRes.status} (${rtdbRes.statusText})`);
      }
      const files = await rtdbRes.json() || {};
      
      const ownerEmail = url.searchParams.get('ownerEmail');
      let filesList = Object.values(files).filter(f => f && f.fileId && (f.fileName || f.originalName));
      
      if (ownerEmail) {
        filesList = filesList.filter(f => f.ownerEmail === ownerEmail);
      }
      
      return new Response(JSON.stringify(filesList), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. GET SINGLE FILE METADATA
    if (path.startsWith('/api/file-metadata/') && method === 'GET') {
      const fileId = path.substring('/api/file-metadata/'.length);
      const rtdbRes = await fetch(`${databaseUrl}files/${fileId}.json`);
      if (!rtdbRes.ok) {
        throw new Error(`Firebase RTDB metadata fetch returned status ${rtdbRes.status}`);
      }
      const file = await rtdbRes.json();
      if (!file) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(file), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. GET PRESIGNED UPLOAD PARAMS
    if (path === '/api/get-upload-url') {
      let fileName = 'file';
      if (method === 'POST') {
        try {
          const body = await request.clone().json();
          fileName = body.fileName || 'file';
        } catch (e) {}
      } else {
        fileName = url.searchParams.get('fileName') || 'file';
      }

      // Latency calculation & find fastest account
      let fastestAcct;
      try {
        fastestAcct = await findFastestAccount(b2Accounts);
      } catch (err) {
        throw new Error(`Latency discovery routing failed: ${err.message}`);
      }

      if (!fastestAcct) {
        throw new Error('No active Backblaze storage account could be selected.');
      }

      // Authenticate with Backblaze B2 Native API
      const authData = await b2AuthorizeAccount(fastestAcct.keyId, fastestAcct.appKey);
      const bucketId = await b2ListBuckets(authData.apiUrl, authData.authorizationToken, authData.accountId, fastestAcct.bucket);
      const uploadData = await b2GetUploadUrl(authData.apiUrl, authData.authorizationToken, bucketId);

      // Generate a unique file name/ID to prevent collisions in the bucket
      const uniqueKey = `${Date.now()}-${fileName}`;

      return new Response(JSON.stringify({
        uploadUrl: uploadData.uploadUrl,
        uploadAuthToken: uploadData.authorizationToken,
        b2FileId: uniqueKey,
        b2AccountEmail: fastestAcct.email,
        b2BucketName: fastestAcct.bucket
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3b. PROXY UPLOAD FALLBACK ROUTE
    if (path === '/api/upload-fallback' && method === 'POST') {
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      const encodedFileName = request.headers.get('X-File-Name') || 'file';
      const fileName = decodeURIComponent(encodedFileName);

      // Latency calculation & find fastest account
      let fastestAcct;
      try {
        fastestAcct = await findFastestAccount(b2Accounts);
      } catch (err) {
        throw new Error(`Latency discovery routing failed: ${err.message}`);
      }

      if (!fastestAcct) {
        throw new Error('No active Backblaze storage account could be selected.');
      }

      // Authenticate with Backblaze B2 Native API
      const authData = await b2AuthorizeAccount(fastestAcct.keyId, fastestAcct.appKey);
      const bucketId = await b2ListBuckets(authData.apiUrl, authData.authorizationToken, authData.accountId, fastestAcct.bucket);
      const uploadData = await b2GetUploadUrl(authData.apiUrl, authData.authorizationToken, bucketId);

      // Generate a unique file name/ID to prevent collisions in the bucket
      const uniqueKey = `${Date.now()}-${fileName}`;

      // Forward request body directly to Backblaze B2
      const fileBuffer = await request.arrayBuffer();

      const b2UploadRes = await fetch(uploadData.uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': uploadData.authorizationToken,
          'X-Bz-File-Name': encodeURIComponent(uniqueKey),
          'Content-Type': contentType,
          'X-Bz-Content-Sha1': 'do_not_verify'
        },
        body: fileBuffer
      });

      if (!b2UploadRes.ok) {
        const errText = await b2UploadRes.text();
        throw new Error(`B2 Upload via worker failed: ${errText}`);
      }

      const b2Res = await b2UploadRes.json();

      return new Response(JSON.stringify({
        fileId: b2Res.fileId,
        b2FileId: uniqueKey,
        b2AccountEmail: fastestAcct.email,
        b2BucketName: fastestAcct.bucket
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. LOG COMPLETED UPLOAD METADATA
    if (path === '/api/upload-metadata' && method === 'POST') {
      const body = await request.json();
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
      } = body;

      const fileId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
      const metadata = {
        fileId,
        fileName,
        originalName: fileName,
        fileSize: Number(fileSize),
        mimeType: mimeType || 'application/octet-stream',
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

      // Write to Realtime Database REST API
      const rtdbRes = await fetch(`${databaseUrl}files/${fileId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });

      if (!rtdbRes.ok) {
        throw new Error(`Firebase RTDB write metadata failed with status ${rtdbRes.statusText}`);
      }

      return new Response(JSON.stringify({
        success: true,
        metadata
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. UPDATE THUMBNAIL
    if (path.startsWith('/api/file/') && path.endsWith('/thumbnail') && method === 'POST') {
      const fileId = path.substring('/api/file/'.length, path.length - '/thumbnail'.length);
      const { thumbnailUrl } = await request.json();
      
      const rtdbRes = await fetch(`${databaseUrl}files/${fileId}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnailUrl })
      });

      if (!rtdbRes.ok) {
        throw new Error(`Firebase RTDB failed to write thumbnail status: ${rtdbRes.statusText}`);
      }

      return new Response(JSON.stringify({ success: true, message: 'Thumbnail updated successfully' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 6. DOWNLOAD / FILE STREAM REDIRECTION
    if ((path.startsWith('/api/download/') || path.startsWith('/api/file/')) && method === 'GET') {
      let fileId = '';
      if (path.startsWith('/api/download/')) {
        fileId = path.substring('/api/download/'.length);
      } else {
        fileId = path.substring('/api/file/'.length);
      }

      if (!fileId || fileId.includes('/') || fileId.startsWith('preset-')) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fetch metadata from Firebase REST API
      const rtdbRes = await fetch(`${databaseUrl}files/${fileId}.json`);
      const metadata = await rtdbRes.json();
      if (!metadata) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Locate corresponding B2 account credentials
      const acct = b2Accounts.find(a => a.email === metadata.b2AccountEmail);
      if (!acct) {
        return new Response(JSON.stringify({ error: `Storage account ${metadata.b2AccountEmail} matching this file is not configured on Cloudflare.` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Authorize account to get token and URLs
      const authData = await b2AuthorizeAccount(acct.keyId, acct.appKey);
      const bucketId = await b2ListBuckets(authData.apiUrl, authData.authorizationToken, authData.accountId, acct.bucket);
      
      // Get download authorization token
      const downloadAuth = await b2GetDownloadAuthorization(authData.apiUrl, authData.authorizationToken, bucketId, metadata.b2FileId);

      // Construct download URL with original filename preservation in Content-Disposition
      const downloadUrl = `${authData.downloadUrl}/file/${acct.bucket}/${metadata.b2FileId}?Authorization=${downloadAuth.authorizationToken}&b2ContentDisposition=attachment%3B%20filename%3D%22${encodeURIComponent(metadata.fileName)}%22`;

      // Redirect client to direct presigned B2 URL with zero server load
      return new Response(null, {
        status: 302,
        headers: {
          'Location': downloadUrl,
          ...corsHeaders
        }
      });
    }

    // 7. DELETE FILE
    if (path.startsWith('/api/delete/') && method === 'DELETE') {
      const fileId = path.substring('/api/delete/'.length);
      if (!fileId || fileId.startsWith('preset-')) {
        return new Response(JSON.stringify({ success: true, message: 'Local or preset file removed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fetch metadata from Firebase REST API
      const rtdbRes = await fetch(`${databaseUrl}files/${fileId}.json`);
      const metadata = await rtdbRes.json();
      if (!metadata) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Delete from Backblaze B2 natively
      const acct = b2Accounts.find(a => a.email === metadata.b2AccountEmail);
      if (acct && metadata.b2NativeFileId) {
        try {
          const authData = await b2AuthorizeAccount(acct.keyId, acct.appKey);
          await b2DeleteFileVersion(authData.apiUrl, authData.authorizationToken, metadata.b2FileId, metadata.b2NativeFileId);
        } catch (b2Err) {
          console.warn(`[DELETE B2] Non-blocking warning: Failed to delete from B2: ${b2Err.message}`);
        }
      }

      // Remove from Firebase REST API
      await fetch(`${databaseUrl}files/${fileId}.json`, { method: 'DELETE' });

      return new Response(JSON.stringify({ success: true, message: 'File deleted successfully' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fallback: If no API routes matched, return 404
    return new Response(JSON.stringify({ error: `Endpoint '${path}' not found on Cloudflare Worker` }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error("Worker handler error:", err);
    return new Response(JSON.stringify({ error: `Cloudflare Worker Internal Error: ${err.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Pings each account's endpoint to determine network latency.
 */
async function findFastestAccount(accounts) {
  if (!accounts || accounts.length === 0) {
    throw new Error("No B2 accounts provided in configuration.");
  }

  const pingPromises = accounts.map(async (acct) => {
    let url = acct.endpoint || "https://api.backblazeb2.com";
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      // NOTE: Removed mode: 'no-cors' which is browser-specific and causes crash on V8 workers!
      await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      const latency = Date.now() - start;
      return { acct, latency };
    } catch (e) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        const latency = Date.now() - start;
        return { acct, latency };
      } catch (err2) {
        return { acct, latency: 9999 };
      }
    }
  });

  const results = await Promise.all(pingPromises);
  results.sort((a, b) => a.latency - b.latency);
  return results[0].acct;
}

/**
 * Authenticates with Backblaze B2 using Account Key Credentials.
 */
async function b2AuthorizeAccount(keyId, appKey) {
  const credentials = btoa(`${keyId}:${appKey}`);
  const res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    method: "GET",
    headers: {
      "Authorization": `Basic ${credentials}`
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 Authorize failed (${res.status}): ${text}`);
  }
  return await res.json();
}

/**
 * Retrieves the bucketId for the specified bucketName.
 */
async function b2ListBuckets(apiUrl, authorizationToken, accountId, bucketName) {
  const res = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: {
      "Authorization": authorizationToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ accountId, bucketName })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 List Buckets failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.buckets || data.buckets.length === 0) {
    throw new Error(`Bucket "${bucketName}" not found in B2 account`);
  }
  return data.buckets[0].bucketId;
}

/**
 * Generates an upload URL and upload token for a bucket.
 */
async function b2GetUploadUrl(apiUrl, authorizationToken, bucketId) {
  const res = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: {
      "Authorization": authorizationToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bucketId })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 Get Upload URL failed (${res.status}): ${text}`);
  }
  return await res.json();
}

/**
 * Generates download authorization token for presigned download links.
 */
async function b2GetDownloadAuthorization(apiUrl, authorizationToken, bucketId, fileName, validDurationInSeconds = 3600) {
  const res = await fetch(`${apiUrl}/b2api/v2/b2_get_download_authorization`, {
    method: "POST",
    headers: {
      "Authorization": authorizationToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bucketId, fileNamePrefix: fileName, validDurationInSeconds })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 Get Download Authorization failed (${res.status}): ${text}`);
  }
  return await res.json();
}

/**
 * Deletes a file version in Backblaze B2.
 */
async function b2DeleteFileVersion(apiUrl, authorizationToken, fileName, fileId) {
  const res = await fetch(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: "POST",
    headers: {
      "Authorization": authorizationToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fileName, fileId })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 Delete File Version failed (${res.status}): ${text}`);
  }
  return await res.json();
}

// ---------------------------------------------------------
// EXPORTS FOR DUAL COMPATIBILITY: Pages Functions & Standard Workers
// ---------------------------------------------------------

// Support 1: Cloudflare Pages Functions
export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}

// Support 2: Standalone Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};
