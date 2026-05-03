import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

const initialAuctionForm = {
  name: "",
  referenceId: "",
  bidStartAt: "",
  initialBidCloseAt: "",
  forcedBidCloseAt: "",
  pickupServiceAt: "",
  triggerWindowMinutes: 10,
  extensionDurationMinutes: 5,
  extensionTrigger: "BID_RECEIVED"
};

const initialBidForm = {
  carrierName: "",
  freightCharges: "",
  originCharges: "",
  destinationCharges: "",
  transitTimeDays: "",
  quoteValidityAt: ""
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function toIsoFromLocal(value) {
  return new Date(value).toISOString();
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function statusClass(status) {
  return status.toLowerCase().replace("_", "-");
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

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timeout);
  }, [toast, onClose]);

  if (!toast) return null;

  return <div className={`toast ${toast.isError ? "error" : ""}`}>{toast.message}</div>;
}

function AuctionForm({ onCreated, onToast }) {
  const [form, setForm] = useState(initialAuctionForm);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitAuction(event) {
    event.preventDefault();

    const payload = {
      ...form,
      bidStartAt: toIsoFromLocal(form.bidStartAt),
      initialBidCloseAt: toIsoFromLocal(form.initialBidCloseAt),
      forcedBidCloseAt: toIsoFromLocal(form.forcedBidCloseAt),
      pickupServiceAt: toIsoFromLocal(form.pickupServiceAt),
      triggerWindowMinutes: Number(form.triggerWindowMinutes),
      extensionDurationMinutes: Number(form.extensionDurationMinutes)
    };

    try {
      const auction = await api("/rfqs", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm(initialAuctionForm);
      onToast("Auction created.");
      onCreated(auction.id);
    } catch (error) {
      onToast(error.message, true);
    }
  }

  return (
    <section className="panel create-panel">
      <h2>Create RFQ</h2>
      <form className="stack" onSubmit={submitAuction}>
        <label>
          RFQ Name
          <input name="name" value={form.name} onChange={updateField} required placeholder="Mumbai to Dubai Freight" />
        </label>
        <label>
          Reference ID
          <input name="referenceId" value={form.referenceId} onChange={updateField} required placeholder="RFQ-2026-001" />
        </label>
        <label>
          Bid Start
          <input name="bidStartAt" type="datetime-local" value={form.bidStartAt} onChange={updateField} required />
        </label>
        <label>
          Bid Close
          <input name="initialBidCloseAt" type="datetime-local" value={form.initialBidCloseAt} onChange={updateField} required />
        </label>
        <label>
          Forced Close
          <input name="forcedBidCloseAt" type="datetime-local" value={form.forcedBidCloseAt} onChange={updateField} required />
        </label>
        <label>
          Pickup / Service Date
          <input name="pickupServiceAt" type="datetime-local" value={form.pickupServiceAt} onChange={updateField} required />
        </label>
        <div className="inline-fields">
          <label>
            Trigger Window
            <input name="triggerWindowMinutes" type="number" min="1" value={form.triggerWindowMinutes} onChange={updateField} required />
          </label>
          <label>
            Extension
            <input name="extensionDurationMinutes" type="number" min="1" value={form.extensionDurationMinutes} onChange={updateField} required />
          </label>
        </div>
        <label>
          Extension Trigger
          <select name="extensionTrigger" value={form.extensionTrigger} onChange={updateField} required>
            <option value="BID_RECEIVED">Bid received in last X minutes</option>
            <option value="ANY_RANK_CHANGE">Any supplier rank change</option>
            <option value="L1_RANK_CHANGE">Lowest bidder rank change</option>
          </select>
        </label>
        <button type="submit">Create Auction</button>
      </form>
    </section>
  );
}

function AuctionList({ auctions, selectedAuctionId, connectionState, onSelect, onRefresh }) {
  return (
    <section className="panel list-panel">
      <div className="section-head">
        <h2>Auctions</h2>
        <div className="list-actions">
          <span className={`status-dot ${connectionState === "Offline" ? "offline" : ""}`}>{connectionState}</span>
          <button className="icon-button" title="Refresh auctions" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>
      <div className="auction-list">
        {!auctions.length ? (
          <div className="empty-state">No British auctions yet.</div>
        ) : (
          auctions.map((auction) => (
            <button
              className={`auction-row ${auction.id === selectedAuctionId ? "selected" : ""}`}
              key={auction.id}
              onClick={() => onSelect(auction.id)}
            >
              <span>
                <strong>{auction.name}</strong>
                <small>{auction.referenceId}</small>
              </span>
              <span>{auction.currentLowestBid ? money.format(auction.currentLowestBid) : "No bids"}</span>
              <span>{formatDate(auction.currentBidCloseAt)}</span>
              <span>{formatDate(auction.forcedBidCloseAt)}</span>
              <mark className={statusClass(auction.status)}>{auction.status.replace("_", " ")}</mark>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function BidForm({ auctionId, onBidSubmitted, onToast }) {
  const [form, setForm] = useState(initialBidForm);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitBid(event) {
    event.preventDefault();

    try {
      const result = await api(`/rfqs/${auctionId}/bids`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          quoteValidityAt: toIsoFromLocal(form.quoteValidityAt)
        })
      });
      setForm(initialBidForm);
      onToast(result.extension ? `Bid submitted. ${result.extension.reason}` : "Bid submitted.");
      onBidSubmitted();
    } catch (error) {
      onToast(error.message, true);
    }
  }

  return (
    <form className="bid-form" onSubmit={submitBid}>
      <label>
        Carrier
        <input name="carrierName" value={form.carrierName} onChange={updateField} required placeholder="Carrier A" />
      </label>
      <label>
        Freight
        <input name="freightCharges" type="number" min="0" step="0.01" value={form.freightCharges} onChange={updateField} required />
      </label>
      <label>
        Origin
        <input name="originCharges" type="number" min="0" step="0.01" value={form.originCharges} onChange={updateField} required />
      </label>
      <label>
        Destination
        <input name="destinationCharges" type="number" min="0" step="0.01" value={form.destinationCharges} onChange={updateField} required />
      </label>
      <label>
        Transit Days
        <input name="transitTimeDays" type="number" min="1" value={form.transitTimeDays} onChange={updateField} required />
      </label>
      <label>
        Quote Validity
        <input name="quoteValidityAt" type="datetime-local" value={form.quoteValidityAt} onChange={updateField} required />
      </label>
      <button type="submit">Submit Bid</button>
    </form>
  );
}

function BidsTable({ bids }) {
  if (!bids.length) return <div className="empty-state">No bids submitted yet.</div>;

  return (
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
        {bids.map((bid) => (
          <tr key={bid.id}>
            <td>
              <strong>{bid.rank}</strong>
            </td>
            <td>{bid.carrierName}</td>
            <td>{money.format(bid.totalAmount)}</td>
            <td>
              {money.format(bid.freightCharges)} / {money.format(bid.originCharges)} / {money.format(bid.destinationCharges)}
            </td>
            <td>{bid.transitTimeDays} days</td>
            <td>{formatDate(bid.quoteValidityAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActivityLog({ logs }) {
  if (!logs.length) return <div className="empty-state">No activity recorded.</div>;

  return (
    <ul className="activity-log">
      {logs.map((log) => (
        <li key={log.id}>
          <strong>{log.type.replace("_", " ")}</strong>
          <span>{log.message}</span>
          <small>{formatDate(log.createdAt)}</small>
        </li>
      ))}
    </ul>
  );
}

function AuctionDetail({ auction, onBidSubmitted, onToast }) {
  if (!auction) {
    return (
      <section className="panel detail-panel">
        <div className="empty-state">Select an auction to view bids and activity.</div>
      </section>
    );
  }

  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{auction.referenceId}</p>
          <h2>{auction.name}</h2>
        </div>
        <mark className={statusClass(auction.status)}>{auction.status.replace("_", " ")}</mark>
      </div>
      <div className="metrics">
        <div>
          <small>Current Close</small>
          <strong>{formatDate(auction.currentBidCloseAt)}</strong>
        </div>
        <div>
          <small>Forced Close</small>
          <strong>{formatDate(auction.forcedBidCloseAt)}</strong>
        </div>
        <div>
          <small>Trigger Window</small>
          <strong>{auction.triggerWindowMinutes} min</strong>
        </div>
        <div>
          <small>Extension</small>
          <strong>{auction.extensionDurationMinutes} min</strong>
        </div>
      </div>
      <div className="config-line">Trigger: {auction.extensionTrigger.replaceAll("_", " ")}</div>
      <h3>Submit Quote</h3>
      <BidForm auctionId={auction.id} onBidSubmitted={onBidSubmitted} onToast={onToast} />
      <h3>Supplier Ranking</h3>
      <BidsTable bids={auction.bids} />
      <h3>Activity Log</h3>
      <ActivityLog logs={auction.activityLogs} />
    </section>
  );
}

function App() {
  const [auctions, setAuctions] = useState([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState(null);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [connectionState, setConnectionState] = useState("Live");
  const [toast, setToast] = useState(null);
  const socket = useMemo(() => io(), []);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
  }, []);

  const loadAuctions = useCallback(async () => {
    try {
      setAuctions(await api("/rfqs"));
    } catch (error) {
      showToast(error.message, true);
    }
  }, [showToast]);

  const loadAuctionDetails = useCallback(
    async (id) => {
      try {
        setSelectedAuction(await api(`/rfqs/${id}`));
      } catch (error) {
        showToast(error.message, true);
      }
    },
    [showToast]
  );

  const selectAuction = useCallback(
    async (id) => {
      if (selectedAuctionId) socket.emit("auction:leave", selectedAuctionId);
      setSelectedAuctionId(id);
      socket.emit("auction:join", id);
      await loadAuctions();
      await loadAuctionDetails(id);
    },
    [loadAuctionDetails, loadAuctions, selectedAuctionId, socket]
  );

  const refreshSelectedAuction = useCallback(async () => {
    await loadAuctions();
    if (selectedAuctionId) await loadAuctionDetails(selectedAuctionId);
  }, [loadAuctionDetails, loadAuctions, selectedAuctionId]);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions]);

  useEffect(() => {
    socket.on("connect", () => setConnectionState("Live"));
    socket.on("disconnect", () => setConnectionState("Offline"));
    socket.on("auction:list-updated", loadAuctions);
    socket.on("auction:updated", ({ rfqId }) => {
      if (rfqId === selectedAuctionId) refreshSelectedAuction();
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [loadAuctions, refreshSelectedAuction, selectedAuctionId, socket]);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">RFQ Auction Desk</p>
          <h1>British Auction Control</h1>
        </div>
      </header>

      <main className="layout">
        <AuctionForm onCreated={selectAuction} onToast={showToast} />
        <AuctionList
          auctions={auctions}
          selectedAuctionId={selectedAuctionId}
          connectionState={connectionState}
          onSelect={selectAuction}
          onRefresh={refreshSelectedAuction}
        />
        <AuctionDetail auction={selectedAuction} onBidSubmitted={refreshSelectedAuction} onToast={showToast} />
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
