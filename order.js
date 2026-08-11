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
  const body = orderPayload && orderPayload.action === "saveOrder" && orderPayload.order
    ? orderPayload.order
    : orderPayload;
  return await postToGoogleApi(body);
}

async function updateOrderPayload(orderRef, updates) {
  return await postToGoogleApi({
    action: "updateOrder",
    orderRef,
    updates
  });
}

async function fetchOrder(orderRef) {
  const result = await getFromGoogleApi({
    action: "getorder",
    orderRef
  });
  if (!result || result.success === false) return null;
  if (!result.orderRef && !result.OrderRef) return null;
  return result;
}

async function searchOrders(query) {
  const result = await getFromGoogleApi({
    action: "searchorders",
    query: query || ""
  });
  if (Array.isArray(result)) return result;
  return {
    error: result && result.message ? result.message : "Search failed",
    payload: result
  };
}

async function getOrdersByDate(date) {
  if (!date) return [];
  // date expected in yyyy-MM-dd (input[type=date] gives yyyy-MM-dd)
  const result = await getFromGoogleApi({
    action: "getordersbydate",
    date: date
  });
  return Array.isArray(result) ? result : [];
}

async function fetchDraftOrders() {
  return await getFromGoogleApi({
    action: "getdraftorders"
  });
}
