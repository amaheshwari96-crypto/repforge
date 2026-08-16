# RepForge — cloud sync setup (provider-agnostic)

RepForge is local-first and supports three modes:

1. **Local only** — no cloud.
2. **Firebase / Firestore** — recommended for automatic multi-device synchronization.
3. **Google Drive** — alternative cloud storage/sync using your Google account.

Only one provider is active at a time. Full JSON Backup/Restore is independent of both.

## A. Fastest route: Firebase

### 1. Create a Firebase project
Open the official Firebase Console: https://console.firebase.google.com/

Create a project, e.g. `repforge`.

### 2. Add a Web App
Project settings → Your apps → Add app → Web (`</>`).
Copy the Web App config.

### 3. Enable Authentication
Authentication → Sign-in method:
- Email/Password
- Google (optional)

### 4. Create Firestore
Firestore Database → Create database.
Deploy the included `firestore.rules` in the Firebase console or with the Firebase CLI.

### 5. Configure RepForge
Open **More → Account & sync**.
Select **Firebase / Firestore**.
Paste the Web App config and save.
Create/sign in with the same account on desktop and phone.

Firestore supports offline persistence and synchronizes queued local changes when connectivity returns. See Firebase's official documentation: https://firebase.google.com/docs/firestore/manage-data/enable-offline

## B. Google Drive alternative

### 1. Create a Google Cloud project
Open Google Cloud Console: https://console.cloud.google.com/

### 2. Enable Google Drive API
APIs & Services → Library → enable **Google Drive API**.

### 3. Configure OAuth consent
APIs & Services → OAuth consent screen.
Set up the app and add your own Google account as a test user if the app is in testing.

### 4. Create a Web OAuth client
Credentials → Create credentials → OAuth client ID → Web application.
Add the exact deployed RepForge origin under **Authorized JavaScript origins**, for example:
`https://YOUR-USERNAME.github.io`

Do not add a path such as `/repforge` to the origin field.

### 5. Configure RepForge
More → Account & sync → Google Drive.
Paste the OAuth Web Client ID and save.
Then click **Connect Google Drive**.

RepForge requests the narrow `drive.file` scope and creates/updates a file named `RepForge Cloud Data.json`. Google documents `drive.file` as a per-file scope appropriate for apps that create or open files they use. See: https://developers.google.com/workspace/drive/api/guides/api-specific-auth

### Important Drive limitation
Google Drive is file storage, not a realtime database. RepForge therefore merges individual workout records, daily notes, targets and annual entries before writing the cloud file. Firebase remains the better choice if you want the strongest realtime multi-device behavior.

## C. Deployment — easiest route with GitHub Pages

1. Create/sign in to GitHub: https://github.com/
2. Create a new repository, e.g. `repforge`.
3. Upload **all files from this folder** to the repository root. `index.html` must be at the root.
4. Repository → Settings → Pages.
5. Under Build and deployment choose **Deploy from a branch**.
6. Select `main` and `/ (root)`, then Save.
7. Wait for the Pages deployment to complete.
8. Open the published HTTPS URL.

GitHub Pages publishes static HTML/CSS/JS directly from a repository. See the official guide: https://docs.github.com/en/pages/quickstart

### If using Google Drive
Use the published HTTPS origin from step 8 as the OAuth Authorized JavaScript origin.

### If using Firebase
Add the published domain to Firebase Authentication → Settings → Authorized domains if Firebase asks for it.

## D. Install on phone

### Android Chrome
Open the published RepForge URL in Chrome → menu → **Install app** / **Add to Home screen**.

### iPhone Safari
Open the published URL in Safari → Share → **Add to Home Screen**.

## E. First-use sequence

1. Deploy RepForge.
2. Open it on desktop.
3. Choose your sync provider.
4. Configure Firebase or Google Drive.
5. Create/connect the account.
6. Let the first sync finish.
7. Open the same URL on your phone.
8. Install RepForge.
9. Use the same cloud provider/account.
10. Verify one test workout appears on both devices.
11. Only after verification, start entering your historical data.

## F. Backup rule

Even with cloud sync enabled, periodically use **More → Backup & restore → Export Full Backup**. Keep at least one copy outside the app.
