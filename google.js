const API_URL = "https://script.google.com/macros/s/AKfycbyzjefQAgtsElv6ks29yZLt5Mb0oFpHR83r2y4UwoQ7UdWPdrCv2rnLwvvkhuV-UX_4/exec";
// Set your Make webhook URL here when available (e.g. https://hook.us1.make.com/xxxxx)
const MAKE_WEBHOOK_URL = "https://hook.us1.make.com/your-webhook-url"; // Replace with actual Make.com webhook when ready

function isMobile() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

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
    console.warn("Google API POST failed:", err);

    // Try form-encoded POST (avoids CORS preflight) as a fallback before JSONP
    try {
      const respForm = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'payload=' + encodeURIComponent(JSON.stringify(body))
      });
      const textForm = await respForm.text();
      try {
        const resultForm = JSON.parse(textForm);
        if (respForm.ok) return resultForm;
      } catch (e) {
        console.warn('Form POST returned non-JSON or parse failed', e, textForm);
      }
    } catch (e) {
      console.warn('Form POST attempt failed', e);
    }

    console.warn("Attempting JSONP fallback after fetch failure:", err);

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

async function triggerMakeWebhook(payload, options = { mode: 'cors', expectJson: true }) {
  const mode = (options && options.mode) || 'cors';
  const expectJson = typeof (options && options.expectJson) === 'boolean' ? options.expectJson : true;
  try {
    const resp = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      mode: mode
    });

    // If caller doesn't expect JSON (no-cors), return a best-effort success
    if (!expectJson) return { success: true, forwarded: true, mode };

    // If response is opaque (no-cors), return best-effort success
    if (!resp || resp.type === 'opaque') return { success: true, forwarded: 'opaque', mode };

    if (!resp.ok) return { success: false, status: resp.status };

    try {
      const json = await resp.json();
      return json;
    } catch (e) {
      return { success: true, forwarded: true, mode };
    }
  } catch (err) {
    console.warn('Make webhook failed', err);
    return null;
  }
}
