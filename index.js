const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.readonly",
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listMessages(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  let response;
  try {
    response = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
    });
  } catch (err) {
    console.log(err.message);
    return;
  }
  const messages = response.data.messages || [];
  for (const message of messages) {
    // Get the full message details
    const messageRes = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
    });
    const emailrecipient = messageRes.data.payload.headers.find(
      (header) => header.name === "From"
    ).value;

    const userList = await gmail.users.messages.list({
      userId: "me",
      q: `to:${emailrecipient}`,
    });
    if (userList.data.resultSizeEstimate === 0) {
      const threadId = message.threadId;
      await sendReply(threadId, emailrecipient, auth);
    }
  }
  while (true) {
    await listMessages(auth);

    // Wait for a random interval before checking emails again
    const interval = getRandomInterval();
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
async function sendReply(threadId, email, auth) {
  const subject = "🤘 Hello 🤘";
  const gmail = google.gmail({ version: "v1", auth });
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const messageParts = [
    "From: Ritesh Kumar <ritesh.kumarxt@gmail.com>",
    `To: ${email}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${utf8Subject}`,
    "",
    "This is a message just to say hello.",
    "So... <b>Hello!</b>  🤘❤️😎",
  ];
  const message = messageParts.join("\n");
  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      resource: {
        raw: encodedMessage,
      },
    });
    console.log("Reply sent successfully");
    const labelId = "Label_8865386062692096589"; // Choose a label name

    await gmail.users.messages.modify({
      userId: "me",
      id: res.data.id,
      resource: {
        addLabelIds: [labelId],
      },
    });
  } catch (error) {
    console.error("Error sending reply:", error);
  }
}
function getRandomInterval() {
  const min = 45 * 1000; // Convert seconds to milliseconds
  const max = 120 * 1000; // Convert seconds to milliseconds
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

authorize().then(listMessages).catch(console.error);
