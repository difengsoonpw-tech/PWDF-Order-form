const API_URL = "https://script.google.com/macros/s/AKfycbyzjefQAgtsElv6ks29yZLt5Mb0oFpHR83r2y4UwoQ7UdWPdrCv2rnLwvvkhuV-UX_4/exec";
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
    console.warn("Google API POST failed, attempting JSONP fallback:", err);

    // JSONP fallback: create a script tag with callback and payload
    return await new Promise((resolve) => {
      const cbName = '__pwdf_cb_' + Date.now() + '_' + Math.floor(Math.random()*10000);
      window[cbName] = function(res) {
        try { resolve(res); } finally { try { delete window[cbName]; } catch(e){} }
      };

      const payloadParam = encodeURIComponent(JSON.stringify(body));
      const script = document.createElement('script');
      script.src = `${API_URL}?callback=${cbName}&payload=${payloadParam}`;
      script.onerror = function(e) {
        try { delete window[cbName]; } catch(e){}
        resolve({ success: false, error: 'jsonp_error' });
      };
      document.head.appendChild(script);
      // cleanup after a timeout in case callback never fires
      setTimeout(() => {
        if (window[cbName]) {
          try { delete window[cbName]; } catch(e){}
          resolve({ success: false, error: 'jsonp_timeout' });
        }
      }, 10000);
    });
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
