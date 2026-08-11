function generateOrderRef() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = now.getHours().toString().padStart(2, "0") + now.getMinutes().toString().padStart(2, "0");
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `PWDF-${datePart}-${timePart}-${randomPart}`;
}

function normalizeOrderItems(cart) {
  return cart.map(item => ({
    code: (item.item || "").split(" ")[0],
    name: item.item || "",
    qty: item.qty || 0,
    remark: `${item.choice || ""} ${item.addon || ""}`.trim(),
    choice: item.choice || "",
    addon: item.addon || "",
    category: item.category || ""
  }));
}

function buildOrderPayload({
  orderRef,
  customer,
  company,
  contact,
  deliveryDate,
  status = "Draft",
  notes = "",
  cart = [],
  createdDate,
  updatedDate
}) {
  const now = new Date().toISOString();
  return {
    orderRef: orderRef || generateOrderRef(),
    customer: customer || "",
    company: company || "",
    contact: contact || "",
    deliveryDate: deliveryDate || "",
    status,
    orderJson: JSON.stringify(normalizeOrderItems(cart)),
    notes: notes || "",
    createdDate: createdDate || now,
    updatedDate: updatedDate || now,
    items: normalizeOrderItems(cart)
  };
}

async function saveOrderPayload(orderPayload) {
  return await postToGoogleApi({
    action: "saveOrder",
    order: orderPayload
  });
}

async function updateOrderPayload(orderRef, updates) {
  return await postToGoogleApi({
    action: "updateOrder",
    orderRef,
    updates
  });
}

async function fetchOrder(orderRef) {
  return await getFromGoogleApi({
    action: "getOrder",
    orderRef
  });
}

async function searchOrders(query) {
  return await getFromGoogleApi({
    action: "searchOrders",
    query: query || ""
  });
}

async function fetchDraftOrders() {
  return await getFromGoogleApi({
    action: "getDraftOrders"
  });
}
