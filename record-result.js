// netlify/functions/record-result.js
//
// Receives a completed quiz attempt from the browser and commits it as a
// JSON file to the GitHub repo via the Contents API. The GitHub token is
// read from a Netlify environment variable (GITHUB_TOKEN) and never sent
// to the browser.

const REPO_OWNER = "kmcanallyALI";
const REPO_NAME = "Overhead-Valve";
const REPO_BRANCH = "main";
const RESULTS_DIR = "results"; // folder in the repo where attempt files land

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, body: "Server misconfigured: missing GITHUB_TOKEN" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const { name, score, correct, total, percent, passed, timestamp } = payload;

  if (!name || typeof correct !== "number" || typeof total !== "number") {
    return { statusCode: 400, body: "Missing required fields" };
  }

  // Build a safe, unique filename: name-slug + timestamp
  const safeName = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "technician";

  const ts = timestamp || new Date().toISOString();
  const fileSafeTs = ts.replace(/[:.]/g, "-");
  const filePath = `${RESULTS_DIR}/${safeName}_${fileSafeTs}.json`;

  const record = {
    name,
    correct,
    total,
    percent,
    passed: !!passed,
    course: "MX-13 Overhead Valve Clearance Adjustment",
    timestamp: ts,
  };

  const content = Buffer.from(JSON.stringify(record, null, 2)).toString("base64");

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;

  try {
    const res = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "overhead-valve-training-function",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message: `Record attempt: ${name} (${correct}/${total})`,
        content,
        branch: REPO_BRANCH,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: res.status, body: `GitHub API error: ${errText}` };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, path: filePath }),
    };
  } catch (err) {
    return { statusCode: 500, body: `Request failed: ${err.message}` };
  }
};
