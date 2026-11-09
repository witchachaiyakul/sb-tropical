# Cloud Functions backend

The HTTP function exports `api` and accepts the frontend RPC envelope
`{ "method": "...", "args": [...] }` at `/api/call`. The Hosting rewrite targets
`api` in `us-central1`.

## Setup

1. Install dependencies from this directory with `npm install`; run focused tests
   with `npm test`.
2. Set the session-signing secret in the Firebase project (generate a random
   value of at least 32 bytes and paste it at the prompt):

   ```sh
   firebase functions:secrets:set SESSION_SECRET
   ```

3. Enable the Drive and Slides APIs and deploy the function:

   ```sh
   gcloud services enable drive.googleapis.com slides.googleapis.com --project sb-tropical
   firebase deploy --only functions:api
   ```

4. Grant the function's runtime service account Firestore access
   (`roles/datastore.user`). Share the billing/receipt Slides templates and
   destination Drive folders with that same service account as an editor.
   The receipt/billing PDF functions also request anyone-with-link reader
   sharing, so the Workspace/Drive policy must permit that.

The function uses Application Default Credentials from its runtime service
identity for Firestore, Drive, and Slides. Do not create or place a service
account key in the frontend or source tree. `SESSION_SECRET` is the only
application secret required by this backend.
