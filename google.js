const API_URL = "https://script.google.com/macros/s/AKfycbw2tJvjtfDj-A-EidY-pkJzIr7cCo9pOk6v1wCgbvKCCILefEBdxlJlO-X-Fom4r8g6/exec";
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
      const text = await response.text().catch(() => "");
      console.error("Google API POST failed", response.status, text);
      alert("Google API POST failed: HTTP " + response.status + " - " + (text || response.statusText));
      return { success: false, error: "HTTP " + response.status, details: text };
    }

    const result = await response.json().catch(err => {
      console.error("Failed to parse JSON response from Google API", err);
      alert("Google API returned invalid JSON: " + (err.message || err));
      return { success: false, error: "invalid_json" };
    });

    console.log("Google API POST result:", result, "body:", body);
    if (result && result.success === false) {
      console.warn("Google API reported error", result);
      alert("Google API error: " + (result.error || result.message || JSON.stringify(result)));
    }

    return result;
  } catch (err) {
    console.error("Google API POST failed", err);
    alert("Google API POST failed: " + (err.message || err));
    return {
      success: false,
      error: err.message || String(err)
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
