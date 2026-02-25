// @ts-nocheck
import { useState, useMemo, useCallback } from "react";

// ─── EMAILJS CONFIG ────────────────────────────────────────────────────────────
// 1. Sign up at https://www.emailjs.com
// 2. Create a service (Gmail works), note your SERVICE_ID
// 3. Create two email templates (see comments below), note TEMPLATE IDs
// 4. Get your PUBLIC_KEY from Account > API Keys
// 5. Replace the placeholders below
const EMAILJS_CONFIG = {
  SERVICE_ID: "service_abtagva",
  MANAGER_TEMPLATE_ID: "template_s71mb0s", // Template vars: {{manager_name}}, {{employee_name}}, {{leave_type}}, {{start_date}}, {{end_date}}, {{days}}, {{reason}}, {{app_link}}
  EMPLOYEE_TEMPLATE_ID: "template_nzhdiv8", // Template vars: {{employee_name}}, {{leave_type}}, {{start_date}}, {{end_date}}, {{days}}, {{status}}, {{review_note}}, {{manager_name}}
  PUBLIC_KEY: "KXqoS7ttTT_8sAR4i",
};

// ─── GOOGLE WORKSPACE CONFIG (mock — wire up when backend ready) ────────────────
// To activate: set up a Google Cloud project, enable Calendar API,
// create OAuth 2.0 credentials, and replace these values.
const GOOGLE_CONFIG = {
  CLIENT_ID: "874104965970-3of64vaml2pkksegobmhd1p02uo57apd.apps.googleusercontent.com",

  SCOPES: "https://www.googleapis.com/auth/calendar.events",
  MOCK_MODE: false, // Set to false once credentials are ready
};

// ─── INITIAL DATA ──────────────────────────────────────────────────────────────
const INITIAL_EMPLOYEES = [
  { id: 1, name: "Sarah Chen",       email: "sarah@company.com",   dept: "Engineering", role: "employee", avatar: "SC", managerId: 5, title: "Senior Engineer" },
  { id: 2, name: "Marcus Williams",  email: "marcus@company.com",  dept: "Design",      role: "employee", avatar: "MW", managerId: 6, title: "UI Designer" },
  { id: 3, name: "Priya Patel",      email: "priya@company.com",   dept: "Marketing",   role: "employee", avatar: "PP", managerId: 6, title: "Marketing Lead" },
  { id: 4, name: "James O'Brien",    email: "james@company.com",   dept: "Engineering", role: "employee", avatar: "JO", managerId: 5, title: "Engineer" },
  { id: 5, name: "Elena Rodriguez",  email: "elena@company.com",   dept: "Engineering", role: "manager",  avatar: "ER", managerId: 7, title: "Eng Manager" },
  { id: 6, name: "David Kim",        email: "david@company.com",   dept: "Operations",  role: "manager",  avatar: "DK", managerId: 7, title: "Ops Manager" },
  { id: 7, name: "Alex Thompson",    email: "alex@company.com",    dept: "Executive",   role: "admin",    avatar: "AT", managerId: null, title: "CEO" },
];

const LEAVE_TYPES = ["Vacation Leave", "Sick Leave", "Offset", "Bereavement Leave", "Emergency Leave", "Parental Leave (Maternity or Paternity)"];

const DEFAULT_ENTITLEMENTS = {
  "Vacation Leave": 15,
  "Sick Leave": 15,
  "Offset": 0,
  "Bereavement Leave": 5,
  "Emergency Leave": 5,
  "Parental Leave (Maternity or Paternity)": 105,
};

const INITIAL_BALANCES = Object.fromEntries(
  [1,2,3,4,5,6,7].map(id => [id, { ...DEFAULT_ENTITLEMENTS }])
);

const INITIAL_REQUESTS = [
  { id: 101, employeeId: 1, type: "Vacation Leave",   start: "2026-03-10", end: "2026-03-14", days: 5, reason: "Family vacation",     status: "pending",  submittedAt: "2026-02-20", gcalSynced: false },
  { id: 102, employeeId: 2, type: "Sick Leave",        start: "2026-02-24", end: "2026-02-25", days: 2, reason: "Flu recovery",        status: "approved", submittedAt: "2026-02-23", reviewedBy: 6, reviewNote: "Get well soon!", gcalSynced: true },
  { id: 103, employeeId: 4, type: "Emergency Leave",   start: "2026-03-05", end: "2026-03-05", days: 1, reason: "Medical appointment", status: "pending",  submittedAt: "2026-02-22", gcalSynced: false },
  { id: 104, employeeId: 3, type: "Vacation Leave",    start: "2026-04-01", end: "2026-04-04", days: 4, reason: "Spring break",        status: "rejected", submittedAt: "2026-02-15", reviewedBy: 6, reviewNote: "Team conflict.", gcalSynced: false },
];

const TYPE_COLORS = {
  "Vacation Leave":                        { bg: "#e8f4fd", text: "#1a73e8", dot: "#1a73e8", cal: "#4285F4" },
  "Sick Leave":                            { bg: "#fce8e6", text: "#d93025", dot: "#d93025", cal: "#D50000" },
  "Offset":                                { bg: "#f3e8fd", text: "#7c3aed", dot: "#7c3aed", cal: "#7986CB" },
  "Bereavement Leave":                     { bg: "#f1f3f4", text: "#5f6368", dot: "#5f6368", cal: "#616161" },
  "Emergency Leave":                       { bg: "#fff3e0", text: "#e65100", dot: "#e65100", cal: "#EF6C00" },
  "Parental Leave (Maternity or Paternity)": { bg: "#e6f4ea", text: "#188038", dot: "#188038", cal: "#33B679" },
};

const STATUS_STYLES = {
  pending:  { bg: "#fff8e1", text: "#f59e0b", label: "Pending" },
  approved: { bg: "#e6f4ea", text: "#188038", label: "Approved" },
  rejected: { bg: "#fce8e6", text: "#d93025", label: "Rejected" },
};

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
function getDaysBetween(start, end) {
  const s = new Date(start), e = new Date(end);
  let count = 0, cur = new Date(s);
  while (cur <= e) { if (cur.getDay() !== 0 && cur.getDay() !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}

function buildOrgTree(employees) {
  const map = {};
  employees.forEach(e => map[e.id] = { ...e, children: [] });
  const roots = [];
  employees.forEach(e => {
    if (e.managerId && map[e.managerId]) map[e.managerId].children.push(map[e.id]);
    else roots.push(map[e.id]);
  });
  return roots;
}

// ─── EMAIL SERVICE ─────────────────────────────────────────────────────────────
async function sendEmail(templateId, params) {
  try {
    const res = await fetch(`https://api.emailjs.com/api/v1.0/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_CONFIG.SERVICE_ID,
        template_id: templateId,
        user_id: EMAILJS_CONFIG.PUBLIC_KEY,
        template_params: params,
      }),
    });
    return res.ok;
  } catch { return false; }
}

async function notifyManager(manager, employee, request) {
  if (EMAILJS_CONFIG.SERVICE_ID === "YOUR_SERVICE_ID") return "mock";
  return sendEmail(EMAILJS_CONFIG.MANAGER_TEMPLATE_ID, {
    manager_name: manager.name, manager_email: manager.email,
    employee_name: employee.name, leave_type: request.type,
    start: request.start, end: request.end,
    days: request.days, reason: request.reason, app_link: window.location.href,
  });
}

async function notifyEmployee(employee, manager, request, status, note) {
  if (EMAILJS_CONFIG.SERVICE_ID === "YOUR_SERVICE_ID") return "mock";
  return sendEmail(EMAILJS_CONFIG.EMPLOYEE_TEMPLATE_ID, {
    employee_name: employee.name, employee_email: employee.email,
    leave_type: request.type, start: request.start, end: request.end,
    days: request.days, status, review_note: note || "—", manager_name: manager.name,
  });
}

// ─── GOOGLE CALENDAR (OAUTH) ───────────────────────────────────────────────────
// Loads the Google Identity Services + gapi scripts dynamically
function loadGoogleScripts() {
  return new Promise((resolve) => {
    if (window.google && window.gapi) return resolve();
    const gsi = document.createElement("script");
    gsi.src = "https://accounts.google.com/gsi/client";
    gsi.onload = () => {
      const gapi = document.createElement("script");
      gapi.src = "https://apis.google.com/js/api.js";
      gapi.onload = () => window.gapi.load("client", () => {
        window.gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"] })
          .then(resolve);
      });
      document.body.appendChild(gapi);
    };
    document.body.appendChild(gsi);
  });
}

async function syncToGoogleCalendar(employee, request) {
  if (GOOGLE_CONFIG.MOCK_MODE) {
    await new Promise(r => setTimeout(r, 900));
    return { success: true, mock: true, eventId: "mock_" + Date.now() };
  }
  try {
    await loadGoogleScripts();
    // Request OAuth token via Google Identity Services popup
    const token = await new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.CLIENT_ID,
        scope: GOOGLE_CONFIG.SCOPES,
        callback: (resp) => resp.error ? reject(resp) : resolve(resp.access_token),
      });
      client.requestAccessToken({ prompt: "consent" });
    });
    window.gapi.client.setToken({ access_token: token });
    const colorMap = {
      "Vacation Leave": "9", "Sick Leave": "11", "Offset": "3",
      "Bereavement Leave": "8", "Emergency Leave": "6",
      "Parental Leave (Maternity or Paternity)": "2",
    };
    const response = await window.gapi.client.calendar.events.insert({
      calendarId: "primary",
      resource: {
        summary: `${request.type} — ${employee.name}`,
        description: request.reason,
        start: { date: request.start },
        end: { date: request.end },
        colorId: colorMap[request.type] || "1",
      },
    });
    return { success: true, eventId: response.result.id };
  } catch (err) {
    console.error("Google Calendar sync error:", err);
    return { success: false };
  }
}

// ─── SMALL COMPONENTS ──────────────────────────────────────────────────────────
function Avatar({ initials, size = 36 }) {
  const colors = ["#1a73e8","#188038","#d93025","#f59e0b","#7c3aed","#0891b2","#db2777"];
  const c = colors[(initials.charCodeAt(0) + initials.charCodeAt(1)) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, letterSpacing: "-0.5px" }}>
      {initials}
    </div>
  );
}

function Badge({ status }) {
  const s = STATUS_STYLES[status];
  return <span style={{ background: s.bg, color: s.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace", letterSpacing: "0.3px" }}>{s.label}</span>;
}

function TypeTag({ type }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS["Unpaid Leave"];
  return <span style={{ background: c.bg, color: c.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{type}</span>;
}

function GCalBadge({ synced, loading, onSync }) {
  return (
    <button onClick={onSync} title={synced ? "Synced to Google Calendar" : "Add to Google Calendar"} style={{ background: synced ? "#e6f4ea" : "#f1f3f4", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontFamily: "'DM Mono', monospace", cursor: loading ? "wait" : "pointer", color: synced ? "#188038" : "#5f6368", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
      {loading ? "⏳" : synced ? "✓ GCal" : "📅 Add to GCal"}
    </button>
  );
}

// ─── ORG TREE NODE ─────────────────────────────────────────────────────────────
function OrgNode({ node, depth = 0, employees, onUpdateManager, editable }) {
  const [collapsed, setCollapsed] = useState(false);
  const roleColor = node.role === "admin" ? "#7c3aed" : node.role === "manager" ? "#1a73e8" : "#5f6368";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
        {depth > 0 && <div style={{ width: 2, height: 24, background: "#e0e0e0" }} />}
        <div style={{ background: "#fff", border: `2px solid ${roleColor}20`, borderRadius: 14, padding: "14px 18px", minWidth: 160, textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", position: "relative" }}>
          <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", background: roleColor, color: "#fff", fontSize: 9, fontFamily: "'DM Mono', monospace", padding: "2px 8px", borderRadius: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
            {node.role}
          </div>
          <Avatar initials={node.avatar} size={40} />
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8, color: "#1a1a2e" }}>{node.name}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{node.title}</div>
          <div style={{ fontSize: 10, color: "#aaa", marginTop: 1, fontFamily: "'DM Mono', monospace" }}>{node.dept}</div>
          {editable && node.role !== "admin" && (
            <div style={{ marginTop: 8 }}>
              <select
                value={node.managerId || ""}
                onChange={e => onUpdateManager(node.id, e.target.value ? parseInt(e.target.value) : null)}
                style={{ fontSize: 10, border: "1px solid #e0e0e0", borderRadius: 6, padding: "3px 6px", fontFamily: "'DM Mono', monospace", background: "#fafafa", color: "#555", width: "100%" }}
              >
                <option value="">No manager</option>
                {employees.filter(e => e.id !== node.id && e.role !== "employee").map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
          {node.children?.length > 0 && (
            <button onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "1px solid #e0e0e0", borderRadius: 6, padding: "2px 8px", fontSize: 10, cursor: "pointer", marginTop: 6, color: "#888", fontFamily: "'DM Mono', monospace" }}>
              {collapsed ? `+ ${node.children.length}` : "−"}
            </button>
          )}
        </div>
      </div>
      {!collapsed && node.children?.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 0, position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: "50%", width: `calc(100% - 80px)`, height: 2, background: "#e0e0e0", transform: "translateX(-50%)" }} />
          {node.children.map(child => (
            <OrgNode key={child.id} node={child} depth={depth + 1} employees={employees} onUpdateManager={onUpdateManager} editable={editable} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [currentUser, setCurrentUser] = useState(INITIAL_EMPLOYEES[0]);
  const [view, setView] = useState("dashboard");
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [balances, setBalances] = useState(INITIAL_BALANCES);
  const [showForm, setShowForm] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date(2026, 2, 1));
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [toast, setToast] = useState(null);
  const [gcalLoading, setGcalLoading] = useState({});
  const [orgEditable, setOrgEditable] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [entitlements, setEntitlements] = useState({ ...DEFAULT_ENTITLEMENTS });
  const [entitlementDraft, setEntitlementDraft] = useState({ ...DEFAULT_ENTITLEMENTS });
  const [entitlementSaved, setEntitlementSaved] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [empBalanceDraft, setEmpBalanceDraft] = useState({});
  const [empBalanceSaved, setEmpBalanceSaved] = useState(false);
  const [form, setForm] = useState({ type: "Annual Leave", start: "", end: "", reason: "" });

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const saveEntitlements = useCallback(() => {
    setEntitlements(prev => {
      const next = { ...entitlementDraft };
      setBalances(prevB => {
        const nextB = { ...prevB };
        Object.keys(nextB).forEach(empId => {
          const updated = { ...nextB[empId] };
          LEAVE_TYPES.forEach(lt => {
            if ((entitlementDraft[lt] || 0) > (prev[lt] || 0)) {
              const diff = (entitlementDraft[lt] || 0) - (prev[lt] || 0);
              updated[lt] = (updated[lt] || 0) + diff;
            }
          });
          nextB[empId] = updated;
        });
        return nextB;
      });
      return next;
    });
    setEntitlementSaved(true);
    setTimeout(() => setEntitlementSaved(false), 2500);
    showToast("Entitlements updated for all employees!");
  }, [entitlementDraft, showToast]);

  const myRequests = requests.filter(r => r.employeeId === currentUser.id);
  const myBalance = balances[currentUser.id] || {};

  const pendingForMe = useMemo(() => {
    if (currentUser.role === "admin") return requests.filter(r => r.status === "pending");
    if (currentUser.role === "manager") return requests.filter(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      return r.status === "pending" && emp?.managerId === currentUser.id;
    });
    return [];
  }, [currentUser, requests, employees]);

  // Submit leave
  const submitLeave = async () => {
    if (!form.start || !form.end || !form.reason.trim()) return showToast("Please fill all fields", "error");
    const days = getDaysBetween(form.start, form.end);
    if (days <= 0) return showToast("Invalid date range", "error");
    if ((myBalance[form.type] || 0) < days) return showToast("Insufficient leave balance", "error");

    const newReq = { id: Date.now(), employeeId: currentUser.id, type: form.type, start: form.start, end: form.end, days, reason: form.reason, status: "pending", submittedAt: new Date().toISOString().split("T")[0], gcalSynced: false };
    setRequests(prev => [newReq, ...prev]);
    setForm({ type: "Annual Leave", start: "", end: "", reason: "" });
    setShowForm(false);
    showToast("Request submitted!");

    // Email manager
    const manager = employees.find(e => e.id === currentUser.managerId);
    if (manager) {
      setEmailStatus("sending");
      const result = await notifyManager(manager, currentUser, newReq);
      setEmailStatus(result ? "sent" : "failed");
      setTimeout(() => setEmailStatus(null), 4000);
    }
  };

  // Review request
  const reviewRequest = async (decision) => {
    const r = reviewModal;
    setRequests(prev => prev.map(req => {
      if (req.id !== r.id) return req;
      if (decision === "approved") {
        setBalances(prev2 => ({ ...prev2, [req.employeeId]: { ...prev2[req.employeeId], [req.type]: (prev2[req.employeeId]?.[req.type] || 0) - req.days } }));
      }
      return { ...req, status: decision, reviewedBy: currentUser.id, reviewNote };
    }));

    // Email employee
    const emp = employees.find(e => e.id === r.employeeId);
    if (emp) {
      setEmailStatus("sending");
      const result = await notifyEmployee(emp, currentUser, r, decision, reviewNote);
      setEmailStatus(result ? "sent" : "failed");
      setTimeout(() => setEmailStatus(null), 4000);
    }

    setReviewModal(null);
    setReviewNote("");
    showToast(`Request ${decision}!`);
  };

  // GCal sync
  const syncGCal = async (request) => {
    const emp = employees.find(e => e.id === request.employeeId);
    setGcalLoading(p => ({ ...p, [request.id]: true }));
    const result = await syncToGoogleCalendar(emp, request);
    setGcalLoading(p => ({ ...p, [request.id]: false }));
    if (result?.success) {
      setRequests(prev => prev.map(r => r.id === request.id ? { ...r, gcalSynced: true } : r));
      showToast(result.mock ? "📅 (Mock) Added to Google Calendar!" : "📅 Added to Google Calendar!");
    } else {
      showToast("Google Calendar sync failed", "error");
    }
  };

  // Org chart
  const updateManagerId = useCallback((empId, managerId) => {
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, managerId } : e));
    showToast("Reporting line updated");
  }, [showToast]);

  const orgTree = useMemo(() => buildOrgTree(employees), [employees]);

  // Calendar
  const calDays = useMemo(() => {
    const year = calMonth.getFullYear(), month = calMonth.getMonth();
    const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }, [calMonth]);

  const getCalDayLeaves = (date) => {
    if (!date) return [];
    const ds = date.toISOString().split("T")[0];
    return requests.filter(r => r.status === "approved" && ds >= r.start && ds <= r.end);
  };

  const isAdmin = currentUser.role === "admin";
  const isManager = currentUser.role === "manager" || isAdmin;

  // ── STYLES ──
  const S = {
    inputBase: { width: "100%", padding: "10px 14px", border: "1.5px solid #e8e8e8", borderRadius: 10, fontSize: 14, fontFamily: "'Instrument Sans', sans-serif", outline: "none", background: "#fafafa", boxSizing: "border-box" },
    btnDark: { background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    btnOutline: { background: "transparent", color: "#1a1a2e", border: "1.5px solid #d0d0d0", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, cursor: "pointer" },
    btnGreen: { background: "#188038", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    btnRed: { background: "#d93025", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    card: { background: "#fff", borderRadius: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden" },
    sectionLabel: { fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#aaa", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
    pageTitle: { margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.5px" },
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "▦" },
    { id: "submit",    label: "My Leaves",  icon: "◈" },
    { id: "calendar",  label: "Calendar",   icon: "⬡" },
    { id: "org",       label: "Organization", icon: "◉" },
    ...(isManager ? [{ id: "approvals", label: `Approvals${pendingForMe.length > 0 ? ` (${pendingForMe.length})` : ""}`, icon: "◎" }] : []),
    ...(isAdmin   ? [{ id: "orgchart",  label: "Org Chart Builder", icon: "⬡" }, { id: "entitlements", label: "Leave Entitlements", icon: "◇" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", fontFamily: "'Instrument Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Instrument+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
        .nav-btn { transition: all 0.18s !important; }
        .nav-btn:hover { background: rgba(255,255,255,0.09) !important; color: #fff !important; }
        .card-hover { transition: all 0.2s; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.11) !important; }
        .row-hover:hover { background: #f9fafb !important; }
        .btn-anim { transition: all 0.18s; }
        .btn-anim:hover { opacity: 0.88; transform: translateY(-1px); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideRight { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .fade-up { animation: fadeUp 0.28s ease both; }
        input:focus, select:focus, textarea:focus { border-color: #1a1a2e !important; }
        .gcal-mock-banner { background: linear-gradient(135deg, #4285F420, #34A85320); border: 1px dashed #4285F460; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "error" ? "#d93025" : "#1a1a2e", color: "#fff", padding: "13px 22px", borderRadius: 12, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, boxShadow: "0 6px 24px rgba(0,0,0,0.22)", animation: "slideRight 0.3s ease", maxWidth: 340 }}>
          {toast.msg}
        </div>
      )}

      {/* EMAIL STATUS */}
      {emailStatus && (
        <div style={{ position: "fixed", top: 64, right: 20, zIndex: 9998, background: emailStatus === "sending" ? "#f59e0b" : emailStatus === "sent" ? "#188038" : "#d93025", color: "#fff", padding: "10px 18px", borderRadius: 10, fontFamily: "'DM Mono', monospace", fontSize: 12, animation: "slideRight 0.3s ease" }}>
          {emailStatus === "sending" ? "📧 Sending email..." : emailStatus === "sent" ? "📧 Email sent!" : "📧 Email failed (check config)"}
        </div>
      )}

      {/* REVIEW MODAL */}
      {reviewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 22, padding: 36, width: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }} className="fade-up">
            <div style={S.sectionLabel}>Manager Review</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: "#1a1a2e" }}>Leave Request</h3>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 22 }}>
              {employees.find(e => e.id === reviewModal.employeeId)?.name} · <TypeTag type={reviewModal.type} /> · {reviewModal.days} day(s)
            </p>
            <div style={{ background: "#f8f9fa", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[["From", reviewModal.start], ["To", reviewModal.end], ["Working days", reviewModal.days], ["Submitted", reviewModal.submittedAt]].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 11, color: "#aaa", fontFamily: "'DM Mono', monospace", marginBottom: 2 }}>{k}</div><div style={{ fontWeight: 600, fontSize: 14 }}>{v}</div></div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}><div style={{ fontSize: 11, color: "#aaa", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>Reason</div><div style={{ fontSize: 14 }}>{reviewModal.reason}</div></div>
            </div>
            <textarea placeholder="Add a note to the employee (optional)..." value={reviewNote} onChange={e => setReviewNote(e.target.value)} style={{ ...S.inputBase, height: 80, resize: "none", marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => reviewRequest("approved")} style={{ ...S.btnGreen, flex: 1 }} className="btn-anim">✓ Approve</button>
              <button onClick={() => reviewRequest("rejected")} style={{ ...S.btnRed, flex: 1 }} className="btn-anim">✗ Reject</button>
              <button onClick={() => { setReviewModal(null); setReviewNote(""); }} style={S.btnOutline} className="btn-anim">Cancel</button>
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: "#aaa", fontFamily: "'DM Mono', monospace", textAlign: "center" }}>Employee will be notified via email upon decision</div>
          </div>
        </div>
      )}

      {/* LAYOUT */}
      <div style={{ display: "flex", minHeight: "100vh" }}>

        {/* SIDEBAR */}
        <div style={{ width: 248, background: "#1a1a2e", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
          <div style={{ padding: "28px 22px 16px" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", color: "#fff", fontSize: 17, fontWeight: 500, letterSpacing: "-0.5px" }}>SparkTime OS</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>Enterprise · v2.0</div>
          </div>

          {/* User switcher */}
          <div style={{ margin: "0 12px 18px", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12 }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "'DM Mono', monospace", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>Viewing As</div>
            <select value={currentUser.id} onChange={e => { setCurrentUser(employees.find(emp => emp.id === parseInt(e.target.value))); setView("dashboard"); }}
              style={{ width: "100%", background: "transparent", border: "none", color: "#fff", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", outline: "none" }}>
              {employees.map(e => <option key={e.id} value={e.id} style={{ background: "#1a1a2e" }}>{e.name} ({e.role})</option>)}
            </select>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setView(item.id)} className="nav-btn"
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 22px", background: view === item.id ? "rgba(255,255,255,0.11)" : "transparent", border: "none", color: view === item.id ? "#fff" : "rgba(255,255,255,0.5)", textAlign: "left", fontSize: 13, fontFamily: "'Instrument Sans', sans-serif", fontWeight: view === item.id ? 600 : 400, cursor: "pointer", borderLeft: view === item.id ? "3px solid rgba(255,255,255,0.7)" : "3px solid transparent" }}>
                <span style={{ fontSize: 14, opacity: 0.8 }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>

          {/* GCal mock notice */}
          <div style={{ margin: "0 12px 20px", background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.2)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "'DM Mono', monospace", lineHeight: 1.5 }}>
              📅 Google Calendar<br />
              <span style={{ color: "rgba(255,255,255,0.35)" }}>Mock mode · Add credentials to activate</span>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: "36px 40px", maxWidth: 1100 }} className="fade-up" key={view}>

            {/* ── DASHBOARD ── */}
            {view === "dashboard" && (
              <div>
                <div style={{ marginBottom: 30 }}>
                  <div style={S.sectionLabel}>Dashboard</div>
                  <h1 style={S.pageTitle}>Good day, {currentUser.name.split(" ")[0]} 👋</h1>
                  <p style={{ color: "#888", fontSize: 14, marginTop: 4 }}>{currentUser.title} · {currentUser.dept}</p>
                </div>

                {/* Notification banner if EmailJS not configured */}
                {EMAILJS_CONFIG.SERVICE_ID === "YOUR_SERVICE_ID" && (
                  <div style={{ background: "#fff8e1", border: "1px solid #fbbf24", borderRadius: 12, padding: "12px 18px", marginBottom: 22, fontSize: 13, color: "#92400e", display: "flex", alignItems: "center", gap: 10 }}>
                    <span>⚠️</span>
                    <span><strong>EmailJS not configured.</strong> Open the code and fill in <code style={{ fontFamily: "'DM Mono', monospace", background: "#fef3c7", padding: "1px 5px", borderRadius: 4 }}>EMAILJS_CONFIG</code> at the top to enable email notifications.</span>
                  </div>
                )}

                {/* Balances */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
                  {LEAVE_TYPES.map(lt => {
                    const bal = myBalance[lt] || 0;
                    const c = TYPE_COLORS[lt];
                    return (
                      <div key={lt} className="card-hover" style={{ ...S.card, padding: 20 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, marginBottom: 14 }} />
                        <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#1a1a2e", letterSpacing: "-1px" }}>{bal}</div>
                        <div style={{ fontSize: 12, color: "#888", marginTop: 4, lineHeight: 1.3 }}>{lt}</div>
                        <div style={{ fontSize: 10, color: "#ccc", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>days remaining</div>
                      </div>
                    );
                  })}
                </div>

                {/* Recent */}
                <div style={S.card}>
                  <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Recent Requests</div>
                    <button onClick={() => setView("submit")} style={{ ...S.btnOutline, padding: "6px 14px", fontSize: 12 }} className="btn-anim">View All</button>
                  </div>
                  {myRequests.length === 0
                    ? <div style={{ padding: 48, textAlign: "center", color: "#ccc", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>No requests yet</div>
                    : myRequests.slice(0, 4).map((r, i) => (
                      <div key={r.id} className="row-hover" style={{ padding: "15px 24px", borderBottom: i < 3 ? "1px solid #f6f6f6" : "none", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 5 }}><TypeTag type={r.type} /><Badge status={r.status} /></div>
                          <div style={{ fontSize: 12, color: "#888", fontFamily: "'DM Mono', monospace" }}>{r.start} → {r.end} · {r.days}d</div>
                        </div>
                        {r.status === "approved" && (
                          <GCalBadge synced={r.gcalSynced} loading={gcalLoading[r.id]} onSync={() => syncGCal(r)} />
                        )}
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* ── MY LEAVES ── */}
            {view === "submit" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26 }}>
                  <div><div style={S.sectionLabel}>Employee</div><h1 style={S.pageTitle}>My Leave Requests</h1></div>
                  <button onClick={() => setShowForm(!showForm)} style={S.btnDark} className="btn-anim">{showForm ? "✕ Cancel" : "+ New Request"}</button>
                </div>

                {showForm && (
                  <div style={{ ...S.card, padding: 28, marginBottom: 22 }} className="fade-up">
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, fontFamily: "'DM Mono', monospace" }}>New Leave Request</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Leave Type</label>
                        <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={S.inputBase}>
                          {LEAVE_TYPES.map(lt => <option key={lt}>{lt}</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 5, fontFamily: "'DM Mono', monospace" }}>Available balance: <strong>{myBalance[form.type] || 0} days</strong></div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Start Date</label>
                        <input type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} style={S.inputBase} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>End Date</label>
                        <input type="date" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} style={S.inputBase} />
                      </div>
                      {form.start && form.end && getDaysBetween(form.start, form.end) > 0 && (
                        <div style={{ gridColumn: "1/-1", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "'DM Mono', monospace", color: "#166534" }}>
                          📅 {getDaysBetween(form.start, form.end)} working day(s) selected
                        </div>
                      )}
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Reason</label>
                        <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Briefly describe your reason..." style={{ ...S.inputBase, height: 80, resize: "none" }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <button onClick={submitLeave} style={S.btnDark} className="btn-anim">Submit Request</button>
                      <div style={{ fontSize: 12, color: "#aaa", fontFamily: "'DM Mono', monospace" }}>📧 Your manager will be notified by email</div>
                    </div>
                  </div>
                )}

                <div style={S.card}>
                  {myRequests.length === 0
                    ? <div style={{ padding: 60, textAlign: "center", color: "#ccc", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>No requests yet — submit your first leave above.</div>
                    : myRequests.map((r, i) => (
                      <div key={r.id} className="row-hover" style={{ padding: "20px 24px", borderBottom: i < myRequests.length - 1 ? "1px solid #f6f6f6" : "none" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><TypeTag type={r.type} /><Badge status={r.status} /></div>
                            <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 14 }}>{r.start} → {r.end}</div>
                            <div style={{ fontSize: 13, color: "#777" }}>{r.reason}</div>
                            {r.reviewNote && <div style={{ marginTop: 8, fontSize: 12, color: "#888", fontStyle: "italic", background: "#f8f8f8", padding: "6px 10px", borderRadius: 8, display: "inline-block" }}>💬 {r.reviewNote}</div>}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#1a1a2e" }}>{r.days}</div>
                            <div style={{ fontSize: 10, color: "#aaa", fontFamily: "'DM Mono', monospace" }}>days</div>
                            {r.status === "approved" && (
                              <div style={{ marginTop: 8 }}>
                                <GCalBadge synced={r.gcalSynced} loading={gcalLoading[r.id]} onSync={() => syncGCal(r)} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* ── CALENDAR ── */}
            {view === "calendar" && (
              <div>
                <div style={{ marginBottom: 26 }}><div style={S.sectionLabel}>Visibility</div><h1 style={S.pageTitle}>Team Calendar</h1></div>
                <div style={{ ...S.card }}>
                  <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} style={{ ...S.btnOutline, padding: "6px 14px" }} className="btn-anim">←</button>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 16 }}>{calMonth.toLocaleString("default", { month: "long", year: "numeric" })}</div>
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} style={{ ...S.btnOutline, padding: "6px 14px" }} className="btn-anim">→</button>
                  </div>
                  <div style={{ padding: 24 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                        <div key={d} style={{ textAlign: "center", fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#bbb", padding: "4px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                      {calDays.map((date, i) => {
                        const leaves = date ? getCalDayLeaves(date) : [];
                        const isToday = date && date.toDateString() === new Date(2026, 1, 25).toDateString();
                        const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);
                        return (
                          <div key={i} style={{ minHeight: 74, padding: 6, borderRadius: 10, background: isToday ? "#1a1a2e" : isWeekend ? "#fafafa" : "#fff", border: isToday ? "none" : "1px solid #f0f0f0" }}>
                            {date && <>
                              <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: isToday ? "#fff" : isWeekend ? "#ccc" : "#444", fontWeight: isToday ? 700 : 400, marginBottom: 4 }}>{date.getDate()}</div>
                              {leaves.slice(0, 2).map((r, j) => {
                                const emp = employees.find(e => e.id === r.employeeId);
                                const c = TYPE_COLORS[r.type];
                                return <div key={j} title={`${emp?.name}: ${r.type}`} style={{ background: c.bg, color: c.text, fontSize: 9, borderRadius: 4, padding: "1px 5px", marginBottom: 2, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp?.name.split(" ")[0]}</div>;
                              })}
                              {leaves.length > 2 && <div style={{ fontSize: 9, color: "#aaa", fontFamily: "'DM Mono', monospace" }}>+{leaves.length - 2}</div>}
                            </>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ padding: "14px 24px", borderTop: "1px solid #f0f0f0", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {LEAVE_TYPES.map(lt => (
                      <div key={lt} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#666" }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLORS[lt].dot }} />{lt}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── ORGANIZATION VIEW ── */}
            {view === "org" && (
              <div>
                <div style={{ marginBottom: 26 }}><div style={S.sectionLabel}>People</div><h1 style={S.pageTitle}>Our Organization</h1></div>

                {/* Dept grouping */}
                {(() => {
                  const depts = [...new Set(employees.map(e => e.dept))];
                  return depts.map(dept => {
                    const deptEmps = employees.filter(e => e.dept === dept);
                    return (
                      <div key={dept} style={{ marginBottom: 28 }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>{dept} · {deptEmps.length} people</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                          {deptEmps.map(emp => {
                            const empReqs = requests.filter(r => r.employeeId === emp.id);
                            const onLeave = empReqs.some(r => r.status === "approved" && new Date() >= new Date(r.start) && new Date() <= new Date(r.end));
                            const manager = employees.find(e => e.id === emp.managerId);
                            return (
                              <div key={emp.id} className="card-hover" style={{ ...S.card, padding: 20 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                                  <div style={{ position: "relative" }}>
                                    <Avatar initials={emp.avatar} size={46} />
                                    {onLeave && <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: "#f59e0b", border: "2px solid #fff" }} title="Currently on leave" />}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>{emp.name}</div>
                                    <div style={{ fontSize: 12, color: "#888" }}>{emp.title}</div>
                                    <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: emp.role === "admin" ? "#7c3aed" : emp.role === "manager" ? "#1a73e8" : "#aaa", marginTop: 2 }}>{emp.role}</div>
                                  </div>
                                </div>
                                <div style={{ fontSize: 11, color: "#aaa", display: "flex", flexDirection: "column", gap: 4 }}>
                                  {manager && <div>📊 Reports to <strong style={{ color: "#555" }}>{manager.name}</strong></div>}
                                  <div>📧 <span style={{ color: "#888" }}>{emp.email}</span></div>
                                  {onLeave && <div style={{ color: "#f59e0b", fontWeight: 600 }}>🟡 Currently on leave</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* ── APPROVALS ── */}
            {view === "approvals" && isManager && (
              <div>
                <div style={{ marginBottom: 26 }}>
                  <div style={S.sectionLabel}>{isAdmin ? "Admin" : "Manager"}</div>
                  <h1 style={S.pageTitle}>Approval Queue</h1>
                  <p style={{ color: "#888", fontSize: 14, marginTop: 4 }}>{pendingForMe.length} pending · employees will be emailed on decision</p>
                </div>

                {(() => {
                  const teamIds = isAdmin ? employees.map(e => e.id) : employees.filter(e => e.managerId === currentUser.id).map(e => e.id);
                  const teamReqs = requests.filter(r => teamIds.includes(r.employeeId)).sort((a, b) => (a.status === "pending" ? -1 : 1));
                  return (
                    <div style={S.card}>
                      {teamReqs.length === 0
                        ? <div style={{ padding: 60, textAlign: "center", color: "#ccc", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>No requests from your team</div>
                        : teamReqs.map((r, i) => {
                          const emp = employees.find(e => e.id === r.employeeId);
                          const mgr = employees.find(e => e.id === r.reviewedBy);
                          return (
                            <div key={r.id} className="row-hover" style={{ padding: "18px 24px", borderBottom: i < teamReqs.length - 1 ? "1px solid #f6f6f6" : "none", display: "flex", alignItems: "center", gap: 14 }}>
                              <Avatar initials={emp?.avatar || "??"} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 5 }}>{emp?.name} <span style={{ fontWeight: 400, color: "#aaa", fontSize: 12 }}>· {emp?.title}</span></div>
                                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}><TypeTag type={r.type} /><Badge status={r.status} /></div>
                                <div style={{ fontSize: 12, color: "#888", fontFamily: "'DM Mono', monospace" }}>{r.start} → {r.end} · {r.days}d</div>
                                <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>{r.reason}</div>
                                {r.reviewNote && <div style={{ marginTop: 6, fontSize: 11, color: "#aaa", fontStyle: "italic" }}>💬 {r.reviewNote} — {mgr?.name}</div>}
                              </div>
                              {r.status === "pending" && (
                                <button onClick={() => { setReviewModal(r); setReviewNote(""); }} style={{ ...S.btnDark, padding: "9px 18px", fontSize: 12 }} className="btn-anim">Review →</button>
                              )}
                              {r.status === "approved" && (
                                <GCalBadge synced={r.gcalSynced} loading={gcalLoading[r.id]} onSync={() => syncGCal(r)} />
                              )}
                            </div>
                          );
                        })
                      }
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── LEAVE ENTITLEMENTS (Admin only) ── */}
            {view === "entitlements" && isAdmin && (
              <div>
                <div style={{ marginBottom: 26 }}>
                  <div style={S.sectionLabel}>Admin Panel</div>
                  <h1 style={S.pageTitle}>Leave Entitlements</h1>
                  <p style={{ color: "#888", fontSize: 14, marginTop: 4 }}>Set org-wide defaults or override balances per employee — useful when migrating from another platform.</p>
                </div>

                {/* Tab toggle */}
                {(() => {
                  const entTab = !selectedEmpId ? "defaults" : "individual";
                  return (
                    <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "#f0f0f0", borderRadius: 12, padding: 4, width: "fit-content" }}>
                      {[["defaults", "🏢 Org-Wide Defaults"], ["individual", "👤 Per-Employee Balances"]].map(([id, label]) => (
                        <button key={id} onClick={() => { if (id === "defaults") setSelectedEmpId(null); else setSelectedEmpId(employees.find(e => e.role !== "admin")?.id || employees[0]?.id); }}
                          style={{ padding: "9px 20px", borderRadius: 9, border: "none", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer", background: (id === "individual" ? !!selectedEmpId : !selectedEmpId) ? "#fff" : "transparent", color: (id === "individual" ? !!selectedEmpId : !selectedEmpId) ? "#1a1a2e" : "#888", boxShadow: (id === "individual" ? !!selectedEmpId : !selectedEmpId) ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.18s" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* ORG-WIDE DEFAULTS */}
                {!selectedEmpId && (
                  <div className="fade-up">
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                      <button onClick={saveEntitlements} style={{ ...S.btnGreen, opacity: entitlementSaved ? 0.7 : 1 }} className="btn-anim">
                        {entitlementSaved ? "✓ Saved!" : "Save & Apply to All"}
                      </button>
                    </div>
                    <div style={{ ...S.card, marginBottom: 20 }}>
                      <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0", fontWeight: 600, fontSize: 15 }}>Default Days Per Leave Type</div>
                      {LEAVE_TYPES.map((lt, i) => {
                        const c = TYPE_COLORS[lt];
                        return (
                          <div key={lt} className="row-hover" style={{ padding: "18px 24px", borderBottom: i < LEAVE_TYPES.length - 1 ? "1px solid #f6f6f6" : "none", display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{lt}</div>
                              <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>Current default: <strong>{entitlements[lt]}</strong> days</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <button onClick={() => setEntitlementDraft(d => ({ ...d, [lt]: Math.max(0, (d[lt] || 0) - 1) }))} style={{ ...S.btnOutline, padding: "4px 12px", fontSize: 16, lineHeight: 1 }} className="btn-anim">−</button>
                              <input type="number" min="0" max="365" value={entitlementDraft[lt] ?? 0}
                                onChange={e => setEntitlementDraft(d => ({ ...d, [lt]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                style={{ ...S.inputBase, width: 72, textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 16 }} />
                              <button onClick={() => setEntitlementDraft(d => ({ ...d, [lt]: (d[lt] || 0) + 1 }))} style={{ ...S.btnOutline, padding: "4px 12px", fontSize: 16, lineHeight: 1 }} className="btn-anim">+</button>
                              <span style={{ fontSize: 12, color: "#aaa", fontFamily: "'DM Mono', monospace", width: 28 }}>days</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#166534" }}>
                      💡 <strong>How it works:</strong> "Save & Apply to All" pushes increases to every employee. Decreasing does not reduce existing balances — use the Per-Employee tab to set exact values for migrated employees.
                    </div>
                  </div>
                )}

                {/* PER-EMPLOYEE BALANCES */}
                {!!selectedEmpId && (
                  <div className="fade-up" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

                    {/* Employee list */}
                    <div style={{ ...S.card, width: 220, flexShrink: 0 }}>
                      {employees.filter(e => e.role !== "admin").map((emp, i, arr) => (
                        <div key={emp.id} onClick={() => { setSelectedEmpId(emp.id); setEmpBalanceDraft({ ...balances[emp.id] }); setEmpBalanceSaved(false); }}
                          style={{ padding: "12px 16px", borderBottom: i < arr.length - 1 ? "1px solid #f6f6f6" : "none", cursor: "pointer", background: selectedEmpId === emp.id ? "#f0f4ff" : "transparent", display: "flex", alignItems: "center", gap: 10, transition: "background 0.15s" }}>
                          <Avatar initials={emp.avatar} size={30} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: selectedEmpId === emp.id ? 700 : 500, color: selectedEmpId === emp.id ? "#1a1a2e" : "#444" }}>{emp.name}</div>
                            <div style={{ fontSize: 10, color: "#aaa", fontFamily: "'DM Mono', monospace" }}>{emp.dept}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Balance editor */}
                    {(() => {
                      const emp = employees.find(e => e.id === selectedEmpId);
                      if (!emp) return null;
                      const draft = Object.keys(empBalanceDraft).length ? empBalanceDraft : { ...balances[emp.id] };
                      return (
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <Avatar initials={emp.avatar} size={38} />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 16 }}>{emp.name}</div>
                                <div style={{ fontSize: 12, color: "#888" }}>{emp.title} · {emp.dept}</div>
                              </div>
                            </div>
                            <button onClick={() => {
                              setBalances(prev => ({ ...prev, [emp.id]: { ...draft } }));
                              setEmpBalanceSaved(true);
                              setTimeout(() => setEmpBalanceSaved(false), 2500);
                              showToast(`Balances updated for ${emp.name}!`);
                            }} style={{ ...S.btnGreen, opacity: empBalanceSaved ? 0.7 : 1 }} className="btn-anim">
                              {empBalanceSaved ? "✓ Saved!" : "Save for this Employee"}
                            </button>
                          </div>

                          <div style={S.card}>
                            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#888" }}>
                              Set exact <strong>remaining</strong> balance for each leave type. This is the number of days they still have left to use.
                            </div>
                            {LEAVE_TYPES.map((lt, i) => {
                              const c = TYPE_COLORS[lt];
                              const val = draft[lt] ?? 0;
                              return (
                                <div key={lt} className="row-hover" style={{ padding: "16px 20px", borderBottom: i < LEAVE_TYPES.length - 1 ? "1px solid #f6f6f6" : "none", display: "flex", alignItems: "center", gap: 14 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                                  <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{lt}</div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <button onClick={() => setEmpBalanceDraft(d => ({ ...d, [lt]: Math.max(0, (d[lt] ?? 0) - 1) }))} style={{ ...S.btnOutline, padding: "4px 11px", fontSize: 15, lineHeight: 1 }} className="btn-anim">−</button>
                                    <input type="number" min="0" max="365" value={val}
                                      onChange={e => setEmpBalanceDraft(d => ({ ...d, [lt]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                      style={{ ...S.inputBase, width: 68, textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15 }} />
                                    <button onClick={() => setEmpBalanceDraft(d => ({ ...d, [lt]: (d[lt] ?? 0) + 1 }))} style={{ ...S.btnOutline, padding: "4px 11px", fontSize: 15, lineHeight: 1 }} className="btn-anim">+</button>
                                    <span style={{ fontSize: 11, color: "#aaa", fontFamily: "'DM Mono', monospace", width: 24 }}>days</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ── ORG CHART BUILDER (Admin only) ── */}
            {view === "orgchart" && isAdmin && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26 }}>
                  <div><div style={S.sectionLabel}>Admin Panel</div><h1 style={S.pageTitle}>Org Chart Builder</h1></div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setOrgEditable(!orgEditable)} style={orgEditable ? S.btnGreen : S.btnOutline} className="btn-anim">
                      {orgEditable ? "✓ Editing" : "✎ Edit Reporting Lines"}
                    </button>
                  </div>
                </div>

                {orgEditable && (
                  <div style={{ background: "#fff8e1", border: "1px solid #fbbf24", borderRadius: 12, padding: "12px 18px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
                    ✎ Edit mode active — use the dropdowns on each card to change who an employee reports to. Changes take effect immediately and govern the approval flow.
                  </div>
                )}

                <div style={{ ...S.card, padding: 32, overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: 32, justifyContent: "center", minWidth: 700, paddingBottom: 16 }}>
                    {orgTree.map(root => (
                      <OrgNode key={root.id} node={root} employees={employees} onUpdateManager={updateManagerId} editable={orgEditable} />
                    ))}
                  </div>
                </div>

                {/* Approval flow table */}
                <div style={{ ...S.card, marginTop: 24 }}>
                  <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0", fontWeight: 600, fontSize: 15 }}>Approval Flow Summary</div>
                  {employees.filter(e => e.role === "employee").map((emp, i, arr) => {
                    const mgr = employees.find(e => e.id === emp.managerId);
                    return (
                      <div key={emp.id} className="row-hover" style={{ padding: "13px 24px", borderBottom: i < arr.length - 1 ? "1px solid #f6f6f6" : "none", display: "flex", alignItems: "center", gap: 14 }}>
                        <Avatar initials={emp.avatar} size={32} />
                        <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                        <div style={{ fontSize: 12, color: "#aaa", fontFamily: "'DM Mono', monospace" }}>→ approver →</div>
                        {mgr ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar initials={mgr.avatar} size={28} />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{mgr.name}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "#f59e0b", fontFamily: "'DM Mono', monospace" }}>⚠ No manager assigned</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}