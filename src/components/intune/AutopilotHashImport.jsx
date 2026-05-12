import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Upload, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle,
  Download, Plus, Trash2, ChevronDown, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

// ── CSV Parser ──────────────────────────────────────────────────────────────
function parseHashCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // Detect if first line is a header
  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.includes("serial") || firstLower.includes("hash") || firstLower.includes("hardware");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .filter(l => l.trim())
    .map((line, idx) => {
      // Split handling quoted fields
      const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
      // Expected columns: Serial Number, Windows Product ID (optional), Hardware Hash, Group Tag (optional), Assigned User (optional)
      return {
        rowIndex: idx + 1,
        serialNumber: cols[0] || "",
        windowsProductId: cols[1] || "",
        hardwareHash: cols[2] || cols[1] || "",   // some CSVs omit product ID
        groupTag: cols[3] || "",
        assignedUser: cols[4] || "",
      };
    })
    .filter(r => r.serialNumber && (r.hardwareHash || r.windowsProductId));
}

// ── Single Device Row ────────────────────────────────────────────────────────
function SingleRow({ row, onChange, onRemove }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-start py-2 border-b border-slate-100 last:border-0">
      <div className="col-span-2">
        <Input
          value={row.serialNumber}
          onChange={e => onChange({ ...row, serialNumber: e.target.value })}
          placeholder="Serial No."
          className="text-xs h-8"
        />
      </div>
      <div className="col-span-2">
        <Input
          value={row.windowsProductId}
          onChange={e => onChange({ ...row, windowsProductId: e.target.value })}
          placeholder="Product ID"
          className="text-xs h-8"
        />
      </div>
      <div className="col-span-5">
        <Input
          value={row.hardwareHash}
          onChange={e => onChange({ ...row, hardwareHash: e.target.value })}
          placeholder="Hardware Hash (required)"
          className="text-xs h-8 font-mono"
        />
      </div>
      <div className="col-span-2">
        <Input
          value={row.groupTag}
          onChange={e => onChange({ ...row, groupTag: e.target.value })}
          placeholder="Group Tag"
          className="text-xs h-8"
        />
      </div>
      <div className="col-span-1 flex justify-end">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Result Row ───────────────────────────────────────────────────────────────
function ResultRow({ r }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0 text-xs">
      {r.success
        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
      <span className="font-medium text-slate-700 w-32 truncate">{r.serialNumber}</span>
      {r.success
        ? <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px]">Imported</Badge>
        : <span className="text-red-600 flex-1 truncate">{r.error}</span>
      }
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────
export default function AutopilotHashImport({ open, onClose, selectedTenant }) {
  const [mode, setMode] = useState("single"); // "single" | "bulk"
  const [rows, setRows] = useState([{ rowIndex: 1, serialNumber: "", windowsProductId: "", hardwareHash: "", groupTag: "", assignedUser: "" }]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [csvError, setCsvError] = useState("");
  const fileRef = useRef();

  const azureTenantId = selectedTenant?.tenant_id;

  const emptyRow = () => ({ rowIndex: Date.now(), serialNumber: "", windowsProductId: "", hardwareHash: "", groupTag: "", assignedUser: "" });

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseHashCSV(ev.target.result);
      if (parsed.length === 0) {
        setCsvError("No valid devices found. Expected CSV with columns: Serial Number, Windows Product ID, Hardware Hash (and optionally Group Tag, Assigned User).");
        return;
      }
      setRows(parsed);
      setMode("bulk");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const validRows = rows.filter(r => r.serialNumber && r.hardwareHash);
    if (!validRows.length || !azureTenantId) return;

    setImporting(true);
    setResults(null);

    try {
      const res = await base44.functions.invoke("portalData", {
        action: "import_autopilot_devices",
        azure_tenant_id: azureTenantId,
        devices: validRows.map(r => ({
          serialNumber: r.serialNumber,
          windowsProductId: r.windowsProductId || null,
          hardwareHash: r.hardwareHash,
          groupTag: r.groupTag || null,
          assignedUser: r.assignedUser || null,
        })),
      });
      setResults(res.data?.results || []);
    } catch (e) {
      setResults([{ serialNumber: "Error", success: false, error: e.message }]);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setRows([emptyRow()]);
    setResults(null);
    setMode("single");
    setCsvError("");
    onClose();
  };

  const validCount = rows.filter(r => r.serialNumber && r.hardwareHash).length;
  const successCount = results?.filter(r => r.success).length || 0;
  const failCount = results?.filter(r => !r.success).length || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-600" />
            Import Autopilot Hardware Hash
            {selectedTenant && (
              <Badge className="bg-blue-50 text-blue-700 border-0 ml-1 font-normal">{selectedTenant.name}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle + CSV upload */}
        {!results && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                <button
                  onClick={() => { setMode("single"); setRows([emptyRow()]); }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === "single" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  Single Device
                </button>
                <button
                  onClick={() => setMode("bulk")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === "bulk" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  Bulk Import
                </button>
              </div>

              {/* CSV Upload */}
              <div className="flex items-center gap-2 ml-auto">
                <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleFileUpload} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                  <FileText className="h-3.5 w-3.5" /> Upload CSV
                </Button>
                <a
                  href="data:text/csv;charset=utf-8,Serial%20Number%2CWindows%20Product%20ID%2CHardware%20Hash%2CGroup%20Tag%2CAssigned%20User%0ASAMPLESERIAL123%2C%2C%2CCorporate%2C"
                  download="autopilot_hash_template.csv"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Download className="h-3 w-3" /> Template
                </a>
              </div>
            </div>

            {csvError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700 border border-red-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {csvError}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                The CSV must contain: <strong>Serial Number</strong>, <strong>Windows Product ID</strong>, <strong>Hardware Hash</strong>, optionally <strong>Group Tag</strong> and <strong>Assigned User</strong>.
                Hardware hash files can be exported from the device using <code className="bg-amber-100 px-1 rounded">Get-WindowsAutoPilotInfo.ps1</code>.
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-0 pb-1 border-b border-slate-200">
              <div className="col-span-2">Serial No.</div>
              <div className="col-span-2">Product ID</div>
              <div className="col-span-5">Hardware Hash <span className="text-red-500">*</span></div>
              <div className="col-span-2">Group Tag</div>
              <div className="col-span-1" />
            </div>

            {/* Rows */}
            <div className="max-h-64 overflow-y-auto">
              {rows.map((row, i) => (
                <SingleRow
                  key={row.rowIndex}
                  row={row}
                  onChange={(updated) => setRows(rows.map((r, idx) => idx === i ? updated : r))}
                  onRemove={() => rows.length > 1 && setRows(rows.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>

            {mode === "bulk" && (
              <Button variant="outline" size="sm" className="gap-1.5 w-fit" onClick={() => setRows([...rows, emptyRow()])}>
                <Plus className="h-3.5 w-3.5" /> Add Row
              </Button>
            )}

            {/* Count */}
            <p className="text-xs text-slate-500">
              <strong className="text-slate-700">{validCount}</strong> valid device{validCount !== 1 ? "s" : ""} ready to import.
            </p>
          </>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{results.length}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{successCount}</p>
                <p className="text-xs text-emerald-600">Imported</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{failCount}</p>
                <p className="text-xs text-red-600">Failed</p>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl p-3">
              {results.map((r, i) => <ResultRow key={i} r={r} />)}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button
              className="bg-blue-600 hover:bg-blue-700 gap-2"
              onClick={handleImport}
              disabled={importing || validCount === 0 || !azureTenantId}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {validCount > 0 ? `${validCount} Device${validCount > 1 ? "s" : ""}` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}