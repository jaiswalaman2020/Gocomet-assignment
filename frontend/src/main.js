const auctionList = document.querySelector("#auctionList");
const auctionDetail = document.querySelector("#auctionDetail");
const auctionForm = document.querySelector("#auctionForm");
const refreshButton = document.querySelector("#refreshButton");
const connectionState = document.querySelector("#connectionState");
const toast = document.querySelector("#toast");
const socket = window.io();

let selectedAuctionId = null;

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = `toast ${isError ? "error" : ""}`;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function toIsoFromLocal(value) {
  return new Date(value).toISOString();
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || "Request failed.");
  }
  return body;
}

function statusClass(status) {
  return status.toLowerCase().replace("_", "-");
}

function renderAuctionList(auctions) {
  if (!auctions.length) {
    auctionList.innerHTML = '<div class="empty-state">No British auctions yet.</div>';
    return;
  }

  auctionList.innerHTML = auctions
    .map(
      (auction) => `
        <button class="auction-row ${auction.id === selectedAuctionId ? "selected" : ""}" data-id="${auction.id}">
          <span>
            <strong>${auction.name}</strong>
            <small>${auction.referenceId}</small>
          </span>
          <span>${auction.currentLowestBid ? money.format(auction.currentLowestBid) : "No bids"}</span>
          <span>${formatDate(auction.currentBidCloseAt)}</span>
          <span>${formatDate(auction.forcedBidCloseAt)}</span>
          <mark class="${statusClass(auction.status)}">${auction.status.replace("_", " ")}</mark>
        </button>
      `
    )
    .join("");

  auctionList.querySelectorAll(".auction-row").forEach((row) => {
    row.addEventListener("click", () => selectAuction(row.dataset.id));
  });
}

async function loadAuctions() {
  const auctions = await api("/rfqs");
  renderAuctionList(auctions);
}

function renderBids(bids) {
  if (!bids.length) return '<div class="empty-state">No bids submitted yet.</div>';

  return `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Carrier</th>
          <th>Total</th>
          <th>Charges</th>
          <th>Transit</th>
          <th>Validity</th>
        </tr>
      </thead>
      <tbody>
        ${bids
          .map(
            (bid) => `
              <tr>
                <td><strong>${bid.rank}</strong></td>
                <td>${bid.carrierName}</td>
                <td>${money.format(bid.totalAmount)}</td>
                <td>${money.format(bid.freightCharges)} / ${money.format(bid.originCharges)} / ${money.format(bid.destinationCharges)}</td>
                <td>${bid.transitTimeDays} days</td>
                <td>${formatDate(bid.quoteValidityAt)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderActivity(logs) {
  if (!logs.length) return '<div class="empty-state">No activity recorded.</div>';

  return logs
    .map(
      (log) => `
        <li>
          <strong>${log.type.replace("_", " ")}</strong>
          <span>${log.message}</span>
          <small>${formatDate(log.createdAt)}</small>
        </li>
      `
    )
    .join("");
}

function renderAuctionDetail(auction) {
  const template = document.querySelector("#bidFormTemplate").content.cloneNode(true);
  auctionDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${auction.referenceId}</p>
        <h2>${auction.name}</h2>
      </div>
      <mark class="${statusClass(auction.status)}">${auction.status.replace("_", " ")}</mark>
    </div>
    <div class="metrics">
      <div><small>Current Close</small><strong>${formatDate(auction.currentBidCloseAt)}</strong></div>
      <div><small>Forced Close</small><strong>${formatDate(auction.forcedBidCloseAt)}</strong></div>
      <div><small>Trigger Window</small><strong>${auction.triggerWindowMinutes} min</strong></div>
      <div><small>Extension</small><strong>${auction.extensionDurationMinutes} min</strong></div>
    </div>
    <div class="config-line">Trigger: ${auction.extensionTrigger.replaceAll("_", " ")}</div>
    <h3>Submit Quote</h3>
    <div id="bidFormMount"></div>
    <h3>Supplier Ranking</h3>
    ${renderBids(auction.bids)}
    <h3>Activity Log</h3>
    <ul class="activity-log">${renderActivity(auction.activityLogs)}</ul>
  `;

  auctionDetail.querySelector("#bidFormMount").appendChild(template);
  auctionDetail.querySelector("#bidForm").addEventListener("submit", submitBid);
}

async function selectAuction(id) {
  if (selectedAuctionId) socket.emit("auction:leave", selectedAuctionId);
  selectedAuctionId = id;
  socket.emit("auction:join", id);
  await loadAuctions();
  const auction = await api(`/rfqs/${id}`);
  renderAuctionDetail(auction);
}

async function submitBid(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.quoteValidityAt = toIsoFromLocal(payload.quoteValidityAt);

  try {
    const result = await api(`/rfqs/${selectedAuctionId}/bids`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    showToast(result.extension ? `Bid submitted. ${result.extension.reason}` : "Bid submitted.");
    await selectAuction(selectedAuctionId);
  } catch (error) {
    showToast(error.message, true);
  }
}

auctionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(auctionForm).entries());
  for (const field of ["bidStartAt", "initialBidCloseAt", "forcedBidCloseAt", "pickupServiceAt"]) {
    payload[field] = toIsoFromLocal(payload[field]);
  }
  payload.triggerWindowMinutes = Number(payload.triggerWindowMinutes);
  payload.extensionDurationMinutes = Number(payload.extensionDurationMinutes);

  try {
    const auction = await api("/rfqs", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    auctionForm.reset();
    showToast("Auction created.");
    await selectAuction(auction.id);
  } catch (error) {
    showToast(error.message, true);
  }
});

refreshButton.addEventListener("click", loadAuctions);

socket.on("connect", () => {
  connectionState.textContent = "Live";
  connectionState.classList.remove("offline");
});

socket.on("disconnect", () => {
  connectionState.textContent = "Offline";
  connectionState.classList.add("offline");
});

socket.on("auction:list-updated", loadAuctions);
socket.on("auction:updated", async ({ rfqId }) => {
  if (rfqId === selectedAuctionId) await selectAuction(rfqId);
});

loadAuctions().catch((error) => showToast(error.message, true));
