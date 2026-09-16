const orderRefLabel = document.getElementById("orderRefLabel");
const orderStatusLabel = document.getElementById("orderStatusLabel");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const confirmOrderBtn = document.getElementById("confirmOrderBtn");
const customerRemarks = document.getElementById("customerRemarks");

let existingOrder = null;
const urlParams = new URLSearchParams(window.location.search);
const orderRef = urlParams.get("orderRef");

function getOrderInputValues() {
  return {
    customer: document.getElementById("customerName").value.trim(),
    company: document.getElementById("brandName").value.trim(),
    contact: document.getElementById("contactNumber").value.trim(),
    deliveryDate: document.getElementById("deliveryDate").value,
    notes: document.getElementById("customerRemarks").value.trim(),
    cart: CART
  };
}

function populateOrderHeader(order) {
  orderRefLabel.textContent = `Order Ref: ${order.orderRef || order.OrderRef}`;
  orderStatusLabel.textContent = `Status: ${order.status || order.Status}`;
}

function populateCustomerFields(order) {
  document.getElementById("customerName").value = order.customer || order.Customer || "";
  document.getElementById("brandName").value = order.company || order.Company || "";
  document.getElementById("contactNumber").value = order.contact || order.Contact || "";
  document.getElementById("deliveryDate").value = order.deliveryDate || order.DeliveryDate || "";
  customerRemarks.value = order.notes || order.Notes || "";
}

async function loadOrderForEditing() {
  if (!orderRef) {
    alert("No order reference provided.");
    return false;
  }
  const order = await fetchOrder(orderRef);
  if (!order) {
    alert("Unable to load order " + orderRef + ".\nIt may have been renamed or removed.");
    return false;
  }
  existingOrder = order;
  CURRENT_ORDER_REF = order.orderRef || order.OrderRef || orderRef;
  populateOrderHeader(order);
  populateCustomerFields(order);
  CART = parseOrderCart(order);
  return true;
}

/* The sheet keeps the decoration add-on glued onto the end of the choice in a
   single Remark column — see normalizeOrderItems in order.js, which writes
   `${choice} ${addon}`. The add-on is always exactly this one phrase, so it
   can be pulled back off again cleanly rather than being lost on re-save. */
function splitRemark(remark) {
  const text = String(remark == null ? "" : remark).trim();
  if (!text) return { choice: "", addon: "" };
  const at = text.indexOf(DECORATION_PRICE_TEXT);
  if (at === -1) return { choice: text, addon: "" };
  return { choice: text.slice(0, at).trim(), addon: DECORATION_PRICE_TEXT };
}

/* Rebuilds the saved order as a CART — the same Map, with the same keys, that
   script.js.js's renderer, stepper and pricing all expect. Must run AFTER the
   catalogue has loaded, because that is what supplies each line's category
   (the sheet's detail rows don't carry it) and the decoration rule depends on
   it. */
function parseOrderCart(order) {
  const itemsSource = order.items || order.Items || order.orderJson || order.OrderJson || "[]";
  let items = itemsSource;

  if (typeof itemsSource === "string") {
    try {
      items = JSON.parse(itemsSource);
    } catch (err) {
      console.warn("Invalid order JSON", err);
      items = [];
    }
  }

  const cart = new Map();
  if (!Array.isArray(items)) return cart;

  const byCode = new Map();
  ALL_PRODUCTS.forEach(p => { if (p && p.code) byCode.set(String(p.code), p); });

  items.forEach(item => {
    const name = item.name || item.item || "";
    // The real product code is stored in the sheet's detail row. Use it.
    const code = String(item.code || "").trim() || name.split(" ")[0];
    const product = byCode.get(code);
    const parts = item.choice !== undefined || item.addon !== undefined
      ? { choice: item.choice || "", addon: item.addon || "" }
      : splitRemark(item.remark);

    const line = {
      code: code,
      name: product ? product.name : name,
      category: item.category || (product ? product.category : ""),
      choice: parts.choice,
      addon: parts.addon,
      qty: Math.max(1, Math.floor(Number(item.qty) || 1))
    };
    cart.set(cartKey(line.code, line.choice), line);
  });

  return cart;
}

async function saveDraftOrder() {
  if (!existingOrder) return;
  const payload = buildOrderPayload({
    orderRef: existingOrder.orderRef || existingOrder.OrderRef,
    customer: getOrderInputValues().customer,
    company: getOrderInputValues().company,
    contact: getOrderInputValues().contact,
    deliveryDate: getOrderInputValues().deliveryDate,
    status: existingOrder.status || existingOrder.Status || "Draft",
    notes: getOrderInputValues().notes,
    cart: CART,
    createdDate: existingOrder.createdDate || existingOrder.CreatedDate,
    updatedDate: new Date().toISOString()
  });
  await saveOrderPayload(payload);
  alert("Draft saved.");
}

async function confirmOrderEdit() {
  if (!existingOrder) return;
  const payload = buildOrderPayload({
    orderRef: existingOrder.orderRef || existingOrder.OrderRef,
    customer: getOrderInputValues().customer,
    company: getOrderInputValues().company,
    contact: getOrderInputValues().contact,
    deliveryDate: getOrderInputValues().deliveryDate,
    status: "Confirmed",
    notes: getOrderInputValues().notes,
    cart: CART,
    createdDate: existingOrder.createdDate || existingOrder.CreatedDate,
    updatedDate: new Date().toISOString()
  });
  await saveOrderPayload(payload);
  await triggerMakeWebhook({ event: "order.confirmed", orderRef: payload.orderRef });
  alert("Order confirmed.");
  window.location.href = "staff.html";
}

saveDraftBtn?.addEventListener("click", saveDraftOrder);
confirmOrderBtn?.addEventListener("click", confirmOrderEdit);

const resubmitBtn = document.getElementById("resubmitBtn");
resubmitBtn?.addEventListener("click", resubmitOrder);

async function resubmitOrder() {
  if (!existingOrder) {
    alert("No order loaded to resubmit.");
    return;
  }

  // Open chooser modal
  const popup = document.getElementById("resubmitPopup");
  if (!popup) {
    // fallback: directly save and open review
    await saveOrderToGoogleSheet();
    openOrderReview();
    return;
  }
  popup.style.display = "flex";

  // hook buttons
  const waBtn = document.getElementById("resubmitWhatsAppBtn");
  const emailBtn = document.getElementById("resubmitEmailBtn");
  const cancelBtn = document.getElementById("resubmitCancelBtn");

  const cleanup = () => {
    popup.style.display = "none";
    waBtn.removeEventListener("click", onWa);
    emailBtn.removeEventListener("click", onEmail);
    cancelBtn.removeEventListener("click", onCancel);
  };

  const onCancel = () => cleanup();

    const onWa = async () => {
    try {
      await saveOrderToGoogleSheet();
      const t = buildText();
      if (t) {
        const waNumber = '60143755008';
        window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(t)}`, "_blank");
      }
      alert("Order saved and opened in WhatsApp.");
    } catch (err) {
      console.error(err);
      alert("Failed to save order before WhatsApp.");
    }
    cleanup();
  };

  const onEmail = async () => {
    try {
      await saveOrderToGoogleSheet();
      const t = buildText();
      if (t) window.location.href = `mailto:?subject=Order ${encodeURIComponent(existingOrder.orderRef || existingOrder.OrderRef || '')}&body=${encodeURIComponent(t)}`;
      alert("Order saved and email composer opened.");
    } catch (err) {
      console.error(err);
      alert("Failed to save order before opening email.");
    }
    cleanup();
  };

  waBtn.addEventListener("click", onWa);
  emailBtn.addEventListener("click", onEmail);
  cancelBtn.addEventListener("click", onCancel);
}

function logoutStaff() {
  sessionStorage.removeItem("pwdfStaffAuth");
  setStaffToken("");
  window.location.href = "staff.html";
}

/* Keeps the small "Items: n" counter under the cart in step. The rest of the
   cart UI is script.js.js's refreshCartUI(). */
function updateCartCountLabel() {
  const el = document.getElementById("cartCountBottom");
  if (el) el.textContent = String(cartQtyTotal());
}
// script.js.js calls this every time the cart changes.
window.PWDF_ON_CART_CHANGE = updateCartCountLabel;

window.addEventListener("DOMContentLoaded", async () => {
  // This page edits existing orders, so it is staff-only. The server also
  // enforces this, but redirecting here gives a clearer experience than
  // showing an empty page.
  if (!getStaffToken()) {
    alert("Please log in as staff first.");
    window.location.href = "staff.html";
    return;
  }

  /* Order matters. The catalogue has to be in memory before the order is
     parsed, because parseOrderCart looks each saved line up by code to
     recover its category and current name. Then the list is redrawn so the
     steppers show the saved quantities, and the cart panel is filled in. */
  await loadProducts();

  if (!orderRef) {
    alert("No order reference provided.");
    return;
  }

  const loaded = await loadOrderForEditing();
  if (!loaded) return;

  renderProductList();
  refreshCartUI();
  updateCartCountLabel();
  /* Nothing in this order has been priced yet — the sheet stores quantities,
     not money. Ask the server once for the lines it contains, after which
     every quantity change on this page is worked out locally. */
  schedulePricingRefresh();
});
