const STAFF_PASSWORD = "pwdfsales2026";
const LOGIN_STORAGE_KEY = "pwdfStaffAuth";

const loginPanel = document.getElementById("loginPanel");
const dashboardPanel = document.getElementById("dashboardPanel");
const logoutBtn = document.getElementById("logoutBtn");
const loginBtn = document.getElementById("loginBtn");
const searchBtn = document.getElementById("searchBtn");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const draftContainer = document.getElementById("draftContainer");

function isStaffLoggedIn() {
  return sessionStorage.getItem(LOGIN_STORAGE_KEY) === "true";
}

function requireStaffLogin() {
  if (isStaffLoggedIn()) {
    loginPanel.classList.add("hidden");
    dashboardPanel.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
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
  if (passwordInput.value === STAFF_PASSWORD) {
    setStaffAuthenticated(true);
    passwordInput.value = "";
    requireStaffLogin();
  } else {
    alert("Invalid staff password.");
  }
}

function logoutStaff() {
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
        <th>Delivery Date</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  orders.forEach(order => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${order.orderRef || order.OrderRef || "-"}</td>
      <td>${order.customer || order.Customer || "-"}</td>
      <td>${order.company || order.Company || "-"}</td>
      <td>${order.deliveryDate || order.DeliveryDate || "-"}</td>
      <td><span class="status-pill ${getStatusClass(order.status || order.Status)}">${order.status || order.Status || "-"}</span></td>
      <td class="actions"></td>
    `;
    const actions = row.querySelector(".actions");
    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.onclick = () => openOrder(order.orderRef || order.OrderRef);
    actions.appendChild(openBtn);

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.onclick = () => openOrder(order.orderRef || order.OrderRef);
    actions.appendChild(editBtn);

    if (order.status === "Draft" || order.Status === "Draft") {
      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "Confirm";
      confirmBtn.onclick = () => confirmOrder(order.orderRef || order.OrderRef);
      actions.appendChild(confirmBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = () => cancelOrder(order.orderRef || order.OrderRef);
      actions.appendChild(cancelBtn);
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

loginBtn?.addEventListener("click", handleLogin);
logoutBtn?.addEventListener("click", logoutStaff);
searchBtn?.addEventListener("click", handleSearch);

requireStaffLogin();
