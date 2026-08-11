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
    return;
  }
  const order = await fetchOrder(orderRef);
  if (!order) {
    alert("Unable to load order.");
    return;
  }
  existingOrder = order;
  CURRENT_ORDER_REF = order.orderRef || order.OrderRef || orderRef;
  populateOrderHeader(order);
  populateCustomerFields(order);
  CART = parseOrderCart(order);
  renderCart();
  updateCounts();
  populateCategoryFilter();
}

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

  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(item => ({
    item: item.name || item.item || "",
    qty: Number(item.qty) || 1,
    choice: item.choice || item.remark || "",
    addon: item.addon || "",
    category: item.category || ""
  }));
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
      if (t) window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, "_blank");
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
  window.location.href = "staff.html";
}

window.addEventListener("DOMContentLoaded", () => {
  populateCategoryFilter();
  if (orderRef) loadOrderForEditing();
});
