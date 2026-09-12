/* The staff password is NOT stored here any more.
   It lives in Script Properties inside the Google Apps Script project and is
   checked by the server. See PWDF-Order-API.gs for setup instructions. */
const LOGIN_STORAGE_KEY = "pwdfStaffAuth";

const loginPanel = document.getElementById("loginPanel");
const dashboardPanel = document.getElementById("dashboardPanel");
const logoutBtn = document.getElementById("logoutBtn");
const loginBtn = document.getElementById("loginBtn");
const searchBtn = document.getElementById("searchBtn");
const searchInput = document.getElementById("searchInput");
const dateFilterBtn = document.getElementById("dateFilterBtn");
const dateInput = document.getElementById("dateInput");
const searchResults = document.getElementById("searchResults");
const draftContainer = document.getElementById("draftContainer");
const opNeededContainer = document.getElementById("opNeededContainer");
const opNeededCount = document.getElementById("opNeededCount");

function isStaffLoggedIn() {
  // The token itself is the credential — if we hold one, we are logged in.
  return !!getStaffToken();
}

function requireStaffLogin() {
  if (isStaffLoggedIn()) {
    loginPanel.classList.add("hidden");
    dashboardPanel.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    loadOpNeeded();
    loadDraftOrders();
    renderSearchResults([]);
  } else {
    loginPanel.classList.remove("hidden");
    dashboardPanel.classList.add("hidden");
    logoutBtn.classList.add("hidden");
  }
}

function setStaffAuthenticated(value) {
  sessionStorage.setItem(LOGIN_STORAGE_KEY, value ? "true" : "false");
}

async function handleLogin() {
  const passwordInput = document.getElementById("staffPassword");
  if (!passwordInput) return;

  const entered = passwordInput.value.trim();
  if (!entered) {
    alert("Please enter the staff password.");
    return;
  }

  const originalLabel = loginBtn ? loginBtn.textContent : "Login";
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Checking…";
  }

  // The password is checked by the server, never in the browser.
  const accepted = await verifyStaffToken(entered);

  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.textContent = originalLabel;
  }

  if (accepted) {
    setStaffToken(entered);
    setStaffAuthenticated(true);
    passwordInput.value = "";
    requireStaffLogin();
  } else {
    passwordInput.value = "";
    alert("Invalid staff password.");
  }
}

function logoutStaff() {
  setStaffToken("");
  setStaffAuthenticated(false);
  requireStaffLogin();
}

async function loadDraftOrders() {
  draftContainer.innerHTML = "<p>Loading draft orders…</p>";
  const orders = await fetchDraftOrders() || [];
  if (!orders.length) {
    draftContainer.innerHTML = "<p>No draft orders available.</p>";
    return;
  }
  draftContainer.innerHTML = "";
  renderOrderTable(orders, draftContainer, true);
}

/*****************************************************
 * "AWAITING OPERATIONS" CHECKLIST
 *
 * A Confirmed order that hasn't been marked sent yet means nobody has told
 * the Operations/kitchen team about it. This list is deliberately shown at
 * the very top of the dashboard so it can't be missed.
 *****************************************************/
async function loadOpNeeded() {
  opNeededContainer.innerHTML = "<p>Loading…</p>";
  const orders = await fetchOrdersNeedingOp() || [];
  if (!orders.length) {
    opNeededContainer.innerHTML = "<p>✓ Nothing waiting — every confirmed order has been sent to Operations.</p>";
    opNeededCount.textContent = "";
    opNeededCount.classList.add("hidden");
    return;
  }
  opNeededCount.textContent = orders.length;
  opNeededCount.classList.remove("hidden");
  renderOpNeededTable(orders);
}

function renderOpNeededTable(orders) {
  const table = document.createElement("table");
  table.className = "order-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Order Ref</th>
        <th>Customer</th>
        <th>Company</th>
        <th>Delivery Date</th>
        <th>Items</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  orders.forEach(order => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${order.orderRef || "-"}</td>
      <td>${order.customer || "-"}</td>
      <td>${order.company || "-"}</td>
      <td>${order.deliveryDate || "-"}</td>
      <td>${order.itemCount || 0}</td>
      <td class="actions"></td>
    `;
    const actions = row.querySelector(".actions");
    const sendBtn = document.createElement("button");
    sendBtn.textContent = "📋 Copy & mark sent to OP";
    sendBtn.onclick = () => copyAndMarkSentToOp(order.orderRef);
    actions.appendChild(sendBtn);
    tbody.appendChild(row);
  });
  opNeededContainer.innerHTML = "";
  opNeededContainer.appendChild(table);
}

/* Builds the plain-text message staff paste into an email or WhatsApp to
   Operations, using the same wording style as the rest of the site. */
function buildOpMessage(order) {
  let text = `📦 ORDER FOR OPERATIONS\n\nOrder Ref: ${order.orderRef}\nCustomer: ${order.customer || "-"}\nCompany: ${order.company || "-"}\nContact: ${order.contact || "-"}\nDelivery Date: ${order.deliveryDate || "-"}\n\nITEMS:\n`;
  (order.items || []).forEach(item => {
    text += `${item.qty || 0} x ${item.name || item.code || "-"}${item.remark ? ` (${item.remark})` : ""}\n`;
  });
  text += `\n(Confirmed by Sales — please proceed with preparation.)`;
  return text;
}

/* Copies the OP-ready message to the clipboard (falling back to a visible
   prompt if the clipboard API isn't available) and marks the order sent —
   both in one click, so the step is never forgotten. */
async function copyAndMarkSentToOp(orderRef) {
  const order = await fetchOrder(orderRef);
  if (!order) {
    alert("Could not load this order's details.");
    return;
  }
  const text = buildOpMessage(order);

  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (err) {
    copied = false;
  }

  if (!copied) {
    window.prompt("Could not copy automatically — select all the text below (it's already highlighted) and copy it manually:", text);
  }

  const result = await sendOrderToOp(orderRef, true);
  if (!result || result.success !== true) {
    alert("Copied the message, but could not mark this order as sent — please try clicking the button again.");
    return;
  }

  if (copied) {
    alert("Copied! Paste it into your email or WhatsApp to Operations.\n\nMarked as sent — it will drop off this list.");
  }
  await loadOpNeeded();
  await loadDraftOrders();
}

async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    alert("Enter an order reference.");
    return;
  }
  console.log("Searching orders for", query);
  searchResults.innerHTML = "<p>Searching orders…</p>";

  let orders = [];
  const orderRefPattern = /^PWDF-\d{8}-\d{3}$/i;
  if (orderRefPattern.test(query)) {
    const order = await fetchOrder(query);
    if (order) {
      orders = [order];
    }
  }

  let apiError = null;
  if (!orders.length) {
    const searchResultsData = await searchOrders(query);
    if (Array.isArray(searchResultsData)) {
      orders = searchResultsData.filter(order => order && (order.orderRef || order.OrderRef));
    } else {
      apiError = searchResultsData.error || "Search failed";
    }
  }

  console.log("Search result", orders, apiError);
  renderSearchResults(orders, apiError);
}

async function filterByDate(date) {
  console.log("filterByDate called", date);
  if (!date) {
    console.log("No date selected");
    searchResults.innerHTML = "<p>Please select a delivery or created date to filter orders.</p>";
    return;
  }
  const orders = await getOrdersByDate(date);
  console.log("Date filter orders", orders);
  if (!orders || !orders.length) {
    searchResults.innerHTML = `<p>No orders found for <strong>${date}</strong>.</p>`;
    return;
  }
  renderSearchResults(orders);
}

function renderSearchResults(orders, apiError) {
  if ((!orders || !orders.length) && apiError) {
    searchResults.innerHTML = `<p>Error searching orders: ${apiError}</p>`;
    return;
  }
  if (!orders || !orders.length) {
    searchResults.innerHTML = "<p>No matching orders found.</p>";
    return;
  }
  renderOrderTable(orders, searchResults, false);
}

function renderOrderTable(orders, container, isDraftList) {
  const table = document.createElement("table");
  table.className = "order-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Order Ref</th>
        <th>Customer</th>
        <th>Company</th>
        <th>Order Date</th>
        <th>Delivery Date</th>
        <th>Status</th>
        <th>Sent to OP</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  orders.forEach(order => {
    const orderRef = order.orderRef || order.OrderRef;
    const status = order.status || order.Status;
    const sentToOp = !!(order.sentToOp || order.opSentDate);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${orderRef || "-"}</td>
      <td>${order.customer || order.Customer || "-"}</td>
      <td>${order.company || order.Company || "-"}</td>
      <td>${order.orderDate || order.OrderDate || order.createdDate || order.CreatedDate || "-"}</td>
      <td>${order.deliveryDate || order.DeliveryDate || "-"}</td>
      <td><span class="status-pill ${getStatusClass(status)}">${status || "-"}</span></td>
      <td>${status === "Confirmed" ? (sentToOp ? `<span class="status-pill status-confirmed">✓ Sent${order.opSentDate ? " " + order.opSentDate : ""}</span>` : `<span class="status-pill status-draft">Not sent</span>`) : "—"}</td>
      <td class="actions"></td>
    `;
    const actions = row.querySelector(".actions");
    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.onclick = () => openOrder(orderRef);
    actions.appendChild(openBtn);

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.onclick = () => openOrder(orderRef);
    actions.appendChild(editBtn);

    if (status === "Draft") {
      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "Confirm";
      confirmBtn.onclick = () => confirmOrder(orderRef);
      actions.appendChild(confirmBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = () => cancelOrder(orderRef);
      actions.appendChild(cancelBtn);
    }

    if (status === "Confirmed") {
      const opBtn = document.createElement("button");
      opBtn.textContent = sentToOp ? "Undo sent-to-OP" : "📋 Copy & mark sent to OP";
      opBtn.onclick = async () => {
        if (sentToOp) {
          if (!confirm("Mark this order as NOT yet sent to Operations?")) return;
          await sendOrderToOp(orderRef, false);
          await loadOpNeeded();
          renderSearchResults(await searchOrders(orderRef));
        } else {
          await copyAndMarkSentToOp(orderRef);
        }
      };
      actions.appendChild(opBtn);
    }

    tbody.appendChild(row);
  });
  container.innerHTML = "";
  container.appendChild(table);
}

function getStatusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "confirmed") return "status-confirmed";
  if (normalized === "cancelled") return "status-cancelled";
  return "status-draft";
}

function openOrder(orderRef) {
  if (!orderRef) return;
  window.location.href = `edit.html?orderRef=${encodeURIComponent(orderRef)}`;
}

async function confirmOrder(orderRef) {
  if (!confirm("Confirm this order and send it to Operations?")) return;
  await updateOrderPayload(orderRef, {
    status: "Confirmed",
    updatedDate: new Date().toISOString()
  });
  await triggerMakeWebhook({ event: "order.confirmed", orderRef });
  alert("Order confirmed.");
  await loadDraftOrders();
}

async function cancelOrder(orderRef) {
  if (!confirm("Cancel this draft order?")) return;
  await updateOrderPayload(orderRef, {
    status: "Cancelled",
    updatedDate: new Date().toISOString()
  });
  alert("Order cancelled.");
  await loadDraftOrders();
}

window.addEventListener("DOMContentLoaded", () => {
  loginBtn?.addEventListener("click", handleLogin);
  logoutBtn?.addEventListener("click", logoutStaff);
  searchBtn?.addEventListener("click", handleSearch);
  dateFilterBtn?.addEventListener("click", () => {
    const selectedDate = dateInput?.value || "";
    console.log("Date filter clicked", selectedDate);
    filterByDate(selectedDate);
  });
  requireStaffLogin();
});
