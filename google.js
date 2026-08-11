const API_URL = "https://script.google.com/macros/s/AKfycbygBqCv8N6eYcGiB0nEQkhNyIh2RkHHjM4NkzIpjqlMyMDQ4ieMCEjRTWl_arVhEZ-d/exec";
const MAKE_WEBHOOK_URL = "https://hook.us1.make.com/your-webhook-url"; // Replace with actual Make.com webhook when ready

async function postToGoogleApi(body) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const result = await response.json();
    console.log("Google API:", result);
    return result;
  } catch (err) {
    console.error("Google API POST failed", err);
    return {
      success: false,
      error: err.message
    };
  }
}

async function getFromGoogleApi(params = {}) {
  try {
    const url = new URL(API_URL);
    Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-cache"
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("Google API GET failed", response.status, text, url.toString());
      return null;
    }

    const result = await response.json();
    console.log("Google API GET:", url.toString(), result);
    return result;
  } catch (err) {
    console.warn("Google API GET failed", err);
    return null;
  }
}

async function triggerMakeWebhook(payload) {
  try {
    return await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      mode: "no-cors"
    });
  } catch (err) {
    console.warn("Make webhook failed", err);
    return null;
  }
}
