import { auth } from '../config/firebaseConfig';

// ⚠️ REPLACE WITH YOUR DEPLOYED CLOUD FUNCTION URLs
const CLOUD_FUNCTION_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/generateUploadUrl"; 
const DELETE_CLOUD_FUNCTION_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/deleteR2File"; 

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

// ✅ NEW: Securely request the Cloud Function to delete the file from R2
export const deleteFromR2 = async (fileUrl: string): Promise<void> => {
  try {
    if (!fileUrl) return;

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("User must be logged in to delete");

    // 1. Get ID Token to prove who is making the request
    const idToken = await currentUser.getIdToken();

    // 2. Ask Server to delete the file
    const apiRes = await fetch(DELETE_CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
            fileUrl: fileUrl
        })
    });

    if (!apiRes.ok) {
        console.error("Cloud Function refused to delete the file or it wasn't found.");
    }

  } catch (error) {
    console.error("R2 Delete Error:", error);
    // We intentionally don't throw the error here so that if the image was already 
    // deleted manually, it doesn't crash the post deletion process in the app.
  }
};