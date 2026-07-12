import 'dotenv/config';
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

interface B2Account {
  email: string;
  bucket: string;
  keyId: string;
  appKey: string;
  endpoint: string;
  region: string;
}

async function main() {
  const jsonStr = process.env.B2_ACCOUNTS_JSON;
  if (!jsonStr) {
    console.error("No B2_ACCOUNTS_JSON found.");
    return;
  }
  
  const b2Accounts: B2Account[] = JSON.parse(jsonStr);
  
  for (const acct of b2Accounts) {
    console.log(`Setting CORS for bucket ${acct.bucket}...`);
    let endpoint = (acct.endpoint || '').trim();
    if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      endpoint = 'https://' + endpoint;
    }
    const s3 = new S3Client({
      region: acct.region,
      endpoint,
      credentials: {
        accessKeyId: acct.keyId,
        secretAccessKey: acct.appKey,
      }
    });

    const command = new PutBucketCorsCommand({
      Bucket: acct.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600
          }
        ]
      }
    });

    try {
      await s3.send(command);
      console.log(`Successfully updated CORS for ${acct.bucket}`);
    } catch (err) {
      console.error(`Failed to update CORS for ${acct.bucket}:`, err);
    }
  }
}

main().catch(console.error);
