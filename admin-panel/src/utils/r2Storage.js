import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// ⚠️ REPLACE THESE WITH YOUR CLOUDFLARE R2 CREDENTIALS
const R2_ACCOUNT_ID = "1c9132e00f11d0d6aa4dea1120e0cead";
const R2_ACCESS_KEY_ID = "d1de6a81dc06db546dc3ab8e0f988f3e";
const R2_SECRET_ACCESS_KEY = "60404fc8d17a116e968c5345899f44e0b745bf690b702af62f8a3643f1e34d08";
const R2_BUCKET_NAME = "aniyu-media";
// This is your R2 Public URL (e.g., https://pub-xxx.r2.dev or https://media.aniyu.com)
const R2_PUBLIC_DOMAIN = "https://pub-aa447ea7a31940e688190fd6f33a3f35.r2.dev"; 

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const uploadToR2 = async (file, folderPath, onProgress) => {
  try {
    // Clean filename to prevent URL issues
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const key = `${folderPath}/${fileName}`;

    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: file.type,
      },
    });

    upload.on("httpUploadProgress", (progress) => {
      if (onProgress && progress.total) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        onProgress(percentage);
      }
    });

    await upload.done();

    return {
      url: `${R2_PUBLIC_DOMAIN}/${key}`,
      size: file.size
    };
  } catch (error) {
    console.error("R2 Upload Error:", error);
    throw error;
  }
};