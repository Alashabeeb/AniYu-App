import { auth } from '../firebase'; // Ensure this points to your firebase config

const CLOUD_FUNCTION_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/generateUploadUrl";

export const uploadToR2 = async (file, folderPath, onProgress) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Unauthorized");

    // 1. Get Token
    const idToken = await currentUser.getIdToken();

    // 2. Request URL
    const apiRes = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
            folder: folderPath,
            fileName: file.name,
            contentType: file.type
        })
    });

    if (!apiRes.ok) throw new Error("Server refused upload request");
    const { uploadUrl, publicUrl } = await apiRes.json();

    // 3. Upload using XMLHttpRequest (Better for Progress Tracking)
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                const percent = Math.round((event.loaded / event.total) * 100);
                onProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ url: publicUrl, size: file.size });
            } else {
                reject(new Error("Upload failed"));
            }
        };

        xhr.onerror = () => reject(new Error("Network error"));

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
    });

  } catch (error) {
    console.error("R2 Upload Error:", error);
    throw error;
  }
};