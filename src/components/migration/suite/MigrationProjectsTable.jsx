import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Inbox, Trash2 } from "lucide-react";
import { downloadText, toCsv } from "./csv";
import { FILTER_ORDER, STATUS_META, readingsLabel, sourceLabel } from "./migrationMeta";

const PER_PAGE = 8;
const STATUS_RANK = { draft: 0, ready: 1, running: 2, completed: 3, failed: 4 };

const numberFmt = new Intl.NumberFormat("en-US");

const CSS = `
.mpt-section { display:block; color:#1D283A; container-type: inline-size; }
.mpt-card {
  position: relative;
  border: 1px solid #E1E7EF;
  border-radius: 16px;
  background: #FFFFFF;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}
.mpt-head {
  display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 20px;
  padding: 22px 24px 18px;
}
.mpt-titles { flex: 1 1 260px; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.mpt-title { margin: 0; font-size: 1.375rem; font-weight: 600; letter-spacing: -0.2px; color: #1D283A; }
.mpt-meta { margin: 0; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: #65758B; white-space: nowrap; }

.mpt-toolwrap { position: relative; padding: 0 24px 12px; display: grid; }
.mpt-tools { grid-area: 1 / 1; min-width: 0; }
.mpt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mpt-fcard {
  position: relative; isolation: isolate; overflow: hidden;
  flex: 1 1 118px; min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  min-height: 62px; padding: 8px 12px;
  border: 1px solid #E1E7EF; border-radius: 14px;
  background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 50%, #F1F5F9 100%);
  color: #1D283A; font: inherit; cursor: pointer;
  transition: color .28s ease, border-color .28s ease;
}
.mpt-fcard::before {
  content: ""; position: absolute; left: 50%; top: 50%;
  width: 8px; height: 8px; border-radius: 50%;
  transform: translate(-50%, -50%) scale(1);
  background: var(--mpt-fc-fill);
  opacity: 0; z-index: 0; pointer-events: none;
  transition: width .7s cubic-bezier(.16,1,.3,1), height .7s cubic-bezier(.16,1,.3,1),
              border-radius .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1), opacity .24s ease;
}
.mpt-fcard > * { position: relative; z-index: 1; }
.mpt-fcard:hover::before, .mpt-fcard[aria-pressed="true"]::before {
  opacity: 1; width: 100%; height: 100%; border-radius: 14px; transform: translate(-50%, -50%) scale(1.25);
}
.mpt-fcard:hover, .mpt-fcard[aria-pressed="true"] { color: var(--mpt-fc-ink); border-color: var(--mpt-fc); }
.mpt-fcard-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--mpt-fc); }
.mpt-fcard:hover .mpt-fcard-dot, .mpt-fcard[aria-pressed="true"] .mpt-fcard-dot { background: var(--mpt-fc-ink); }
.mpt-fcard-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.mpt-fcard-n {
  flex: 0 0 auto; display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px;
  background: #EEF2F7; color: #475569; font-size: 13px; font-weight: 600; line-height: 1.3;
  transition: background-color .28s ease, color .28s ease;
}
.mpt-fcard:hover .mpt-fcard-n, .mpt-fcard[aria-pressed="true"] .mpt-fcard-n {
  background: rgba(255,255,255,.28); color: var(--mpt-fc-ink);
}

.mpt-btn {
  position: relative; isolation: isolate; overflow: hidden;
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 36px; padding: 8px 18px;
  border: 1px solid #CBD5E1; border-radius: 999px;
  background: linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%);
  color: #1D283A; font: inherit; font-size: 13px; font-weight: 600;
  letter-spacing: -0.1px; line-height: 1.3; cursor: pointer; white-space: nowrap;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.mpt-btn:hover { background: #F1F5F9; border-color: #94A3B8; }
.mpt-btn svg { width: 14px; height: 14px; flex: 0 0 auto; display: block; }
.mpt-btn--primary { background: #005FB8; border-color: #005FB8; color: #FFFFFF; }
.mpt-btn--primary:hover { background: #004d95; border-color: #004d95; }
.mpt-btn--ghost { background: none; border-color: transparent; color: #B91C3C; }
.mpt-btn--ghost:hover { background: #FFF1F4; }
.mpt-head > .mpt-export { margin-left: auto; }

.mpt-beam-track {
  position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none; z-index: 0;
}
.mpt-beam {
  position: absolute; width: 34px; aspect-ratio: 1;
  offset-path: border-box; offset-anchor: 50% 50%; offset-distance: 0%;
  background: linear-gradient(90deg, #005FB8 0%, #38BDF8 35%, #E11D48 70%, #F59E0B 100%);
  filter: blur(3px);
  animation: mpt-beam-run 5s linear infinite;
}
@keyframes mpt-beam-run { to { offset-distance: 100%; } }
@media (prefers-reduced-motion: reduce) { .mpt-beam { animation: none; } }

.mpt-bulk {
  position: absolute; inset: 0 24px 12px; z-index: 2;
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 0;
  background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 12px;
  opacity: 0; transform: translateY(-6px); pointer-events: none;
  transition: opacity .18s ease, transform .2s ease;
}
.mpt-card[data-bulk="on"] .mpt-bulk { opacity: 1; transform: none; pointer-events: auto; }
.mpt-card[data-bulk="on"] .mpt-tools, .mpt-card[data-bulk="on"] .mpt-head > .mpt-export { opacity: 0; visibility: hidden; pointer-events: none; }
.mpt-tools, .mpt-head > .mpt-export { transition: opacity .18s ease, visibility 0s linear .18s; }
.mpt-bulk-n { font-size: 13px; color: #1D283A; padding-left: 14px; }
.mpt-spacer { flex: 1 1 auto; }
.mpt-bulk > .mpt-btn { margin-right: 4px; }
.mpt-bulk > .mpt-btn:last-child { margin-right: 10px; }

.mpt-tablewrap {
  position: relative; margin: 0 24px; padding: 0;
  border: 1px solid #E1E7EF; border-radius: 14px; overflow-x: auto; overflow-y: hidden; background: #FFFFFF;
}
.mpt-marker {
  position: absolute; left: 0; right: 0; top: 0; height: 0;
  border-radius: 10px; background: linear-gradient(90deg, #F8FAFC 0%, #EFF6FF 51%, #F8FAFC 100%);
  opacity: 0; pointer-events: none; z-index: 0;
  transition: transform .34s cubic-bezier(.22,1,.36,1), height .34s cubic-bezier(.22,1,.36,1), opacity .3s ease;
}
.mpt-marker[data-on="1"] { opacity: 1; }
.mpt-table { position: relative; z-index: 1; width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.mpt-th {
  padding: 12px 14px; text-align: left; white-space: nowrap;
  background: #F8FAFC; color: #65758B;
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
}
.mpt-th--pick { width: 44px; padding-left: 18px; padding-right: 0; }
.mpt-th--items, .mpt-th--status { text-align: right; }
.mpt-th--status { padding-right: 22px; }
.mpt-sort {
  display: inline-flex; align-items: center; gap: 5px; padding: 0; width: 100%;
  border: 0; background: none; color: inherit; font: inherit; font-size: 11px;
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer;
}
.mpt-sort:hover { color: #005FB8; }
.mpt-sort-ind { width: 11px; height: 11px; fill: currentColor; opacity: 0; transition: opacity .14s ease, transform .18s ease; }
.mpt-th[aria-sort] .mpt-sort-ind { opacity: 1; }
.mpt-th[aria-sort="ascending"] .mpt-sort-ind { transform: rotate(180deg); }
.mpt-th--items .mpt-sort { justify-content: flex-end; flex-direction: row-reverse; }
.mpt-th--status .mpt-sort { justify-content: flex-end; flex-direction: row-reverse; }

.mpt-row { cursor: pointer; }
.mpt-cell { padding: 12px 14px; vertical-align: middle; border-top: 1px solid #EEF2F7; position: relative; }
.mpt-row:hover .mpt-cell { background: transparent; }
.mpt-cell--pick { width: 44px; padding-left: 18px; padding-right: 0; }
.mpt-cell--items { text-align: right; white-space: nowrap; }
.mpt-cell--status { text-align: right; padding-right: 22px; }
.mpt-rowline {
  position: absolute; left: 10px; right: 10px; bottom: -1px; height: 1px; border-radius: 1px;
  background: linear-gradient(90deg, #E2E8F0 0%, #005FB8 46%, #E2E8F0 99%);
  transform: scaleX(0); transform-origin: center; transition: transform .3s ease; pointer-events: none;
}
.mpt-row:hover .mpt-rowline { transform: scaleX(1); }

.mpt-name { font-size: 13px; font-weight: 500; color: #1D283A; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mpt-sub { display: block; font-size: 11px; color: #94A3B8; margin-top: 2px; }
.mpt-source { display: flex; align-items: center; gap: 8px; min-width: 0; }
.mpt-avatar {
  flex: 0 0 26px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  background: #EFF6FF; border: 1px solid #DBEAFE; color: #005FB8;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
}
.mpt-source-name { font-size: 13px; color: #1D283A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mpt-target { font-size: 13px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mpt-items { font-size: 13px; font-weight: 600; color: #005FB8; }

.mpt-badge {
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px;
  border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap;
}
.mpt-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.mpt-check { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.mpt-check input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.mpt-check-box {
  width: 16px; height: 16px; border: 1.5px solid #94A3B8; border-radius: 5px; background: #FFFFFF;
  display: grid; place-items: center; transition: border-color .14s ease, background .14s ease;
}
.mpt-check:hover .mpt-check-box { border-color: #005FB8; }
.mpt-check input:checked + .mpt-check-box { border-color: #005FB8; background: #005FB8; }
.mpt-check input:checked + .mpt-check-box::after {
  content: ""; width: 9px; height: 5px; border-left: 2px solid #FFFFFF; border-bottom: 2px solid #FFFFFF;
  transform: rotate(-45deg) translateY(-1px);
}

.mpt-empty { display: grid; place-items: center; gap: 8px; padding: 48px 20px; text-align: center; }
.mpt-empty-ico { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid #E1E7EF; border-radius: 50%; color: #65758B; background: #F8FAFC; }
.mpt-empty-t { font-size: 14px; font-weight: 600; color: #1D283A; }
.mpt-empty-p { margin: 0; max-width: 46ch; font-size: 13px; line-height: 1.55; color: #65758B; }

.mpt-skel { display: grid; gap: 8px; padding: 14px; }
.mpt-skel-row {
  height: 44px; border-radius: 10px; border: 1px solid #EEF2F7;
  background: linear-gradient(90deg, #F8FAFC 0%, #EEF2F7 40%, #F8FAFC 80%);
  background-size: 240% 100%; animation: mpt-shimmer 1.25s linear infinite;
}
@keyframes mpt-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }

.mpt-foot { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px; row-gap: 8px; padding: 18px 24px 20px; }
.mpt-range { grid-area: 1 / 1; font-size: 13px; color: #65758B; }
.mpt-meter { grid-area: 2 / 1; width: min(100%, 200px); height: 5px; border-radius: 999px; overflow: hidden; background: #EEF2F7; }
.mpt-meter-fill { display: block; height: 100%; border-radius: 999px; background: #005FB8; transition: width .28s ease; }
.mpt-pager { grid-area: 1 / 2 / span 2 / 3; display: flex; align-items: center; gap: 4px; justify-self: end; }
.mpt-page {
  min-width: 30px; height: 30px; padding: 0 8px; display: inline-grid; place-items: center;
  border: 1px solid #E1E7EF; border-radius: 8px; background: #FFFFFF; color: #475569;
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .14s ease, color .14s ease;
}
.mpt-page:hover:not(:disabled) { background: #F1F5F9; color: #1D283A; }
.mpt-page[aria-current="page"] { background: #005FB8; border-color: #005FB8; color: #FFFFFF; }
.mpt-page:disabled { opacity: .35; cursor: default; }
.mpt-page svg { width: 13px; height: 13px; }

.mpt-toast {
  position: absolute; left: 50%; bottom: 14px; transform: translate(-50%, 10px);
  display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  border: 1px solid #BBF7D0; border-radius: 999px; background: #F0FDF4; color: #15803D;
  font-size: 12px; font-weight: 600; opacity: 0; pointer-events: none;
  transition: opacity .18s ease, transform .2s ease; z-index: 5;
}
.mpt-toast[data-on="1"] { opacity: 1; transform: translate(-50%, 0); }

.mpt-enter .mpt-card { animation: mpt-in 380ms cubic-bezier(.22,1,.36,1) both; }
.mpt-enter .mpt-fcard { animation: mpt-up 320ms cubic-bezier(.22,1,.36,1) calc(80ms + var(--mpt-i, 0) * 30ms) both; }
.mpt-enter .mpt-tablewrap { animation: mpt-up 380ms cubic-bezier(.22,1,.36,1) 140ms both; }
@keyframes mpt-in { from { opacity: 0; transform: translateY(6px) scale(.99); } to { opacity: 1; transform: none; } }
@keyframes mpt-up { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .mpt-enter .mpt-card, .mpt-enter .mpt-fcard, .mpt-enter .mpt-tablewrap { animation: none; }
}
@media (max-width: 720px) {
  .mpt-th--target, .mpt-cell--target { display: none; }
}
`;

function initials(text) {
  return String(text || "?")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function MigrationProjectsTable({ projects = [], loading = false, onOpen, onDelete }) {
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [dir, setDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [toast, setToast] = useState("");
  const wrapRef = useRef(null);
  const markerRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(projects.map((p) => p.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next;
    });
  }, [projects]);

  useEffect(() => {
    setPage(1);
  }, [status, sortKey, dir]);

  const counts = useMemo(() => {
    const base = { all: projects.length };
    projects.forEach((p) => {
      base[p.status || "draft"] = (base[p.status || "draft"] || 0) + 1;
    });
    return base;
  }, [projects]);

  const filtered = useMemo(() => {
    const list = status === "all" ? projects : projects.filter((p) => (p.status || "draft") === status);
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "items") return (Number(a.item_count || 0) - Number(b.item_count || 0)) * factor;
      if (sortKey === "status") return ((STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)) * factor;
      if (sortKey === "source") return String(sourceLabel(a)).localeCompare(String(sourceLabel(b))) * factor;
      if (sortKey === "target") return String(a.target_tenant_name || "").localeCompare(String(b.target_tenant_name || "")) * factor;
      return String(a.name || "").localeCompare(String(b.name || "")) * factor;
    });
  }, [projects, status, sortKey, dir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const slice = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const pageNumbers = useMemo(() => {
    const all = Array.from({ length: totalPages }, (_, i) => i + 1);
    if (totalPages <= 7) return all;
    const start = Math.max(1, Math.min(currentPage - 3, totalPages - 5));
    return all.slice(start - 1, start + 5);
  }, [totalPages, currentPage]);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  const exportColumns = [
    "Project",
    "Source",
    "SourceType",
    "Target",
    "Workloads",
    "Mode",
    "Status",
    "Items",
    "Created",
  ];

  const toExportRow = (p) => ({
    Project: p.name || "",
    Source: sourceLabel(p),
    SourceType: p.source_type || "",
    Target: p.target_tenant_name || "",
    Workloads: readingsLabel(p),
    Mode: p.mode === "insane" ? "Insane mode" : "Standard",
    Status: STATUS_META[p.status]?.label || p.status || "",
    Items: p.item_count || 0,
    Created: p.created_date ? String(p.created_date).slice(0, 10) : "",
  });

  const exportRows = (rows, label) => {
    if (rows.length === 0) {
      showToast("Nothing to export");
      return;
    }
    downloadText(
      `migration-projects-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows.map(toExportRow), exportColumns),
      "text/csv;charset=utf-8",
    );
    showToast(`${rows.length} ${label} exported`);
  };

  const toggleSort = (key) => {
    if (sortKey === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(key === "items" ? "desc" : "asc");
    }
  };

  const togglePick = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePointer = (event) => {
    const row = event.target.closest ? event.target.closest("tr[data-row]") : null;
    if (!row || !wrapRef.current || !markerRef.current) return;
    const wrapRect = wrapRef.current.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    markerRef.current.style.height = `${rowRect.height}px`;
    markerRef.current.style.transform = `translateY(${rowRect.top - wrapRect.top - 1}px)`;
    markerRef.current.dataset.on = "1";
  };

  const clearMarker = () => {
    if (markerRef.current) markerRef.current.dataset.on = "0";
  };

  const showRows = !loading && filtered.length > 0;

  return (
    <section className="mpt-section mpt-enter">
      <style>{CSS}</style>
      <div className="mpt-card" data-bulk={selected.size > 0 ? "on" : "off"}>
        <div className="mpt-head">
          <div className="mpt-titles">
            <h3 className="mpt-title">Migration projects</h3>
            <p className="mpt-meta">
              {projects.length} {projects.length === 1 ? "project" : "projects"} &middot; {PER_PAGE} per page
            </p>
          </div>
          <span className="mpt-export">
            <button type="button" className="mpt-btn" onClick={() => exportRows(filtered, "projects")}>
              <span className="mpt-beam-track" aria-hidden="true">
                <span className="mpt-beam" />
              </span>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export CSV
            </button>
          </span>
        </div>

        <div className="mpt-toolwrap">
          <div className="mpt-tools">
            <div className="mpt-chips" role="group" aria-label="Filter projects by status">
              {FILTER_ORDER.map((key, index) => {
                const meta = key === "all" ? null : STATUS_META[key];
                const style = meta
                  ? {
                      "--mpt-fc": meta.dot,
                      "--mpt-fc-fill": meta.grad,
                      "--mpt-fc-ink": meta.ink,
                      "--mpt-i": index,
                    }
                  : {
                      "--mpt-fc": "#005FB8",
                      "--mpt-fc-fill": "linear-gradient(180deg, #334155 0%, #1D283A 100%)",
                      "--mpt-fc-ink": "#FFFFFF",
                      "--mpt-i": index,
                    };
                return (
                  <button
                    key={key}
                    type="button"
                    className="mpt-fcard"
                    style={style}
                    aria-pressed={status === key}
                    onClick={() => setStatus(key)}
                  >
                    <span className="mpt-fcard-dot" aria-hidden="true" />
                    <span className="mpt-fcard-name">{meta ? meta.label : "All"}</span>
                    <span className="mpt-fcard-n">{counts[key] || 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mpt-bulk" aria-live="polite">
            <span className="mpt-bulk-n">{selected.size} selected</span>
            <span className="mpt-spacer" />
            <button type="button" className="mpt-btn mpt-btn--ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button
              type="button"
              className="mpt-btn mpt-btn--ghost"
              onClick={() => {
                if (selected.size === 0) return;
                onDelete?.(Array.from(selected));
                setSelected(new Set());
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </button>
            <button
              type="button"
              className="mpt-btn mpt-btn--primary"
              onClick={() => exportRows(projects.filter((p) => selected.has(p.id)), "projects")}
            >
              <Download aria-hidden="true" />
              Export selected
            </button>
          </div>
        </div>

        <div
          className="mpt-tablewrap"
          ref={wrapRef}
          onPointerOver={handlePointer}
          onPointerLeave={clearMarker}
        >
          <div className="mpt-marker" ref={markerRef} aria-hidden="true" />
          {showRows && (
            <table className="mpt-table">
              <thead>
                <tr>
                  <th className="mpt-th mpt-th--pick" scope="col">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="mpt-th" scope="col" aria-sort={sortKey === "name" ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    <button type="button" className="mpt-sort" onClick={() => toggleSort("name")}>
                      Project
                      <svg className="mpt-sort-ind" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      </svg>
                    </button>
                  </th>
                  <th className="mpt-th" scope="col" aria-sort={sortKey === "source" ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    <button type="button" className="mpt-sort" onClick={() => toggleSort("source")}>
                      Source
                      <svg className="mpt-sort-ind" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      </svg>
                    </button>
                  </th>
                  <th className="mpt-th mpt-th--target" scope="col" aria-sort={sortKey === "target" ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    <button type="button" className="mpt-sort" onClick={() => toggleSort("target")}>
                      Target
                      <svg className="mpt-sort-ind" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      </svg>
                    </button>
                  </th>
                  <th className="mpt-th mpt-th--items" scope="col" aria-sort={sortKey === "items" ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    <button type="button" className="mpt-sort" onClick={() => toggleSort("items")}>
                      Items
                      <svg className="mpt-sort-ind" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      </svg>
                    </button>
                  </th>
                  <th className="mpt-th mpt-th--status" scope="col" aria-sort={sortKey === "status" ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    <button type="button" className="mpt-sort" onClick={() => toggleSort("status")}>
                      Status
                      <svg className="mpt-sort-ind" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                      </svg>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slice.map((project) => {
                  const meta = STATUS_META[project.status] || STATUS_META.draft;
                  return (
                    <tr
                      key={project.id}
                      className="mpt-row"
                      data-row
                      data-status={project.status || "draft"}
                      onClick={() => onOpen?.(project)}
                    >
                      <td className="mpt-cell mpt-cell--pick">
                        <span className="mpt-rowline" aria-hidden="true" />
                        <label className="mpt-check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(project.id)}
                            onChange={() => togglePick(project.id)}
                            aria-label={`Select ${project.name}`}
                          />
                          <span className="mpt-check-box" aria-hidden="true" />
                        </label>
                      </td>
                      <td className="mpt-cell">
                        <span className="mpt-name">{project.name}</span>
                        <span className="mpt-sub">
                          {project.mode === "insane" ? "Insane mode" : "Standard"} &middot;{" "}
                          {project.created_date ? String(project.created_date).slice(0, 10) : "no date"}
                        </span>
                      </td>
                      <td className="mpt-cell">
                        <span className="mpt-source">
                          <span className="mpt-avatar" aria-hidden="true">{initials(sourceLabel(project))}</span>
                          <span className="mpt-source-name">{sourceLabel(project)}</span>
                        </span>
                      </td>
                      <td className="mpt-cell mpt-cell--target">
                        <span className="mpt-target">{project.target_tenant_name || "Not set"}</span>
                      </td>
                      <td className="mpt-cell mpt-cell--items">
                        <span className="mpt-items">{numberFmt.format(Number(project.item_count || 0))}</span>
                      </td>
                      <td className="mpt-cell mpt-cell--status">
                        <span
                          className="mpt-badge"
                          style={{ background: `${meta.dot}1A`, color: meta.dot }}
                        >
                          <span className="mpt-badge-dot" aria-hidden="true" />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {loading && (
            <div className="mpt-skel" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="mpt-skel-row" />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="mpt-empty">
              <span className="mpt-empty-ico">
                <Inbox className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="mpt-empty-t">
                {status === "all" ? "No migration projects yet" : `No projects in ${STATUS_META[status]?.label || status}`}
              </span>
              <p className="mpt-empty-p">
                Create a project to scan a source, generate the PowerShell pack and track pre- and
                post-migration reporting for that tenant.
              </p>
            </div>
          )}
        </div>

        {showRows && (
          <div className="mpt-foot">
            <div className="mpt-range">
              Showing {(currentPage - 1) * PER_PAGE + 1}
              &ndash;{(currentPage - 1) * PER_PAGE + slice.length} of {filtered.length}
            </div>
            <div className="mpt-meter" aria-hidden="true">
              <span
                className="mpt-meter-fill"
                style={{ width: `${Math.min(100, (slice.length / Math.max(1, filtered.length)) * 100)}%` }}
              />
            </div>
            <div className="mpt-pager">
              <button
                type="button"
                className="mpt-page"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="mpt-page"
                  aria-current={n === currentPage ? "page" : undefined}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="mpt-page"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="mpt-toast" data-on={toast ? "1" : "0"} role="status" aria-live="polite">
          {toast}
        </div>
      </div>
    </section>
  );
}