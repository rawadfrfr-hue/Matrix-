import fs from 'fs';
const file = fs.readFileSync('server.ts', 'utf8');

const newRoutes = `
  // MULTIPART UPLOAD: START
  app.post('/api/upload/multipart/start', async (req, res) => {
    try {
      const { fileName, fileSize, fileType } = req.body;
      if (!fileName || fileSize == null) {
        return res.status(400).json({ error: 'Missing file metadata' });
      }

      let selectedAccount;
      try {
        selectedAccount = selectB2Account(fileSize);
      } catch (lbErr) {
        console.error(\`[Upload Load Balancer] Failed to select account: \${lbErr.message}\`);
        return res.status(507).json({ error: lbErr.message });
      }
      
      const s3 = getS3Client(selectedAccount);
      const uniqueKey = \`\${Date.now()}-\${fileName}\`;
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
    } catch (error) {
      console.error('Multipart start error:', error);
      res.status(500).json({ error: error.message || 'Multipart start failed' });
    }
  });

  // MULTIPART UPLOAD: PRESIGN PART
  app.post('/api/upload/multipart/presign-part', async (req, res) => {
    try {
      const { uploadId, key, partNumber, uploadDetails } = req.body;
      if (!uploadId || !key || !partNumber || !uploadDetails) {
        return res.status(400).json({ error: 'Missing part metadata' });
      }

      const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
      const selectedAccount = b2Accounts.find((a: any) => a.email === uploadDetails.b2AccountEmail);
      if (!selectedAccount) {
         return res.status(404).json({ error: 'B2 Account not found' });
      }

      const s3 = getS3Client(selectedAccount);

      const command = new UploadPartCommand({
        Bucket: selectedAccount.bucket,
        Key: key,
        PartNumber: partNumber,
        UploadId: uploadId
      });

      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      
      res.json({
        success: true,
        presignedUrl
      });
    } catch (error) {
      console.error('Multipart presign part error:', error);
      res.status(500).json({ error: error.message || 'Presign part failed' });
    }
  });

  // MULTIPART UPLOAD: COMPLETE
  app.post('/api/upload/multipart/complete', async (req, res) => {
    try {
      const { uploadId, key, parts, uploadDetails, parentId, ownerEmail } = req.body;
      if (!uploadId || !key || !parts || !uploadDetails) {
        return res.status(400).json({ error: 'Missing complete metadata' });
      }

      const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
      const selectedAccount = b2Accounts.find((a: any) => a.email === uploadDetails.b2AccountEmail);
      if (!selectedAccount) {
         return res.status(404).json({ error: 'B2 Account not found' });
      }

      const s3 = getS3Client(selectedAccount);

      // Sort parts by part number just in case
      parts.sort((a: any, b: any) => a.PartNumber - b.PartNumber);

      const command = new CompleteMultipartUploadCommand({
        Bucket: selectedAccount.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
        }
      });

      await s3.send(command);

      // Now create db record
      const db = getDb();
      const newFileId = randomUUID();
      const newFile = {
        id: newFileId,
        name: uploadDetails.fileName,
        type: 'file',
        parentId: parentId || null,
        ownerEmail: ownerEmail || null,
        size: uploadDetails.fileSize,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mimeType: uploadDetails.contentType,
        b2AccountEmail: uploadDetails.b2AccountEmail,
        b2BucketName: uploadDetails.b2BucketName,
        b2FileId: uploadDetails.b2FileId
      };
      
      db.files.push(newFile);
      saveDb(db);

      res.json({ success: true, file: newFile });
    } catch (error) {
      console.error('Multipart complete error:', error);
      res.status(500).json({ error: error.message || 'Multipart complete failed' });
    }
  });

  // MULTIPART UPLOAD: ABORT
  app.post('/api/upload/multipart/abort', async (req, res) => {
    try {
      const { uploadId, key, uploadDetails } = req.body;
      if (!uploadId || !key || !uploadDetails) {
        return res.status(400).json({ error: 'Missing abort metadata' });
      }

      const b2Accounts = JSON.parse(process.env.B2_ACCOUNTS_JSON || '[]');
      const selectedAccount = b2Accounts.find((a: any) => a.email === uploadDetails.b2AccountEmail);
      if (!selectedAccount) {
         return res.status(404).json({ error: 'B2 Account not found' });
      }

      const s3 = getS3Client(selectedAccount);

      const command = new AbortMultipartUploadCommand({
        Bucket: selectedAccount.bucket,
        Key: key,
        UploadId: uploadId
      });

      await s3.send(command);
      res.json({ success: true });
    } catch (error) {
      console.error('Multipart abort error:', error);
      res.status(500).json({ error: error.message || 'Multipart abort failed' });
    }
  });
`;

const updated = file.replace(
  "  app.post('/api/file/:fileId/thumbnail', async (req, res) => {",
  newRoutes + "\n  app.post('/api/file/:fileId/thumbnail', async (req, res) => {"
);

fs.writeFileSync('server.ts', updated);
console.log('patched');
