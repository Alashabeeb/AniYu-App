import { getToken } from 'firebase/app-check'; // ✅ IMPORTED APP CHECK
import { appCheck, auth } from '../config/firebaseConfig'; // ✅ IMPORTED APP CHECK INSTANCE

// ⚠️ REPLACE WITH YOUR DEPLOYED CLOUD FUNCTION URLs
const CLOUD_FUNCTION_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/generateUploadUrl"; 
const DELETE_CLOUD_FUNCTION_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/deleteR2File"; 

export const uploadToR2 = async (uri: string, folderPath: string): Promise<string> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("User must be logged in to upload");

    const isVideo = blob.type.startsWith('video/') || uri.endsWith('.mp4');
    const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
    const fileName = uri.split('/').pop() || `upload.${isVideo ? 'mp4' : 'jpg'}`;

    const idToken = await currentUser.getIdToken();
    const appCheckTokenResponse = await getToken(appCheck, false); // ✅ GRAB VIP PASS

    const apiRes = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            'X-Firebase-AppCheck': appCheckTokenResponse.token // ✅ INJECT VIP PASS
        },
        body: JSON.stringify({
            folder: folderPath,
            fileName: fileName,
            contentType: contentType
        })
    });

    if (!apiRes.ok) throw new Error("Failed to get upload permission");
    const { uploadUrl, publicUrl } = await apiRes.json();

    const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob
    });

    if (!uploadRes.ok) throw new Error("Upload to Cloudflare failed");

    return publicUrl;
  } catch (error) {
    console.error("R2 Upload Error:", error);
    throw error;
  }
};

export const deleteFromR2 = async (fileUrl: string): Promise<void> => {
  try {
    if (!fileUrl) return;

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("User must be logged in to delete");

    const idToken = await currentUser.getIdToken();
    const appCheckTokenResponse = await getToken(appCheck, false); // ✅ GRAB VIP PASS

    const apiRes = await fetch(DELETE_CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            'X-Firebase-AppCheck': appCheckTokenResponse.token // ✅ INJECT VIP PASS
        },
        body: JSON.stringify({ fileUrl: fileUrl })
    });

    if (!apiRes.ok) {
        console.error("Cloud Function refused to delete the file or it wasn't found.");
    }
  } catch (error) {
    console.error("R2 Delete Error:", error);
  }
};