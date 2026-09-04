// Drop your Google OAuth 2.0 Web Client ID here once you've done the
// Google Cloud setup described in README.md. Leave it blank to run the
// app on IndexedDB only — Drive sync silently disables itself.
export const GOOGLE_CLIENT_ID = '';

// Drive scope needed to read/write the app's private appDataFolder.
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// Bump this on every deploy that changes cached app files. The service
// worker uses it to name its cache and detect updates.
export const APP_VERSION = '1.0.1';
