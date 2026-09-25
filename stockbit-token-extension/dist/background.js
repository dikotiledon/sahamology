console.log("Stockbit Token Syncer: Background script starting...");

// Configuration — set the app's /api/update-token endpoint for your topology:
//   localhost:      http://localhost:3000/api/update-token
//   LAN:            http://192.168.1.4:3000/api/update-token
//   reverse proxy:  https://stocks.example.com/api/update-token
//   public VPS:     http://<PUBLIC_IP>:3000/api/update-token
const DEFAULT_APP_API_URL = "http://localhost:3000/api/update-token";

let appApiUrl = DEFAULT_APP_API_URL;

// Allow per-install override without editing the source: set the target URL
// from the extension's service-worker console or storage:
//   chrome.storage.local.set({ appApiUrl: "http://192.168.1.4:3000/api/update-token" });
chrome.storage.local.get("appApiUrl", (result) => {
  if (result.appApiUrl) {
    appApiUrl = result.appApiUrl;
  }
  console.log("Target API URL:", appApiUrl);
});

let lastSyncedToken = null;

console.log("Registering webRequest listener...");


// Helper to decode JWT payload
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    console.log("Checking request:", details.url);
    
    // Look for the Authorization header
    const authHeader = details.requestHeaders.find(
      (header) => header.name.toLowerCase() === "authorization"
    );

    if (authHeader && authHeader.value) {
      // Check if it is a Bearer token
      if (authHeader.value.startsWith("Bearer ")) {
        const token = authHeader.value.substring(7); // Remove "Bearer " prefix

        // Only sync if the token has changed to avoid spamming the API
        if (token !== lastSyncedToken) {
          console.log("New token candidate detected...");
          
          const decoded = parseJwt(token);
          
          // Only sync if it's a valid JWT (must have a payload with an expiry)
          if (!decoded || !decoded.exp) {
            console.log("Skipping non-JWT or invalid token.");
            return;
          }

          console.log("Valid JWT detected from:", details.url);
          const expiresAt = decoded.exp;
          
          // Debugging
          console.log("Token Expiry:", new Date(expiresAt * 1000));
          
          syncToken(token, expiresAt);
        }
      }
    }
  },
  { urls: ["https://*.stockbit.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

function syncToken(token, expiresAt) {
  const payload = {
    token: token,
    expires_at: expiresAt
  };

  fetch(appApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then((response) => {
      if (response.ok) {
        console.log("Token successfully synced to API.");
        lastSyncedToken = token; // Update cache on success
      } else {
        console.error("Failed to sync token. Status:", response.status);
      }
    })
    .catch((error) => {
      console.error("Error syncing token:", error);
    });
}
