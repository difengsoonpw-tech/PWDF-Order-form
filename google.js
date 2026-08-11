const API_URL = "https://script.google.com/macros/s/AKfycbytfrFpyZJXRWMFzExnwphN2Y4a-lj_2SjYltpsCGwDuKc0w_8yEI2wzwDX62wpo43h/exec";
const MAKE_WEBHOOK_URL = "https://hook.us1.make.com/your-webhook-url"; // Replace with actual Make.com webhook when ready

async function postToGoogleApi(body) {
  try {
    return await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      mode: "no-cors"
    });
  } catch (err) {
    console.warn("Google API POST failed", err);
    return null;
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
    return response.ok ? await response.json() : null;
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
