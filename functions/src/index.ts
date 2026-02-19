import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

// Using require for cors to avoid type issues if @types/cors isn't installed
const cors = require("cors")({ origin: true });

admin.initializeApp();

// 1. CONFIGURE R2 CLIENT
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

// 2. GENERATE UPLOAD URL FUNCTION
export const generateUploadUrl = onRequest((req, res) => {
  cors(req, res, async () => {
    // A. Security Check: Ensure user is logged in
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const idToken = authHeader.split("Bearer ")[1];

    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: "Invalid Token" });
      return;
    }

    // B. Get File Details
    const { folder, fileName, contentType } = req.body;
    if (!folder || !fileName || !contentType) {
      res.status(400).json({ error: "Missing file details" });
      return;
    }

    // C. Create Key
    const key = `${folder}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, "_")}`;

    try {
      // D. Generate Presigned URL
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

      // E. Return Response
      res.status(200).json({
        uploadUrl,
        publicUrl: `${process.env.R2_PUBLIC_DOMAIN}/${key}`
      });

    } catch (error) {
      console.error("Error generating URL:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});