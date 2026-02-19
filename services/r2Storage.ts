import { auth } from '../config/firebaseConfig';

// ⚠️ REPLACE WITH YOUR DEPLOYED CLOUD FUNCTION URL
const CLOUD_FUNCTION_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/generateUploadUrl"; 

export const uploadToR2 = async (uri: string, folderPath: string): Promise<string> => {
  try {
    // 1. Prepare File
    const response = await fetch(uri);
    const blob = await response.blob();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("User must be logged in to upload");

    // Determine type
    const isVideo = blob.type.startsWith('video/') || uri.endsWith('.mp4');
    const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
    const fileName = uri.split('/').pop() || `upload.${isVideo ? 'mp4' : 'jpg'}`;

    // 2. Get ID Token (Security)
    const idToken = await currentUser.getIdToken();

    // 3. Ask Server for a Presigned URL
    const apiRes = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
            folder: folderPath,
            fileName: fileName,
            contentType: contentType
        })
    });

    if (!apiRes.ok) throw new Error("Failed to get upload permission");
    const { uploadUrl, publicUrl } = await apiRes.json();

    // 4. Upload to R2 using the Presigned URL
    const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': contentType 
        },
        body: blob
    });

    if (!uploadRes.ok) throw new Error("Upload to Cloudflare failed");

    return publicUrl;

  } catch (error) {
    console.error("R2 Upload Error:", error);
    throw error;
  }
};