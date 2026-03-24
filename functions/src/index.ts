import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

// 🔐 SECURITY: Rate Limiter — max requests per user per hour per action
const checkRateLimit = async (uid: string, action: string, maxRequests: number): Promise<boolean> => {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window
  const docRef = admin.firestore().collection("rateLimits").doc(`${uid}_${action}`);

  const doc = await docRef.get();
  if (doc.exists) {
    const data = doc.data()!;
    // Reset window if it has expired
    if (now - data.windowStart > windowMs) {
      await docRef.set({ count: 1, windowStart: now });
      return true;
    }
    // Block if limit exceeded
    if (data.count >= maxRequests) return false;
    await docRef.update({ count: admin.firestore.FieldValue.increment(1) });
    return true;
  }
  // First request from this user for this action
  await docRef.set({ count: 1, windowStart: now });
  return true;
};

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

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: "Invalid Token" });
      return;
    }

    // 🔐 SECURITY: Rate limit — 20 upload requests per user per hour
    const allowed = await checkRateLimit(decodedToken.uid, "upload", 20);
    if (!allowed) {
      res.status(429).json({ error: "Too many upload requests. Please try again later." });
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

// ✅ 2.5 DELETE FILE FROM R2 (Fixes Storage Leak)
export const deleteR2File = onRequest((req, res) => {
  cors(req, res, async () => {
    // A. Security Check: Ensure user is logged in
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const idToken = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: "Invalid Token" });
      return;
    }

    // 🔐 SECURITY: Rate limit — 30 delete requests per user per hour
    const allowed = await checkRateLimit(decodedToken.uid, "delete", 30);
    if (!allowed) {
      res.status(429).json({ error: "Too many delete requests. Please try again later." });
      return;
    }

    // B. Get File URL
    const { fileUrl } = req.body;
    if (!fileUrl) {
      res.status(400).json({ error: "Missing file URL" });
      return;
    }

    try {
      // C. Extract Key from URL
      const urlObj = new URL(fileUrl);
      const key = decodeURIComponent(urlObj.pathname.substring(1)); 

      // D. Issue Delete Command to R2
      const command = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      });

      await r2Client.send(command);

      res.status(200).json({ success: true, message: "File permanently deleted from R2" });

    } catch (error) {
      console.error("Error deleting file from R2:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

// 🔐 SECURITY: Create Post via Cloud Function (Rate Limited)
export const createPost = onRequest((req, res) => {
  cors(req, res, async () => {
    // A. Security Check: Ensure user is logged in
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const idToken = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: "Invalid Token" });
      return;
    }

    // B. Rate limit — 5 posts per hour per user
    const allowed = await checkRateLimit(decodedToken.uid, "createPost", 5);
    if (!allowed) {
      res.status(429).json({ error: "You are posting too fast. Please wait before posting again." });
      return;
    }

    // C. Validate inputs
    const { text, mediaUrl, mediaType, tags, displayName, username, userAvatar, role } = req.body;
    if (!text && !mediaUrl) {
      res.status(400).json({ error: "Post must have text or media." });
      return;
    }
    if (text && text.length > 120) {
      res.status(400).json({ error: "Post text cannot exceed 120 characters." });
      return;
    }
    if (!tags || tags.length === 0 || tags.length > 3) {
      res.status(400).json({ error: "Post must have between 1 and 3 tags." });
      return;
    }

    try {
      // D. Write post to Firestore
      const newPostRef = admin.firestore().collection("posts").doc();
      const batch = admin.firestore().batch();

      batch.set(newPostRef, {
        text: text || "",
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        userId: decodedToken.uid,
        displayName: displayName || "Anonymous",
        username: username || "anonymous",
        userAvatar: userAvatar || null,
        role: role || "user", 
        isRepost: false, // ✅ FIXED: Safely adds the isRepost field to prevent query errors
        tags: tags,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        likes: [],
        reposts: [],
        likeCount: 0,
        repostCount: 0,
        commentCount: 0,
        parentId: null,
        views: 0
      });

      const userRef = admin.firestore().collection("users").doc(decodedToken.uid);
      batch.update(userRef, { lastPostedAt: admin.firestore.FieldValue.serverTimestamp() });

      await batch.commit();

      res.status(200).json({ success: true, postId: newPostRef.id });

    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

// 🔐 SECURITY: Create Comment via Cloud Function (Rate Limited)
export const createComment = onRequest((req, res) => {
  cors(req, res, async () => {
    // A. Security Check: Ensure user is logged in
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const idToken = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: "Invalid Token" });
      return;
    }

    // B. Rate limit — 20 comments per hour per user
    const allowed = await checkRateLimit(decodedToken.uid, "createComment", 20);
    if (!allowed) {
      res.status(429).json({ error: "You are commenting too fast. Please wait before commenting again." });
      return;
    }

    // C. Validate inputs
    const { text, parentId, displayName, username, userAvatar, role } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: "Comment cannot be empty." });
      return;
    }
    if (text.length > 300) {
      res.status(400).json({ error: "Comment cannot exceed 300 characters." });
      return;
    }
    if (!parentId) {
      res.status(400).json({ error: "Missing parent post ID." });
      return;
    }

    try {
      // D. Write comment and update parent post count
      const newCommentRef = admin.firestore().collection("posts").doc();
      const batch = admin.firestore().batch();

      batch.set(newCommentRef, {
        text: text,
        userId: decodedToken.uid,
        username: username || "anonymous",
        displayName: displayName || "Anonymous",
        userAvatar: userAvatar || null,
        role: role || "user",
        isRepost: false, // ✅ FIXED: Keeps the entire database schema perfectly uniform
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        parentId: parentId,
        likes: [],
        reposts: [],
        likeCount: 0,
        repostCount: 0,
        commentCount: 0,
        views: 0
      });

      const parentPostRef = admin.firestore().collection("posts").doc(parentId);
      batch.update(parentPostRef, { commentCount: admin.firestore.FieldValue.increment(1) });

      const userRef = admin.firestore().collection("users").doc(decodedToken.uid);
      batch.update(userRef, { lastPostedAt: admin.firestore.FieldValue.serverTimestamp() });

      await batch.commit();

      res.status(200).json({ success: true, commentId: newCommentRef.id });

    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

// 🔐 SECURITY: Create Support Message via Cloud Function (Rate Limited)
export const createSupportMessage = onRequest((req, res) => {
  cors(req, res, async () => {
    // A. Security Check: Ensure user is logged in
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const idToken = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: "Invalid Token" });
      return;
    }

    // B. Rate limit — 20 messages per hour per user
    const allowed = await checkRateLimit(decodedToken.uid, "supportMessage", 20);
    if (!allowed) {
      res.status(429).json({ error: "You are sending too many messages. Please wait before sending again." });
      return;
    }

    // C. Validate inputs
    const ticketId = req.body.ticketId || req.body.id || req.body.ticketID;
    const text = req.body.text || "";
    const imageUrl = req.body.imageUrl || null;
    
    if (!ticketId) {
      res.status(400).json({ error: "Missing ticket ID." });
      return;
    }
    if (!text.trim() && !imageUrl) {
      res.status(400).json({ error: "Message must have text or an image." });
      return;
    }
    if (text && text.length > 500) {
      res.status(400).json({ error: "Message cannot exceed 500 characters." });
      return;
    }

    try {
      // D. Verify ticket belongs to this user
      const ticketRef = admin.firestore().collection("supportTickets").doc(ticketId);
      const ticketSnap = await ticketRef.get();
      
      const ticketData = ticketSnap.data() || {};
      const ticketOwner = ticketData.userId || ticketData.uid || ticketData.senderId;
      
      if (!ticketSnap.exists || ticketOwner !== decodedToken.uid) {
        res.status(403).json({ error: "Forbidden. You do not own this ticket." });
        return;
      }

      // E. Write message and update ticket
      const batch = admin.firestore().batch();

      const msgRef = admin.firestore()
        .collection("supportTickets")
        .doc(ticketId)
        .collection("messages")
        .doc();

      batch.set(msgRef, {
        senderId: decodedToken.uid,
        senderModel: 'user',
        text: text?.trim() || "",
        imageUrl: imageUrl || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      batch.update(ticketRef, {
        lastMessage: text?.trim() || 'Sent an attachment',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        unreadAdmin: true
      });

      await batch.commit();

      res.status(200).json({ success: true });

    } catch (error) {
      console.error("Error creating support message:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

// 🔐 SECURITY: Create Report via Cloud Function (Rate Limited)
export const createReport = onRequest((req, res) => {
  cors(req, res, async () => {
    // A. Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const idToken = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: "Invalid Token" });
      return;
    }

    // B. Rate limit — 5 reports per hour per user
    const allowed = await checkRateLimit(decodedToken.uid, "createReport", 5);
    if (!allowed) {
      res.status(429).json({ error: "You are reporting too fast. Please wait before submitting another report." });
      return;
    }

    // C. Validate inputs
    const { type, targetId, targetContent, targetName, reason, userId } = req.body;
    if (!type || !targetId || !reason) {
      res.status(400).json({ error: "Missing required fields." });
      return;
    }

    try {
      // D. Write report
      await admin.firestore().collection("reports").add({
        type,
        targetId,
        targetContent: targetContent || null,
        targetName: targetName || null,
        userId: userId || targetId,
        reportedBy: decodedToken.uid,
        reason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending"
      });

      res.status(200).json({ success: true });

    } catch (error) {
      console.error("Error creating report:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

// 3. AUTO-MODERATE NEW POSTS & COMMENTS USING GOOGLE GEMINI
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

// 4. AUTO-SEND SPECIFIC USER NOTIFICATIONS (Social & Direct Admin)
export const sendTargetedPushNotification = onDocumentCreated("users/{userId}/notifications/{notificationId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const notifData = snapshot.data();
    const userId = event.params.userId;

    // Don't send push if it's already read or missing title/body
    if (notifData.read || !notifData.title || !notifData.body) return;

    try {
        const userDoc = await admin.firestore().doc(`users/${userId}`).get();
        if (!userDoc.exists) return;

        const pushToken = userDoc.data()?.expoPushToken;
        if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return;

        const message = {
            to: pushToken,
            sound: 'default',
            title: notifData.title,
            body: notifData.body,
            data: { targetId: notifData.targetId, type: notifData.type }, // Deep linking data
            badge: 1, // Increments app icon badge
            threadId: 'aniyu_social', // iOS Grouping ID
            categoryId: 'social_interaction', // iOS Category
            channelId: 'social-updates', // Android Grouping Channel
        };

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        const result = await response.json();
        
        // Token Cleanup: If device is no longer registered, remove the dead token
        if (result.errors || (result.data && result.data.status === 'error' && result.data.details?.error === 'DeviceNotRegistered')) {
            console.log(`🧹 Cleaning up dead token for user: ${userId}`);
            await admin.firestore().doc(`users/${userId}`).update({ expoPushToken: admin.firestore.FieldValue.delete() });
        }
    } catch (error) {
        console.error("Error sending targeted push:", error);
    }
});

// 5. AUTO-SEND GLOBAL BROADCASTS (Scalable Batching)
export const sendGlobalBroadcastPush = onDocumentCreated("announcements/{announcementId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const announcement = snapshot.data();
    if (announcement.type !== 'system_broadcast' && announcement.targetId !== 'all') return;

    try {
        console.log("🚀 Starting Global Broadcast via Cloud Functions...");
        
        // Fetch users in chunks (Scalable approach)
        const usersRef = admin.firestore().collection("users");
        let lastDoc: any = null;
        let hasMore = true;
        let totalSent = 0;

        while (hasMore) {
            let q = usersRef.select("expoPushToken").limit(500);
            
            if (lastDoc) {
                q = q.startAfter(lastDoc);
            }

            const querySnapshot = await q.get();

            if (querySnapshot.empty) {
                hasMore = false;
                break;
            }

            const validTokens = querySnapshot.docs
                .map(doc => doc.data().expoPushToken)
                .filter(token => token && typeof token === 'string' && token.startsWith('ExponentPushToken'));

            if (validTokens.length > 0) {
                const messages = validTokens.map(token => ({
                    to: token,
                    sound: 'default',
                    title: announcement.title,
                    body: announcement.body,
                    badge: 1,
                    threadId: 'aniyu_announcements', // Separate iOS group for admin
                    categoryId: 'admin_broadcast',
                    channelId: 'admin-broadcasts', // Separate Android channel
                }));

                // Send in chunks of 100 (Expo API Limit)
                const fetchPromises = [];
                for (let i = 0; i < messages.length; i += 100) {
                    const chunk = messages.slice(i, i + 100);
                    fetchPromises.push(
                        fetch('https://exp.host/--/api/v2/push/send', {
                            method: 'POST',
                            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                            body: JSON.stringify(chunk),
                        })
                    );
                }
                
                // Process the 500-user batch concurrently
                await Promise.all(fetchPromises);
                totalSent += validTokens.length;
            }

            if (querySnapshot.docs.length < 500) {
                hasMore = false; // We reached the end of the database
            } else {
                lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1]; // Set cursor for next loop
            }
        }
        
        console.log(`✅ Broadcast successfully queued for ${totalSent} devices.`);
    } catch (error) {
        console.error("Error sending broadcast:", error);
    }
});