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
  populateOrderHeader(order);
  populateCustomerFields(order);
  CART = parseOrderCart(order);
  renderCart();
  updateCounts();
  populateCategoryFilter();
}

function parseOrderCart(order) {
  const json = order.orderJson || order.OrderJson || order.orderJson || "[]";
  try {
    const items = typeof json === "string" ? JSON.parse(json) : json;
    return items.map(item => ({
      item: item.name || "",
      qty: Number(item.qty) || 1,
      choice: item.choice || item.remark || "",
      addon: item.addon || "",
      category: item.category || ""
    }));
  } catch (err) {
    console.warn("Invalid order JSON", err);
    return [];
  }
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

function logoutStaff() {
  sessionStorage.removeItem("pwdfStaffAuth");
  window.location.href = "staff.html";
}

window.addEventListener("DOMContentLoaded", () => {
  populateCategoryFilter();
  if (orderRef) loadOrderForEditing();
});
