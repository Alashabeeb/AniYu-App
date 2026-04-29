/**
 * AniYu Error Handler
 * Converts raw Firebase / network / app errors into friendly, anime-styled messages.
 * Used globally across all screens via CustomAlert.
 */

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AppAlert {
  type: AlertType;
  title: string;
  message: string;
}

// ─────────────────────────────────────────────
// FIREBASE AUTH ERRORS
// ─────────────────────────────────────────────
const AUTH_ERRORS: Record<string, AppAlert> = {
  'auth/invalid-email': {
    type: 'error',
    title: 'Invalid Email',
    message: "That email doesn't look right. Double-check it and try again.",
  },
  'auth/user-not-found': {
    type: 'error',
    title: 'No Account Found',
    message: "We couldn't find an account with that email. Are you sure you've signed up?",
  },
  'auth/wrong-password': {
    type: 'error',
    title: 'Wrong Password',
    message: 'Incorrect password. Give it another shot — you got this!',
  },
  'auth/invalid-credential': {
    type: 'error',
    title: 'Invalid Credentials',
    message: 'Your email or password is incorrect. Please try again.',
  },
  'auth/email-already-in-use': {
    type: 'error',
    title: 'Email Already Taken',
    message: 'An account with this email already exists. Try logging in instead.',
  },
  'auth/weak-password': {
    type: 'warning',
    title: 'Password Too Weak',
    message: 'Your password needs to be at least 6 characters. Make it stronger!',
  },
  'auth/too-many-requests': {
    type: 'warning',
    title: 'Slow Down, Ninja!',
    message: "You've made too many attempts. Take a short break and try again in a few minutes.",
  },
  'auth/network-request-failed': {
    type: 'error',
    title: 'No Connection',
    message: 'Looks like you\'re offline. Check your internet and try again.',
  },
  'auth/user-disabled': {
    type: 'error',
    title: 'Account Suspended',
    message: 'Your account has been suspended. Please contact our support team for help.',
  },
  'auth/requires-recent-login': {
    type: 'warning',
    title: 'Session Expired',
    message: 'For your security, please log in again to continue.',
  },
  'auth/account-exists-with-different-credential': {
    type: 'error',
    title: 'Account Conflict',
    message: 'An account with this email already exists using a different sign-in method. Try logging in differently.',
  },
  'auth/popup-closed-by-user': {
    type: 'info',
    title: 'Sign-In Cancelled',
    message: 'You closed the sign-in window. No worries — try again whenever you\'re ready.',
  },
  'auth/expired-action-code': {
    type: 'error',
    title: 'Link Expired',
    message: 'This link has expired. Please request a new one.',
  },
  'auth/invalid-action-code': {
    type: 'error',
    title: 'Invalid Link',
    message: 'This link is no longer valid. It may have already been used.',
  },
  'auth/missing-email': {
    type: 'error',
    title: 'Email Required',
    message: 'Please enter your email address to continue.',
  },
  'auth/operation-not-allowed': {
    type: 'error',
    title: 'Not Allowed',
    message: 'This sign-in method is currently disabled. Please try another way.',
  },
};

// ─────────────────────────────────────────────
// FIRESTORE / CLOUD FUNCTION ERRORS
// ─────────────────────────────────────────────
const FIRESTORE_ERRORS: Record<string, AppAlert> = {
  'permission-denied': {
    type: 'error',
    title: 'Access Denied',
    message: "You don't have permission to do that. Make sure you're logged in.",
  },
  'not-found': {
    type: 'error',
    title: 'Not Found',
    message: "We couldn't find what you were looking for. It may have been removed.",
  },
  'already-exists': {
    type: 'warning',
    title: 'Already Exists',
    message: 'This already exists. No need to do it again!',
  },
  'resource-exhausted': {
    type: 'warning',
    title: 'Rate Limit Hit',
    message: "You're moving too fast! Take a breath and try again in a moment.",
  },
  unavailable: {
    type: 'error',
    title: 'Service Unavailable',
    message: 'AniYu servers are currently unreachable. Check your connection and try again.',
  },
  'deadline-exceeded': {
    type: 'error',
    title: 'Request Timed Out',
    message: 'The request took too long. Please try again.',
  },
  unauthenticated: {
    type: 'error',
    title: 'Not Logged In',
    message: 'You need to be logged in to do that.',
  },
  cancelled: {
    type: 'info',
    title: 'Action Cancelled',
    message: 'The action was cancelled. You can try again anytime.',
  },
  internal: {
    type: 'error',
    title: 'Server Error',
    message: "Something went wrong on our end. We're on it — please try again shortly.",
  },
  'data-loss': {
    type: 'error',
    title: 'Data Error',
    message: 'Something unexpected happened with your data. Please refresh and try again.',
  },
  'failed-precondition': {
    type: 'warning',
    title: 'Action Not Allowed',
    message: 'This action cannot be completed right now. Please check the requirements.',
  },
};

// ─────────────────────────────────────────────
// APP-SPECIFIC SUCCESS MESSAGES
// ─────────────────────────────────────────────
export const SUCCESS_MESSAGES: Record<string, AppAlert> = {
  // Auth
  login: {
    type: 'success',
    title: 'Welcome Back!',
    message: "You're in. Time to dive into the anime world!",
  },
  register: {
    type: 'success',
    title: 'Account Created!',
    message: "You're officially part of the AniYu crew. Your journey begins now!",
  },
  logout: {
    type: 'info',
    title: 'Logged Out',
    message: "You've been logged out safely. See you next time!",
  },
  passwordReset: {
    type: 'success',
    title: 'Reset Email Sent',
    message: 'Check your inbox — a password reset link is on its way.',
  },
  passwordChanged: {
    type: 'success',
    title: 'Password Updated',
    message: 'Your password has been changed successfully. Stay secure!',
  },
  emailVerification: {
    type: 'success',
    title: 'Verification Sent',
    message: "We've sent a verification email. Please check your inbox.",
  },

  // Profile
  profileUpdated: {
    type: 'success',
    title: 'Profile Saved!',
    message: "Your profile looks great. Changes saved successfully.",
  },
  avatarUpdated: {
    type: 'success',
    title: 'Avatar Updated!',
    message: 'Your new look is live. Flex it in the community!',
  },
  usernameChanged: {
    type: 'success',
    title: 'Username Updated!',
    message: 'Your new username is ready. Own it!',
  },
  bannerUpdated: {
    type: 'success',
    title: 'Banner Updated!',
    message: "Your profile banner has been updated. Looking sharp!",
  },

  // Community / Feed
  postCreated: {
    type: 'success',
    title: 'Post Published!',
    message: 'Your post is live. The community can see it now!',
  },
  postDeleted: {
    type: 'info',
    title: 'Post Removed',
    message: 'Your post has been deleted successfully.',
  },
  postReported: {
    type: 'success',
    title: 'Report Submitted',
    message: "Thanks for keeping AniYu safe. Our team will review this shortly.",
  },
  commentPosted: {
    type: 'success',
    title: 'Comment Posted!',
    message: 'Your comment is live. Join the conversation!',
  },
  commentDeleted: {
    type: 'info',
    title: 'Comment Removed',
    message: 'Your comment has been deleted.',
  },
  reposted: {
    type: 'success',
    title: 'Reposted!',
    message: 'You shared this with your followers. Spread the love!',
  },
  repostRemoved: {
    type: 'info',
    title: 'Repost Removed',
    message: 'The repost has been removed from your profile.',
  },
  userFollowed: {
    type: 'success',
    title: 'Following!',
    message: "You're now following this user. Their posts will appear in your feed.",
  },
  userUnfollowed: {
    type: 'info',
    title: 'Unfollowed',
    message: "You've unfollowed this user.",
  },
  userBlocked: {
    type: 'info',
    title: 'User Blocked',
    message: "You won't see content from this user anymore.",
  },
  userReported: {
    type: 'success',
    title: 'User Reported',
    message: "Thanks for the heads-up. Our moderation team will look into it.",
  },

  // Anime / Manga
  addedToWatchlist: {
    type: 'success',
    title: 'Added to Watchlist!',
    message: "It's saved to your watchlist. Pick up where you left off anytime.",
  },
  removedFromWatchlist: {
    type: 'info',
    title: 'Removed from Watchlist',
    message: 'Removed from your watchlist.',
  },
  downloadStarted: {
    type: 'info',
    title: 'Download Started',
    message: "Your download is in progress. We'll notify you when it's ready.",
  },
  downloadComplete: {
    type: 'success',
    title: 'Download Complete!',
    message: "It's saved offline. Watch it anytime, anywhere!",
  },
  downloadRemoved: {
    type: 'info',
    title: 'Download Removed',
    message: 'The offline file has been deleted to free up space.',
  },
  ratingSubmitted: {
    type: 'success',
    title: 'Rating Submitted!',
    message: 'Thanks for your review! Your opinion helps the community.',
  },

  // Manga creator
  mangaUploaded: {
    type: 'success',
    title: 'Manga Uploaded!',
    message: 'Your chapter is live for readers to enjoy. Great work, Creator!',
  },
  chapterSaved: {
    type: 'success',
    title: 'Chapter Saved!',
    message: 'Your chapter has been saved successfully.',
  },

  // Support / Tickets
  ticketSubmitted: {
    type: 'success',
    title: 'Ticket Submitted!',
    message: "We've received your report. Our team will get back to you soon.",
  },
  ticketResolved: {
    type: 'success',
    title: 'Ticket Resolved',
    message: "Your support ticket has been marked as resolved. Hope it helped!",
  },

  // Settings
  settingsSaved: {
    type: 'success',
    title: 'Settings Saved!',
    message: 'Your preferences have been updated.',
  },
  notificationsEnabled: {
    type: 'success',
    title: 'Notifications On!',
    message: "You'll now get updates from AniYu. Stay in the loop!",
  },
  notificationsDisabled: {
    type: 'info',
    title: 'Notifications Off',
    message: "You won't receive push notifications for now.",
  },
  accountDeleted: {
    type: 'info',
    title: 'Account Deleted',
    message: 'Your account has been permanently deleted. We hope to see you again someday.',
  },
};

// ─────────────────────────────────────────────
// APP-SPECIFIC ERROR MESSAGES
// ─────────────────────────────────────────────
export const APP_ERROR_MESSAGES: Record<string, AppAlert> = {
  // Auth
  usernameTaken: {
    type: 'error',
    title: 'Username Taken',
    message: 'That username is already claimed. Try a different one!',
  },
  usernameInvalid: {
    type: 'error',
    title: 'Invalid Username',
    message: 'Usernames can only contain letters, numbers, and underscores.',
  },
  usernameTooShort: {
    type: 'warning',
    title: 'Username Too Short',
    message: 'Your username needs to be at least 3 characters.',
  },
  usernameTooLong: {
    type: 'warning',
    title: 'Username Too Long',
    message: 'Your username can be at most 20 characters.',
  },
  passwordMismatch: {
    type: 'error',
    title: 'Passwords Don\'t Match',
    message: "The passwords you entered don't match. Please double-check.",
  },
  emptyFields: {
    type: 'warning',
    title: 'Fields Required',
    message: 'Please fill in all required fields before continuing.',
  },
  sessionExpired: {
    type: 'warning',
    title: 'Session Expired',
    message: "Your session has expired. Please log in again to continue.",
  },

  // Content / Feed
  postEmpty: {
    type: 'warning',
    title: 'Empty Post',
    message: "You can't post an empty message. Add some text or media!",
  },
  postTooLong: {
    type: 'warning',
    title: 'Post Too Long',
    message: 'Your post exceeds the character limit. Please shorten it.',
  },
  imageTooLarge: {
    type: 'error',
    title: 'Image Too Large',
    message: 'The image you selected is too large. Please choose one under 5 MB.',
  },
  unsupportedFileType: {
    type: 'error',
    title: 'Unsupported File',
    message: 'This file type is not supported. Please use JPG, PNG, or GIF.',
  },
  commentEmpty: {
    type: 'warning',
    title: 'Empty Comment',
    message: "You can't post an empty comment. Say something!",
  },
  reportEmpty: {
    type: 'warning',
    title: 'Report Reason Required',
    message: 'Please select a reason for your report before submitting.',
  },
  rateLimitExceeded: {
    type: 'warning',
    title: 'Slow Down!',
    message: "You're doing that too fast. Give it a moment before trying again.",
  },
  selfAction: {
    type: 'info',
    title: 'That\'s You!',
    message: "You can't perform this action on your own account.",
  },
  alreadyFollowing: {
    type: 'info',
    title: 'Already Following',
    message: "You're already following this user.",
  },
  alreadyLiked: {
    type: 'info',
    title: 'Already Liked',
    message: "You've already liked this post.",
  },

  // Media / Streaming
  adRequired: {
    type: 'info',
    title: 'Watch a Quick Ad',
    message: 'Watch a short ad to unlock this content. It keeps AniYu free for everyone!',
  },
  streamUnavailable: {
    type: 'error',
    title: 'Stream Unavailable',
    message: "This episode isn't available in your region yet. Check back soon!",
  },
  downloadFailed: {
    type: 'error',
    title: 'Download Failed',
    message: "Couldn't download this content. Check your connection and try again.",
  },
  storageInsufficient: {
    type: 'error',
    title: 'Not Enough Storage',
    message: "Your device doesn't have enough space for this download.",
  },
  chapterNotFound: {
    type: 'error',
    title: 'Chapter Not Found',
    message: "This chapter couldn't be loaded. It may have been removed.",
  },

  // General
  networkError: {
    type: 'error',
    title: 'No Connection',
    message: "Looks like you're offline. Check your internet and try again.",
  },
  serverError: {
    type: 'error',
    title: 'Server Error',
    message: "Something went wrong on our end. We're already on it — please try again shortly.",
  },
  unknown: {
    type: 'error',
    title: 'Something Went Wrong',
    message: "An unexpected error occurred. Please try again.",
  },
};

// ─────────────────────────────────────────────
// MAIN RESOLVER
// ─────────────────────────────────────────────

/**
 * Resolves a Firebase or app error into a friendly AppAlert object.
 *
 * Usage:
 *   const alert = resolveError(error);
 *   showAlert(alert.type, alert.title, alert.message);
 */
export function resolveError(error: unknown): AppAlert {
  if (!error) return APP_ERROR_MESSAGES.unknown;

  // Firebase errors have a `code` field
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: string }).code;

    if (AUTH_ERRORS[code]) return AUTH_ERRORS[code];
    if (FIRESTORE_ERRORS[code]) return FIRESTORE_ERRORS[code];

    // Firestore errors sometimes come prefixed, e.g. "firestore/permission-denied"
    const stripped = code.includes('/') ? code.split('/').pop()! : code;
    if (FIRESTORE_ERRORS[stripped]) return FIRESTORE_ERRORS[stripped];
  }

  // Network errors
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = ((error as { message: string }).message || '').toLowerCase();
    if (msg.includes('network') || msg.includes('offline') || msg.includes('failed to fetch')) {
      return APP_ERROR_MESSAGES.networkError;
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return FIRESTORE_ERRORS['deadline-exceeded'];
    }
    if (msg.includes('permission') || msg.includes('unauthorized')) {
      return FIRESTORE_ERRORS['permission-denied'];
    }
  }

  return APP_ERROR_MESSAGES.unknown;
}

/**
 * Retrieves a predefined success message by key.
 *
 * Usage:
 *   const alert = getSuccess('login');
 *   showAlert(alert.type, alert.title, alert.message);
 */
export function getSuccess(key: keyof typeof SUCCESS_MESSAGES): AppAlert {
  return SUCCESS_MESSAGES[key] ?? {
    type: 'success',
    title: 'Done!',
    message: 'Action completed successfully.',
  };
}

/**
 * Retrieves a predefined app error message by key.
 *
 * Usage:
 *   const alert = getAppError('usernameTaken');
 *   showAlert(alert.type, alert.title, alert.message);
 */
export function getAppError(key: keyof typeof APP_ERROR_MESSAGES): AppAlert {
  return APP_ERROR_MESSAGES[key] ?? APP_ERROR_MESSAGES.unknown;
}