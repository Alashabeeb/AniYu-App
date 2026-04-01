/**
 * Universal Error Handler for AniYu
 * Translates raw backend/Firebase errors into clean, user-friendly messages.
 */

export const getFriendlyErrorMessage = (error: any): string => {
    // 1. Safety Check: If there's no error, return a generic fallback.
    if (!error) return "Something went wrong. Please try again.";

    // 2. Extract the raw error string
    const errString = typeof error === 'string' ? error : (error?.message || error?.code || JSON.stringify(error));

    const lowerErr = errString.toLowerCase();

    // ==========================================
    // 🛡️ SECURITY & APP CHECK ERRORS
    // ==========================================
    if (lowerErr.includes('app check') || lowerErr.includes('token-error') || lowerErr.includes('appcheck')) {
        return "Security verification failed. Please ensure you are using the official AniYu app from the Play Store.";
    }
    if (lowerErr.includes('unauthorized') || lowerErr.includes('invalid token')) {
        return "Your session has expired. Please log out and log back in.";
    }

    // ==========================================
    // 🚦 RATE LIMITS & PERMISSIONS (Cloud Functions)
    // ==========================================
    if (lowerErr.includes('permission-denied') || lowerErr.includes('429')) {
        return "You are performing actions too quickly. Please wait a moment and try again.";
    }
    if (lowerErr.includes('too fast') || lowerErr.includes('too many')) {
        // Return the exact rate limit message sent from our Cloud Functions
        return errString; 
    }

    // ==========================================
    // 🌐 NETWORK & TIMEOUTS
    // ==========================================
    if (lowerErr.includes('network_timeout') || lowerErr.includes('timeout')) {
        return "Connection timed out. Please check your internet and try again.";
    }
    if (lowerErr.includes('network-request-failed') || lowerErr.includes('fetch')) {
        return "Network error. Please check your Wi-Fi or cellular data.";
    }

    // ==========================================
    // 👤 FIREBASE AUTHENTICATION ERRORS
    // ==========================================
    if (lowerErr.includes('auth/invalid-credential') || lowerErr.includes('auth/wrong-password')) {
        return "The email or password you entered is incorrect.";
    }
    if (lowerErr.includes('auth/user-not-found')) {
        return "No account exists with this email address.";
    }
    if (lowerErr.includes('auth/email-already-in-use')) {
        return "An account already exists with this email address.";
    }
    if (lowerErr.includes('auth/weak-password')) {
        return "Your password is too weak. It must be at least 6 characters long.";
    }
    if (lowerErr.includes('auth/invalid-email')) {
        return "Please enter a valid email address.";
    }
    if (lowerErr.includes('auth/user-disabled')) {
        return "This account has been disabled for violating our community guidelines.";
    }
    if (lowerErr.includes('auth/requires-recent-login')) {
        return "For your security, please log out and log back in to perform this action.";
    }

    // ==========================================
    // 📦 UPLOAD & MEDIA ERRORS
    // ==========================================
    if (lowerErr.includes('file too large') || lowerErr.includes('payload too large')) {
        return "The file you selected is too large. Please choose a smaller file.";
    }

    // ==========================================
    // 🛑 FALLBACK (Catch-All)
    // ==========================================
    // If it's a clean string from our backend, just return it. Otherwise, generic error.
    if (errString.length > 5 && errString.length < 100 && !errString.includes('FirebaseError')) {
        return errString;
    }

    return "An unexpected error occurred. Our team has been notified.";
};