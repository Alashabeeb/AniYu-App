import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
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

// 3. ✅ AUTO-MODERATE NEW POSTS & COMMENTS USING GOOGLE GEMINI
export const moderateNewPost = onDocumentCreated("posts/{postId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const newPost = snapshot.data();
  const postId = event.params.postId;

  // If there's no text, skip moderation (e.g., image-only post)
  if (!newPost.text) return;

  // Determine if this is a main post or a comment
  const isComment = !!newPost.parentId;
  const contentTypeLabel = isComment ? "comment" : "post";

  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.error("Missing GEMINI_API_KEY in environment variables.");
        return;
    }

    // ✅ SURGICAL UPDATE: Added Rule #5 to catch negative app reviews/complaints
    const prompt = `You are a strict auto-moderator for an Anime community app. Evaluate the following user ${contentTypeLabel}. 
Flag it if it contains ANY of the following: 1. Hate speech or extreme toxicity. 2. Harassment or bullying. 3. Explicit or NSFW content. 4. Major Anime/Manga spoilers without warning. 5. Negative comments, complaints, or slander specifically directed at this app or its developers. 
Return ONLY a valid JSON object in this exact format: {"flagged": boolean, "reason": "string explaining exactly which rule was broken, or empty if clean"}. 
Text: "${newPost.text}"`;

    // Call the free Google Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
            responseMimeType: "application/json", 
            temperature: 0.1 
        }
      })
    });

    const result = await response.json();

    if (!result.candidates || !result.candidates[0].content.parts[0].text) {
      console.error("Invalid response from Gemini", result);
      return;
    }

    // Parse the JSON returned by Gemini
    const rawText = result.candidates[0].content.parts[0].text;
    const moderationData = JSON.parse(rawText);

    // Check if Gemini flagged the content
    if (moderationData.flagged) {
      
      const brokenRules = moderationData.reason || "General Violation";
      console.log(`🚨 ${contentTypeLabel} ${postId} flagged for: ${brokenRules}`);

      // ACTION 1: Tag the post with explicit User UID and Content Type
      await snapshot.ref.update({
        moderationFlag: brokenRules,
        flaggedUserUid: newPost.userId || "Unknown", 
        flaggedContentType: contentTypeLabel         
      });

      // ACTION 2: Create a ticket in the Admin Panel "Reports" collection
      await admin.firestore().collection("reports").add({
        targetId: postId,
        targetType: contentTypeLabel, 
        targetContent: newPost.text.length > 100 ? newPost.text.substring(0, 100) + '...' : newPost.text,
        reportedBy: "Gemini Auto-Mod",
        reason: `Auto-Flagged: ${brokenRules}`,
        status: "pending",
        userId: newPost.userId || "Unknown",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
    } else {
      console.log(`✅ ${contentTypeLabel} ${postId} passed moderation.`);
    }

  } catch (error) {
    console.error("Error during Gemini auto-moderation:", error);
  }
});