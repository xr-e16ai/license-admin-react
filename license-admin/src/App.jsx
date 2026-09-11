import { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, firebaseProjectId, CODES, LICENSES, DEVICES } from "./firebase";
import { emailCodes } from "./emailjs";
import {
  generateCode,
  normalizeCode,
  describeMinutes,
  asDate,
  formatDeviceValue,
  describePlatform,
  matchesDevice,
  describeError,
  describeSignInError,
  DEVICE_FIELDS,
  CODE_STATE_ORDER,
} from "./utils";

const CODES_PAGE_SIZE = 15;

export default function App() {
  // undefined while Firebase resolves the session, null once we know it's signed out.
  const [user, setUser] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return null;
  return user ? <Admin user={user} /> : <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState({ text: "", kind: "info" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setMsg({ text: "Enter your email and password.", kind: "err" });
      return;
    }

    setBusy(true);
    setMsg({ text: "Signing in...", kind: "info" });

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setMsg({ text: describeSignInError(e), kind: "err" });
    } finally {
      setBusy(false);
      setPassword("");
    }
  };

  return (
    <section id="signin" className="card">
      <h1>LICENSE ADMIN</h1>
      <p className="sub">Sign in with an administrator account.</p>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="email">EMAIL</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="admin@ltvr.local"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="password">PASSWORD</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <button style={{ width: "100%" }} onClick={submit} disabled={busy}>
        SIGN IN
      </button>
      <p className={`msg ${msg.kind}`}>{msg.text}</p>
    </section>
  );
}

function Admin({ user }) {
  const [codesVersion, setCodesVersion] = useState(0);
  const [prefill, setPrefill] = useState(null);

  const handleIssued = (codes, minutes, clientName) => {
    setCodesVersion((v) => v + 1);
    setPrefill({ clientName, codes, duration: describeMinutes(minutes) });
  };

  return (
    <div id="app">
      <div className="bar">
        <div>
          <h1>LICENSE ADMIN</h1>
          <p className="sub" style={{ margin: 0 }}>{firebaseProjectId}</p>
        </div>
        <div className="who">
          <span>{user.email || user.uid}</span>
          <button className="ghost" style={{ marginLeft: 10 }} onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>
      </div>

      <IssueCodes onIssued={handleIssued} />
      <SendToClient prefill={prefill} />
      <CodesSection reloadToken={codesVersion} />
      <LicensesSection />
      <DevicesSection />
    </div>
  );
}

// ---------- issue codes ----------

function IssueCodes({ onIssued }) {
  const [count, setCount] = useState(10);
  const [amount, setAmount] = useState(30);
  const [unit, setUnit] = useState("1");
  const [issuedTo, setIssuedTo] = useState("");
  const [msg, setMsg] = useState({ text: "", kind: "info" });
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [copyLabel, setCopyLabel] = useState("Copy all");

  const generate = async () => {
    const c = Math.min(Math.max(parseInt(count, 10) || 0, 1), 200);
    const minutes = (parseInt(amount, 10) || 0) * parseInt(unit, 10);
    const clientName = issuedTo.trim();

    if (minutes <= 0) {
      setMsg({ text: "Give the codes a duration greater than zero.", kind: "err" });
      return;
    }

    setBusy(true);
    setMsg({ text: `Creating ${c} code(s)...`, kind: "info" });
    setFresh(null);

    const made = [];
    try {
      for (let i = 0; i < c; i++) {
        let attempts = 0;
        for (;;) {
          const code = generateCode();
          try {
            await setDoc(doc(db, CODES, code), {
              durationMinutes: minutes,
              active: true,
              redeemed: false,
              redeemedBy: "",
              redeemedDevice: "",
              redeemedAt: null,
              issuedTo: clientName,
              notes: "",
              createdAt: serverTimestamp(),
            });
            made.push(code);
            break;
          } catch (e) {
            // A collision lands here as a rules rejection, since overwriting is not allowed.
            if (++attempts > 3) throw e;
          }
        }
      }

      setMsg({ text: `${made.length} code(s) created, ${describeMinutes(minutes)} each.`, kind: "ok" });
      setFresh({ title: `${made.length} new code(s), ${describeMinutes(minutes)} each`, codes: made });
      onIssued(made, minutes, clientName);
    } catch (e) {
      setMsg({ text: describeError(e, made.length), kind: "err" });
      if (made.length) {
        setFresh({ title: `${made.length} new code(s), ${describeMinutes(minutes)} each`, codes: made });
      }
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!fresh) return;
    await navigator.clipboard.writeText(fresh.codes.join("\n"));
    setCopyLabel("Copied");
    setTimeout(() => setCopyLabel("Copy all"), 1500);
  };

  return (
    <section className="card">
      <h2>Issue codes</h2>
      <div className="row">
        <div>
          <label htmlFor="count">HOW MANY</label>
          <input id="count" type="number" min="1" max="200" value={count}
            onChange={(e) => setCount(e.target.value)} />
        </div>
        <div>
          <label htmlFor="amount">DURATION</label>
          <input id="amount" type="number" min="1" value={amount}
            onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label htmlFor="unit">UNIT</label>
          <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="1">minutes</option>
            <option value="60">hours</option>
            <option value="1440">days</option>
            <option value="43200">months</option>
          </select>
        </div>
        <div>
          <label htmlFor="issuedTo">CLIENT NAME</label>
          <input id="issuedTo" type="text" placeholder="Acme Corp" value={issuedTo}
            onChange={(e) => setIssuedTo(e.target.value)} />
        </div>
        <button onClick={generate} disabled={busy}>GENERATE</button>
      </div>
      <p className={`msg ${msg.kind}`}>{msg.text}</p>
      {fresh && (
        <div className="fresh">
          <strong>{fresh.title}</strong>
          <div className="codes">
            {fresh.codes.map((code) => <code key={code}>{code}</code>)}
          </div>
          <p className="hint">Copy these now — they are listed below too, but you can also email them to a client below.</p>
          <button className="ghost" style={{ marginTop: 12 }} onClick={copyAll}>{copyLabel}</button>
        </div>
      )}
    </section>
  );
}

// ---------- send to client ----------

function SendToClient({ prefill }) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [duration, setDuration] = useState("");
  const [codesText, setCodesText] = useState("");
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState({ text: "", kind: "info" });
  const [busy, setBusy] = useState(false);

  // Prefill the section so the admin only has to add the client's email and hit Send.
  useEffect(() => {
    if (!prefill) return;
    setClientName(prefill.clientName);
    setCodesText(prefill.codes.join("\n"));
    setDuration(prefill.duration);
    setMsg({ text: "", kind: "info" });
  }, [prefill]);

  const send = async () => {
    const codes = codesText.split(/[\n,]+/).map(normalizeCode).filter(Boolean);

    if (!clientEmail.trim()) {
      setMsg({ text: "Enter the client's email address.", kind: "err" });
      return;
    }
    if (!codes.length) {
      setMsg({
        text: "Enter at least one valid code — letters, numbers, hyphens and underscores, 4 to 48 characters.",
        kind: "err",
      });
      return;
    }

    setBusy(true);
    setMsg({ text: "Sending...", kind: "info" });
    try {
      await emailCodes(clientEmail.trim(), clientName.trim(), codes, duration.trim(), message.trim());
      setMsg({ text: `Sent to ${clientEmail.trim()}.`, kind: "ok" });
    } catch (e) {
      setMsg({ text: e.message, kind: "err" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Send to client</h2>
      <div className="row">
        <div>
          <label htmlFor="sendClientName">CLIENT NAME</label>
          <input id="sendClientName" type="text" placeholder="Acme Corp" value={clientName}
            onChange={(e) => setClientName(e.target.value)} />
        </div>
        <div style={{ flex: "2 1 260px" }}>
          <label htmlFor="sendClientEmail">CLIENT EMAIL</label>
          <input id="sendClientEmail" type="email" placeholder="client@example.com" value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sendDuration">DURATION (SHOWN IN EMAIL)</label>
          <input id="sendDuration" type="text" placeholder="30 minutes" value={duration}
            onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label htmlFor="sendCodes">CODE(S)</label>
        <textarea id="sendCodes" rows={3}
          placeholder="One code per line — filled in automatically after Generate, or paste your own"
          className="textarea-field mono" value={codesText}
          onChange={(e) => setCodesText(e.target.value)} />
      </div>
      <div style={{ marginTop: 14 }}>
        <label htmlFor="sendMessage">EXTRA MESSAGE (OPTIONAL)</label>
        <textarea id="sendMessage" rows={3} placeholder="Anything you'd like to add for the client"
          className="textarea-field" value={message}
          onChange={(e) => setMessage(e.target.value)} />
      </div>
      <button style={{ marginTop: 14 }} onClick={send} disabled={busy}>SEND</button>
      <p className={`msg ${msg.kind}`}>{msg.text}</p>
    </section>
  );
}

// ---------- codes ----------

function CodesSection({ reloadToken }) {
  const [rows, setRows] = useState([]);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(null);
  const [revoking, setRevoking] = useState(new Set());

  const load = async () => {
    setStatus({ text: "Loading...", kind: "info" });
    try {
      const snapshot = await getDocs(collection(db, CODES));
      const list = [];

      snapshot.forEach((d) => {
        const data = d.data();
        const state = data.active === false ? "revoked" : data.redeemed ? "used" : "unused";
        if (unusedOnly && state !== "unused") return;
        list.push({ code: d.id, state, ...data });
      });

      list.sort((a, b) =>
        CODE_STATE_ORDER[a.state] - CODE_STATE_ORDER[b.state] || a.code.localeCompare(b.code));

      setRows(list);
      setExpanded(false);
      setRevoking(new Set());
      setStatus(null);
    } catch (e) {
      setRows([]);
      setStatus({ text: describeError(e), kind: "err" });
    }
  };

  // Loads on mount, whenever Generate issues new codes (reloadToken), and whenever the
  // "unused only" filter changes.
  useEffect(() => { load(); }, [reloadToken, unusedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async (code) => {
    setRevoking((s) => new Set(s).add(code));
    try {
      await updateDoc(doc(db, CODES, code), { active: false });
      await load();
    } catch (e) {
      setStatus({ text: describeError(e), kind: "err" });
      setRevoking((s) => {
        const next = new Set(s);
        next.delete(code);
        return next;
      });
    }
  };

  // Long lists (thousands of issued codes) are unreadable dumped all at once, so only a
  // page is rendered until the admin asks for the rest.
  const shown = expanded ? rows : rows.slice(0, CODES_PAGE_SIZE);
  const unused = rows.filter((r) => r.state === "unused").length;
  const derived = rows.length
    ? `${shown.length} of ${rows.length} shown, ${unused} still spendable.`
    : "No codes yet.";
  const msg = status || { text: derived, kind: "info" };

  return (
    <section className="card">
      <div className="bar" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Codes</h2>
        <div>
          <label style={{ display: "inline", marginRight: 8 }}>
            <input type="checkbox" style={{ width: "auto", marginRight: 5 }}
              checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} />
            unused only
          </label>
          <button className="ghost" onClick={load}>Refresh</button>
        </div>
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>Code</th><th>Worth</th><th>State</th><th>Client</th><th>Redeemed by</th><th></th></tr></thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.code}>
                <td><code>{row.code}</code></td>
                <td>{describeMinutes(row.durationMinutes)}</td>
                <td><span className={`tag ${row.state}`}>{row.state}</span></td>
                <td>{row.issuedTo || ""}</td>
                <td>{row.redeemedBy || ""}</td>
                <td style={{ textAlign: "right" }}>
                  {row.state === "unused" && (
                    <button className="ghost danger" disabled={revoking.has(row.code)}
                      onClick={() => revoke(row.code)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`msg ${msg.kind}`}>{msg.text}</p>
      {!expanded && rows.length > shown.length && (
        <button className="ghost" onClick={() => setExpanded(true)}>Show all ({rows.length})</button>
      )}
      {expanded && rows.length > CODES_PAGE_SIZE && (
        <button className="ghost" onClick={() => setExpanded(false)}>Show less</button>
      )}
    </section>
  );
}

// ---------- licenses ----------

function LicensesSection() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);
  const [busyUid, setBusyUid] = useState(null);

  const load = async () => {
    setStatus({ text: "Loading...", kind: "info" });
    try {
      const snapshot = await getDocs(collection(db, LICENSES));
      const now = Date.now();
      const list = [];

      snapshot.forEach((d) => {
        const data = d.data();
        const expires = data.expiresAt ? data.expiresAt.toDate() : null;
        list.push({
          uid: d.id,
          username: data.username || "",
          deviceUid: data.deviceUid || "",
          licenseCode: data.licenseCode || "",
          expires,
          live: expires ? expires.getTime() > now : false,
        });
      });

      list.sort((a, b) => Number(b.live) - Number(a.live) || a.username.localeCompare(b.username));

      setRows(list);
      setStatus(null);
    } catch (e) {
      setRows([]);
      setStatus({ text: describeError(e), kind: "err" });
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async (row) => {
    const who = row.username || row.uid;
    if (!confirm(`Revoke the license for ${who}?\n\nThey will need a new code the next time they sign in.`)) {
      return;
    }

    setBusyUid(row.uid);
    try {
      await deleteDoc(doc(db, LICENSES, row.uid));
      await load();
    } catch (e) {
      setStatus({ text: describeError(e), kind: "err" });
    } finally {
      setBusyUid(null);
    }
  };

  const derived = rows.length
    ? `${rows.length} license(s), ${rows.filter((r) => r.live).length} currently active.`
    : "No licenses issued yet.";
  const msg = status || { text: derived, kind: "info" };

  return (
    <section className="card">
      <div className="bar" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Active licenses</h2>
        <button className="ghost" onClick={load}>Refresh</button>
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>User</th><th>Device</th><th>From code</th><th>Expires</th><th>State</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.uid}>
                <td>{row.username || row.uid}</td>
                <td><code>{row.deviceUid.slice(0, 12).toUpperCase()}</code></td>
                <td><code>{row.licenseCode}</code></td>
                <td>{row.expires ? row.expires.toLocaleString() : "-"}</td>
                <td><span className={`tag ${row.live ? "unused" : "expired"}`}>{row.live ? "active" : "expired"}</span></td>
                <td style={{ textAlign: "right" }}>
                  <button className="ghost danger" disabled={busyUid === row.uid} onClick={() => revoke(row)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`msg ${msg.kind}`}>{msg.text}</p>
      <p className="hint">Revoking sends that user back to the code screen the next time they sign in. It does not interrupt a session already running.</p>
    </section>
  );
}

// ---------- devices ----------

function DevicesSection() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState(null);

  const load = async () => {
    setStatus({ text: "Loading...", kind: "info" });
    try {
      const snapshot = await getDocs(collection(db, DEVICES));
      const list = [];

      snapshot.forEach((d) => {
        const data = d.data();
        list.push({ uid: d.id, data, lastLogin: asDate(data.lastLoginAt) });
      });

      // Most recently seen first - the order support questions arrive in.
      list.sort((a, b) =>
        (b.lastLogin ? b.lastLogin.getTime() : 0) - (a.lastLogin ? a.lastLogin.getTime() : 0));

      setRows(list);
      setStatus(null);
    } catch (e) {
      setRows([]);
      setStatus({
        text: e && e.code === "permission-denied"
          ? "Permission denied reading the device registry. The published rules are older than " +
            "this page - republish firestore.rules, which lets an admin list authorizedDevices."
          : describeError(e),
        kind: "err",
      });
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = filter.trim().toLowerCase();
  const shown = needle ? rows.filter((row) => matchesDevice(row, needle)) : rows;

  const derived = !rows.length
    ? "No devices registered yet."
    : shown.length === rows.length
    ? `${rows.length} device(s) registered.`
    : `${shown.length} of ${rows.length} device(s) match.`;
  const msg = status || { text: derived, kind: "info" };

  return (
    <section className="card">
      <div className="bar" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Devices connected</h2>
        <div>
          <input type="text" placeholder="Filter by user, model, id..."
            style={{ width: "auto", display: "inline-block", marginRight: 8, padding: "7px 11px", fontSize: 13 }}
            value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="ghost" onClick={load}>Refresh</button>
        </div>
      </div>
      <div className="scroll">
        <table>
          <thead><tr>
            <th>User</th><th>Device ID</th><th>Model</th><th>Platform</th>
            <th>App</th><th>Last login</th><th>Logins</th><th></th>
          </tr></thead>
          <tbody>
            {shown.map((row) => (
              <DeviceRow key={row.uid} row={row} onError={(text) => setStatus({ text, kind: "err" })} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={`msg ${msg.kind}`}>{msg.text}</p>
      <p className="hint">One record per account, written by the app on first login and keyed by
        Firebase UID. The device id is the lock &mdash; that account only runs on the machine
        listed here. Click a device id to copy it in full; open Details for everything the app
        recorded about the machine.</p>
    </section>
  );
}

function DeviceRow({ row, onError }) {
  const [expandedDetail, setExpandedDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  const d = row.data;
  const fullId = String(d.deviceUid || "");
  // The same short form the app shows the trainee, so the two can be read against each
  // other over the phone.
  const shortId = fullId.slice(0, 12).toUpperCase();
  const platform = describePlatform(d);
  const model = d.deviceModel || d.deviceName || "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      // Clipboard blocked, usually an insecure origin. The full id is in Details anyway.
      onError("Could not reach the clipboard - the full id is under Details.");
    }
  };

  return (
    <>
      <tr className={expandedDetail ? "expanded" : ""}>
        <td>{d.username || row.uid}</td>
        <td>
          {fullId ? (
            <code className="copyable" title="Click to copy the full id" onClick={copy}>
              {copied ? "COPIED" : shortId || "-"}
            </code>
          ) : (
            <code>-</code>
          )}
        </td>
        <td className="ellipsis" title={model}>{model || "-"}</td>
        <td className="ellipsis" title={platform}>{platform}</td>
        <td>{d.appVersion || "-"}</td>
        <td>{row.lastLogin ? row.lastLogin.toLocaleString() : "-"}</td>
        <td>{d.loginCount === undefined ? "-" : String(d.loginCount)}</td>
        <td style={{ textAlign: "right" }}>
          <button className="ghost" onClick={() => setExpandedDetail((v) => !v)}>
            {expandedDetail ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      <tr className="detail" hidden={!expandedDetail}>
        <td colSpan={8}>{expandedDetail && <DeviceDetails data={d} />}</td>
      </tr>
    </>
  );
}

/** The panel behind the Details button: every field on the document, nothing dropped. */
function DeviceDetails({ data }) {
  const known = new Set(DEVICE_FIELDS.map(([key]) => key));

  const cells = DEVICE_FIELDS.map(([key, label]) => (
    <div key={key}>
      <span className="k">{label}</span>
      <span className={`v${key === "deviceUid" || key === "firebaseUid" ? " id" : ""}`}>
        {formatDeviceValue(key, data[key])}
      </span>
    </div>
  ));

  // Anything written by a newer build of the app than this page knows about.
  for (const key of Object.keys(data)) {
    if (!known.has(key)) {
      cells.push(
        <div key={key}>
          <span className="k">{key}</span>
          <span className="v">{formatDeviceValue(key, data[key])}</span>
        </div>
      );
    }
  }

  return <div className="kv">{cells}</div>;
}
