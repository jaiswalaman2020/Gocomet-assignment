import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  extensionTrigger: "BID_RECEIVED",
};

const initialBidForm = {
  carrierName: "",
  freightCharges: "",
  originCharges: "",
  destinationCharges: "",
  transitTimeDays: "",
  quoteValidityAt: "",
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function toIsoFromLocal(value) {
  return new Date(value).toISOString();
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function getAuctionStatus(auction, now = new Date()) {
  const forcedClose = new Date(auction.forcedBidCloseAt);
  const currentClose = new Date(auction.currentBidCloseAt);
  const bidStart = new Date(auction.bidStartAt);

  if (now >= forcedClose) return "FORCE_CLOSED";
  if (now >= currentClose) return "CLOSED";
  if (now < bidStart) return "SCHEDULED";
  return "ACTIVE";
}

function formatDuration(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getCountdown(auction, now = new Date()) {
  const status = getAuctionStatus(auction, now);

  if (status === "SCHEDULED") {
    return {
      label: "Starts in",
      value: formatDuration(
        new Date(auction.bidStartAt).getTime() - now.getTime(),
      ),
    };
  }

  if (status === "ACTIVE") {
    return {
      label: "Time left",
      value: formatDuration(
        new Date(auction.currentBidCloseAt).getTime() - now.getTime(),
      ),
    };
  }

  if (status === "CLOSED") {
    return {
      label: "Forced close in",
      value: formatDuration(
        new Date(auction.forcedBidCloseAt).getTime() - now.getTime(),
      ),
    };
  }

  return {
    label: "Auction",
    value: "Force closed",
  };
}

function statusClass(status) {
  return status.toLowerCase().replace("_", "-");
}

function getSupplierRanking(bids) {
  const bestByCarrier = new Map();

  bids.forEach((bid) => {
    const current = bestByCarrier.get(bid.carrierName);
    const bidTotal = Number(bid.totalAmount);
    const currentTotal = current
      ? Number(current.totalAmount)
      : Number.POSITIVE_INFINITY;

    if (
      !current ||
      bidTotal < currentTotal ||
      (bidTotal === currentTotal &&
        new Date(bid.createdAt) < new Date(current.createdAt))
    ) {
      bestByCarrier.set(bid.carrierName, bid);
    }
  });

  return [...bestByCarrier.values()]
    .sort(
      (a, b) =>
        Number(a.totalAmount) - Number(b.totalAmount) ||
        new Date(a.createdAt) - new Date(b.createdAt),
    )
    .map((bid, index) => ({
      ...bid,
      rank: `L${index + 1}`,
    }));
}

const apiBaseUrl = import.meta.env.VITE_API_URL || "/api";

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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

  return (
    <div className={`toast ${toast.isError ? "error" : ""}`}>
      {toast.message}
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
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
      extensionDurationMinutes: Number(form.extensionDurationMinutes),
    };

    try {
      const auction = await api("/rfqs", {
        method: "POST",
        body: JSON.stringify(payload),
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
          <input
            name="name"
            value={form.name}
            onChange={updateField}
            required
            placeholder="Mumbai to Dubai Freight"
          />
        </label>
        <label>
          Reference ID
          <input
            name="referenceId"
            value={form.referenceId}
            onChange={updateField}
            required
            placeholder="RFQ-2026-001"
          />
        </label>
        <label>
          Bid Start
          <input
            name="bidStartAt"
            type="datetime-local"
            value={form.bidStartAt}
            onChange={updateField}
            required
          />
        </label>
        <label>
          Bid Close
          <input
            name="initialBidCloseAt"
            type="datetime-local"
            value={form.initialBidCloseAt}
            onChange={updateField}
            required
          />
        </label>
        <label>
          Forced Close
          <input
            name="forcedBidCloseAt"
            type="datetime-local"
            value={form.forcedBidCloseAt}
            onChange={updateField}
            required
          />
        </label>
        <label>
          Pickup / Service Date
          <input
            name="pickupServiceAt"
            type="datetime-local"
            value={form.pickupServiceAt}
            onChange={updateField}
            required
          />
        </label>
        <div className="inline-fields">
          <label>
            Trigger Window
            <input
              name="triggerWindowMinutes"
              type="number"
              min="1"
              value={form.triggerWindowMinutes}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Extension
            <input
              name="extensionDurationMinutes"
              type="number"
              min="1"
              value={form.extensionDurationMinutes}
              onChange={updateField}
              required
            />
          </label>
        </div>
        <label>
          Extension Trigger
          <select
            name="extensionTrigger"
            value={form.extensionTrigger}
            onChange={updateField}
            required
          >
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

function AuctionList({
  auctions,
  selectedAuctionId,
  connectionState,
  isLoading,
  onSelect,
  onRefresh,
}) {
  const now = useNow();

  return (
    <section className="panel list-panel">
      <div className="section-head">
        <h2>Auctions</h2>
        <div className="list-actions">
          <span
            className={`status-dot ${connectionState === "Offline" ? "offline" : ""}`}
          >
            {connectionState}
          </span>
          <button
            className="icon-button"
            title="Refresh auctions"
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="auction-list">
        {isLoading ? (
          <Spinner label="Loading auctions..." />
        ) : !auctions.length ? (
          <div className="empty-state">No British auctions yet.</div>
        ) : (
          auctions.map((auction) => (
            <AuctionRow
              auction={auction}
              isSelected={auction.id === selectedAuctionId}
              key={auction.id}
              now={now}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </section>
  );
}

function AuctionRow({ auction, isSelected, now, onSelect }) {
  const status = getAuctionStatus(auction, now);
  const countdown = getCountdown(auction, now);

  return (
    <button
      className={`auction-row ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(auction.id)}
    >
      <span>
        <strong>{auction.name}</strong>
        <small>{auction.referenceId}</small>
      </span>
      <span>
        {auction.currentLowestBid
          ? money.format(auction.currentLowestBid)
          : "No bids"}
      </span>
      <span>
        <strong>{countdown.value}</strong>
        <small>{countdown.label}</small>
      </span>
      <span>
        <strong>{formatDate(auction.currentBidCloseAt)}</strong>
        <small>Current close</small>
      </span>
      <span>
        <strong>{formatDate(auction.forcedBidCloseAt)}</strong>
        <small>Forced close</small>
      </span>
      <mark className={statusClass(status)}>{status.replace("_", " ")}</mark>
    </button>
  );
}

function BidForm({ auction, onBidSubmitted, onToast }) {
  const [form, setForm] = useState(initialBidForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isActive = auction.status === "ACTIVE";

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitBid(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const result = await api(`/rfqs/${auction.id}/bids`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          quoteValidityAt: toIsoFromLocal(form.quoteValidityAt),
        }),
      });
      setForm(initialBidForm);
      onToast(
        result.extension
          ? `Bid submitted. ${result.extension.reason}`
          : "Bid submitted.",
      );
      onBidSubmitted();
    } catch (error) {
      onToast(error.message, true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="bid-form" onSubmit={submitBid}>
      <label>
        Carrier
        <input
          name="carrierName"
          value={form.carrierName}
          onChange={updateField}
          required
          disabled={!isActive}
          placeholder="Carrier A"
        />
      </label>
      <label>
        Freight
        <input
          name="freightCharges"
          type="number"
          min="0"
          step="0.01"
          value={form.freightCharges}
          onChange={updateField}
          required
          disabled={!isActive}
        />
      </label>
      <label>
        Origin
        <input
          name="originCharges"
          type="number"
          min="0"
          step="0.01"
          value={form.originCharges}
          onChange={updateField}
          required
          disabled={!isActive}
        />
      </label>
      <label>
        Destination
        <input
          name="destinationCharges"
          type="number"
          min="0"
          step="0.01"
          value={form.destinationCharges}
          onChange={updateField}
          required
          disabled={!isActive}
        />
      </label>
      <label>
        Transit Days
        <input
          name="transitTimeDays"
          type="number"
          min="1"
          value={form.transitTimeDays}
          onChange={updateField}
          required
          disabled={!isActive}
        />
      </label>
      <label>
        Quote Validity
        <input
          name="quoteValidityAt"
          type="datetime-local"
          value={form.quoteValidityAt}
          onChange={updateField}
          required
          disabled={!isActive}
        />
      </label>
      <button type="submit" disabled={!isActive || isSubmitting}>
        {!isActive ? (
          "Bidding Closed"
        ) : isSubmitting ? (
          <span className="button-spinner">
            <span className="spinner" aria-hidden="true" />
            Submitting...
          </span>
        ) : (
          "Submit Bid"
        )}
      </button>
    </form>
  );
}

function BidsTable({ bids }) {
  if (!bids.length)
    return <div className="empty-state">No bids submitted yet.</div>;

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
              {money.format(bid.freightCharges)} /{" "}
              {money.format(bid.originCharges)} /{" "}
              {money.format(bid.destinationCharges)}
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
  if (!logs.length)
    return <div className="empty-state">No activity recorded.</div>;

  return (
    <ul className="activity-log">
      {logs.map((log) => (
        <li key={log.id}>
          <strong>{log.type.replace("_", " ")}</strong>
          <span>{log.message}</span>
          {log.metadata?.reason ? (
            <small>Reason: {log.metadata.reason}</small>
          ) : null}
          <small>{formatDate(log.createdAt)}</small>
        </li>
      ))}
    </ul>
  );
}

function SupplierRanking({ bids }) {
  const ranked = getSupplierRanking(bids);

  if (!ranked.length)
    return <div className="empty-state">No supplier ranking yet.</div>;

  return (
    <div className="rank-grid">
      {ranked.map((bid) => (
        <div className="rank-card" key={bid.id}>
          <small>{bid.rank}</small>
          <strong>{bid.carrierName}</strong>
          <span>{money.format(bid.totalAmount)}</span>
        </div>
      ))}
    </div>
  );
}

function AuctionDetail({ auction, onBidSubmitted, onToast }) {
  const now = useNow();

  if (!auction) {
    return (
      <section className="panel detail-panel">
        <div className="empty-state">
          Select an auction to view bids and activity.
        </div>
      </section>
    );
  }

  const status = getAuctionStatus(auction, now);
  const liveAuction = { ...auction, status };
  const countdown = getCountdown(liveAuction, now);

  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{auction.referenceId}</p>
          <h2>{auction.name}</h2>
        </div>
        <mark className={statusClass(status)}>{status.replace("_", " ")}</mark>
      </div>
      <div className="metrics">
        <div>
          <small>{countdown.label}</small>
          <strong>{countdown.value}</strong>
        </div>
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
      <div className="config-line">
        Trigger: {auction.extensionTrigger.replaceAll("_", " ")}
      </div>
      <h3>Submit Quote</h3>
      <BidForm
        auction={liveAuction}
        onBidSubmitted={onBidSubmitted}
        onToast={onToast}
      />
      <h3>Supplier Ranking</h3>
      <SupplierRanking bids={auction.bids} />
      <h3>All Supplier Bids</h3>
      <BidsTable bids={auction.bids} />
      <h3>Activity Log</h3>
      <ActivityLog logs={auction.activityLogs} />
    </section>
  );
}

function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function App() {
  const [auctions, setAuctions] = useState([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState(null);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [isLoadingAuctions, setIsLoadingAuctions] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [connectionState, setConnectionState] = useState("Live");
  const [toast, setToast] = useState(null);
  const now = useNow();
  const socket = useMemo(() => io(), []);
  const selectedAuctionIdRef = useRef(null);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
  }, []);

  const loadAuctions = useCallback(async () => {
    setIsLoadingAuctions(true);
    try {
      setAuctions(await api("/rfqs"));
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setIsLoadingAuctions(false);
    }
  }, [showToast]);

  const loadAuctionDetails = useCallback(
    async (id) => {
      setIsLoadingDetails(true);
      try {
        setSelectedAuction(await api(`/rfqs/${id}`));
      } catch (error) {
        showToast(error.message, true);
      } finally {
        setIsLoadingDetails(false);
      }
    },
    [showToast],
  );

  const selectAuction = useCallback(
    async (id) => {
      if (selectedAuctionId) socket.emit("auction:leave", selectedAuctionId);
      setSelectedAuctionId(id);
      selectedAuctionIdRef.current = id;
      socket.emit("auction:join", id);
      await loadAuctions();
      await loadAuctionDetails(id);
    },
    [loadAuctionDetails, loadAuctions, selectedAuctionId, socket],
  );

  const refreshSelectedAuction = useCallback(async () => {
    await loadAuctions();
    if (selectedAuctionIdRef.current)
      await loadAuctionDetails(selectedAuctionIdRef.current);
  }, [loadAuctionDetails, loadAuctions]);

  useEffect(() => {
    loadAuctions().finally(() => setIsBootstrapping(false));
  }, [loadAuctions]);

  useEffect(() => {
    selectedAuctionIdRef.current = selectedAuctionId;
  }, [selectedAuctionId]);

  useEffect(() => {
    function handleConnect() {
      setConnectionState("Live");
      if (selectedAuctionIdRef.current) {
        socket.emit("auction:join", selectedAuctionIdRef.current);
      }
    }

    function handleDisconnect() {
      setConnectionState("Offline");
    }

    function handleAuctionUpdated({ rfqId }) {
      if (rfqId === selectedAuctionIdRef.current) {
        refreshSelectedAuction();
      }
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("auction:list-updated", loadAuctions);
    socket.on("auction:updated", handleAuctionUpdated);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("auction:list-updated", loadAuctions);
      socket.off("auction:updated", handleAuctionUpdated);
      socket.close();
    };
  }, [loadAuctions, refreshSelectedAuction, socket]);

  return (
    <div className="app-shell">
      {isBootstrapping ? (
        <div className="page-overlay" role="status" aria-live="polite">
          <Spinner label="Loading dashboard..." />
        </div>
      ) : null}
      <header className="topbar">
        <div>
          <p className="eyebrow">RFQ Auction Desk</p>
          <h1>British Auction Control</h1>
          <p className="topbar-sub">
            Real-time bidding with fair extension rules.
          </p>
        </div>
        <div className="topbar-meta">
          <span
            className={`status-pill ${connectionState === "Offline" ? "offline" : ""}`}
          >
            {connectionState === "Offline" ? "Offline" : "Live"}
          </span>
          <span className="topbar-date">{formatDate(now)}</span>
        </div>
      </header>

      <main className="layout">
        <AuctionForm onCreated={selectAuction} onToast={showToast} />
        <AuctionList
          auctions={auctions}
          selectedAuctionId={selectedAuctionId}
          connectionState={connectionState}
          isLoading={isLoadingAuctions}
          onSelect={selectAuction}
          onRefresh={refreshSelectedAuction}
        />
        {isLoadingDetails ? (
          <section className="panel detail-panel">
            <Spinner label="Loading auction details..." />
          </section>
        ) : (
          <AuctionDetail
            auction={selectedAuction}
            onBidSubmitted={refreshSelectedAuction}
            onToast={showToast}
          />
        )}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
