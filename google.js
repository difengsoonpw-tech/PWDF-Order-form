const API_URL = "https://script.google.com/macros/s/AKfycbw2tJvjtfDj-A-EidY-pkJzIr7cCo9pOk6v1wCgbvKCCILefEBdxlJlO-X-Fom4r8g6/exec";
const MAKE_WEBHOOK_URL = "https://hook.us1.make.com/your-webhook-url"; // Replace with actual Make.com webhook when ready

async function postToGoogleApi(body) {
  try {
    const formData = new URLSearchParams();
    formData.append("payload", JSON.stringify(body));

    const response = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const text = await response.text();
    console.log("Google API response:", text);

    let result;
    try {
      result = JSON.parse(text);
    } catch (err) {
      console.error("Invalid JSON from Google API:", text);
      alert("Google API returned an invalid response.");
      return {
        success: false,
        error: "invalid_json",
        details: text
      };
    }

    if (!response.ok) {
      console.error("Google API failed:", response.status, result);
      alert("Google API failed: HTTP " + response.status);
      return result;
    }

    return result;
  } catch (err) {
    console.error("Google API POST failed:", err);
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
