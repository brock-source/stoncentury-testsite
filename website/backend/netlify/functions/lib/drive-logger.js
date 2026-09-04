// Logs finance questions The Vault couldn't answer into a markdown file in the
// "StoneCentury Knowledge Base Brain" Shared Drive, so Brock can see what's missing
// from the transcript library and prioritize what to record next.
//
// Auth: an OAuth refresh token for a real Google account (not a service account —
// this org's policy blocks downloadable service account keys), so the file is
// written as that account and no separate sharing step is needed. See README for
// how to generate the refresh token via Google's OAuth Playground.
//
// Requires (Netlify env vars):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//   GOOGLE_DRIVE_UNCOVERED_FOLDER_ID     (a folder inside the Shared Drive)

const { OAuth2Client } = require("google-auth-library");

const FILE_NAME = "vault-uncovered-questions.md";
const LOG_HEADER =
  "# Vault — Uncovered Finance Questions\n\n" +
  "Genuine finance questions asked to The Vault that the current transcript " +
  "library doesn't cover yet. Use this to prioritize what to record next.\n\n";

function getClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth credentials are not configured");
  }
  const client = new OAuth2Client({ clientId, clientSecret });
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function getDriveId(client, folderId) {
  const res = await client.request({
    url: `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=driveId`,
  });
  return res.data.driveId;
}

async function findLogFile(client, folderId, driveId) {
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${FILE_NAME}' and trashed = false`);
  const res = await client.request({
    url:
      `https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true` +
      `&includeItemsFromAllDrives=true&corpora=drive&driveId=${driveId}&fields=files(id,name)`,
  });
  const files = res.data.files || [];
  return files[0] || null;
}

async function getFileContent(client, fileId) {
  const res = await client.request({
    url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    responseType: "text",
  });
  return typeof res.data === "string" ? res.data : String(res.data);
}

async function createLogFile(client, folderId, body) {
  const metadata = { name: FILE_NAME, parents: [folderId], mimeType: "text/markdown" };
  const boundary = "vault_uncovered_log";
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/markdown\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;

  await client.request({
    url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    data: multipartBody,
  });
}

async function updateLogFile(client, fileId, body) {
  await client.request({
    url: `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,
    method: "PATCH",
    headers: { "Content-Type": "text/markdown" },
    data: body,
  });
}

async function logUncoveredQuestion(question, depth) {
  const folderId = process.env.GOOGLE_DRIVE_UNCOVERED_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_UNCOVERED_FOLDER_ID is not configured");
  }

  const client = getClient();
  const driveId = await getDriveId(client, folderId);
  const existing = await findLogFile(client, folderId, driveId);

  const entry = `## ${new Date().toISOString()}\n**Question:** ${question}\n**Depth:** ${depth}\n`;

  if (existing) {
    const current = await getFileContent(client, existing.id);
    await updateLogFile(client, existing.id, `${current.trim()}\n\n${entry}`);
  } else {
    await createLogFile(client, folderId, `${LOG_HEADER}${entry}`);
  }
}

module.exports = { logUncoveredQuestion };
