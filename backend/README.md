# StoneCentury Vault backend

A single Netlify Function (`POST /api/ask`) that answers questions for **The Vault**
(the "Ask" tool on the StoneCentury Financial website) using real Cashflow Legendz
podcast transcripts, instead of the old hardcoded demo answers.

## What's here

```
backend/
  netlify.toml                    Netlify config (functions dir, /api/* redirect)
  package.json
  public/index.html               placeholder page for the Netlify site itself
  netlify/functions/ask.js        the actual answer-generation function
  netlify/functions/lib/drive-logger.js   logs uncovered finance questions to Drive
  data/knowledge-index.json       generated — the current knowledge base
  scripts/
    build-knowledge-index.js      turns source/**/*.md into data/knowledge-index.json
    source/cashflow-legendz/*.md  transcript files (only status: complete ones count)
```

## How the knowledge base gets updated

The real transcripts live in Google Drive: Shared Drive **"StoneCentury Knowledge
Base Brain"** → `knowledge_base/cashflow-legendz/*.md`. Most episodes there are still
`status: pending-transcript` — only finished ones are used here.

There's no live connection from this backend to Drive (that would need a Google
service account — a bigger step, intentionally deferred). Instead, whenever you want
fresh episodes included:

1. Ask Claude (in this project) to re-check the Drive folder for newly-completed
   transcripts and drop the new `.md` files into `scripts/source/cashflow-legendz/`.
2. Run `node scripts/build-knowledge-index.js` — this regenerates
   `data/knowledge-index.json` from whatever `status: complete` files exist.
3. Commit and push. Netlify auto-redeploys, and the function picks up the new file
   (it's `require()`'d directly, so it's bundled at deploy time).

**When this needs to change:** once you have roughly 30-50 completed episodes, the
function's current approach (send every complete transcript to Claude on every
question) will start getting slow and expensive. At that point this needs a real
retrieval step (chunk + embed + only send the most relevant few episodes per
question) instead of sending everything every time. Flagging this now so it's a
planned upgrade, not a surprise later.

## One-time setup (you'll need to do this part yourself)

1. **Create a Netlify account** (if you don't have one) at netlify.com, sign in with
   GitHub.
2. **"Add new site" → "Import an existing project"** → pick the
   `tomasgr-pareto/stoncentury-testsite` repo.
3. When it asks for the **base directory**, set it to `backend` — this tells Netlify
   to only look inside this folder (the main website stays on GitHub Pages,
   untouched).
4. Build settings: no build command needed, publish directory `public` — netlify.toml
   already has these, Netlify should pick them up automatically.
5. **Site settings → Environment variables** → add `ANTHROPIC_API_KEY` with your own
   Anthropic API key (from console.anthropic.com, with billing set up — every
   question asked on the live site calls this API and costs a small amount of real
   money). This is the one place the key should ever live; it never appears in the
   repo or in any client-side code.
6. Deploy. Netlify will give you a URL like `https://<random-name>.netlify.app`.
   Once you have that, it needs to be added to `js/vault.js`'s fetch URL and to the
   `ALLOWED_ORIGINS` check in `ask.js` if you rename/customize the Netlify site name.

## Uncovered-question logging

When someone asks The Vault a real finance question that the transcript library
doesn't cover, the function logs it to a markdown file — `vault-uncovered-questions.md`
— inside a folder you choose in the **StoneCentury Knowledge Base Brain** Shared Drive.
Brock can check that file periodically to see what people are actually asking that
isn't covered yet, and prioritize recording those topics. Spam/greetings/test messages
are filtered out by the model before anything gets logged.

This originally used a Google **service account**, but most Google Workspace orgs
now block downloadable service account keys by default (`iam.disableServiceAccountKeyCreation`)
— if you hit that error, it means an org admin would have to explicitly disable that
policy, which usually isn't worth doing for this. Use an **OAuth refresh token** for
your own Google account instead — no key file, no org policy involved, and no
separate account to share the folder with, since it writes as you.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project (or
   reuse one), then **APIs & Services → Library** → enable the **Google Drive API**.
2. **APIs & Services → OAuth consent screen** → set it up if you haven't (User type
   "External" is fine; you don't need to publish it — it can stay in "Testing" as
   long as your own Google account is added under "Test users").
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → type
   **Web application**. Under "Authorized redirect URIs" add:
   `https://developers.google.com/oauthplayground`
4. Note the **Client ID** and **Client secret** it gives you.
5. Go to [Google's OAuth Playground](https://developers.google.com/oauthplayground):
   - Click the gear icon (top right) → check **"Use your own OAuth credentials"** →
     paste in the Client ID and Client secret from step 4.
   - In the left panel's scope box, enter `https://www.googleapis.com/auth/drive` and
     click **Authorize APIs**.
   - Sign in with the Google account that has access to the **StoneCentury Knowledge
     Base Brain** Shared Drive, and grant consent.
   - Click **"Exchange authorization code for tokens"**. Copy the **Refresh token**
     it returns — this is the long-lived credential.
6. In Google Drive, inside the **StoneCentury Knowledge Base Brain** Shared Drive,
   create a folder for this (e.g. `vault-uncovered-questions`, as a sibling to
   `knowledge_base` — keep it out of the folder the sync script reads from). Get its
   ID from the Drive URL (`drive.google.com/drive/folders/<ID>`).
7. In Netlify → **Site settings → Environment variables**, add:
   - `GOOGLE_OAUTH_CLIENT_ID` — from step 4
   - `GOOGLE_OAUTH_CLIENT_SECRET` — from step 4
   - `GOOGLE_OAUTH_REFRESH_TOKEN` — from step 5
   - `GOOGLE_DRIVE_UNCOVERED_FOLDER_ID` — the folder ID from step 6
8. Redeploy (a new push, or trigger a manual deploy) so the function picks up the new
   env vars and the new `google-auth-library` dependency.

If these env vars aren't set, or the Drive write fails for any reason, logging is
skipped silently — it never breaks the actual answer returned to the visitor.

Note: a refresh token from the OAuth Playground for an app still in "Testing" mode
can expire after 7 days of inactivity, but since this function calls it regularly
that's unlikely to be an issue in practice. If it ever does stop working, just repeat
step 5 to mint a fresh refresh token.

## Testing the function directly

```bash
curl -X POST https://<your-site>.netlify.app/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Why do you care about cash flow instead of net worth?","depth":"direct"}'
```
