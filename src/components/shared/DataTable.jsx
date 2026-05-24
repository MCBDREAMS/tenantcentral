import React, { useState, useMemo, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";

function useIsMobile() {
  const [mobile, setMobile] = React.useState(() => window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

export default function DataTable({ columns, data, onExport, emptyMessage = "No data found" }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const isMobile = useIsMobile();
  const pageSize = 15;

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter(row =>
      columns.some(col => {
        const val = col.accessor ? row[col.accessor] : "";
        return String(val || "").toLowerCase().includes(s);
      })
    );
  }, [data, search, columns]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {onExport && (
          <Button variant="outline" size="sm" onClick={() => onExport(filtered)} className="gap-2">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        )}
      </div>

      {isMobile ? (
        /* Mobile: stacked card view */
        <div className="space-y-3">
          {paged.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400 border border-dashed rounded-xl">{emptyMessage}</div>
          ) : paged.map((row, i) => (
            <div key={row.id || i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
              {columns.map(col => (
                <div key={col.header} className="flex items-start justify-between gap-2 min-h-[44px]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 pt-0.5">{col.header}</span>
                  <span className="text-sm text-slate-700 text-right">
                    {col.render ? col.render(row) : row[col.accessor]}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* Desktop: standard table */
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                {columns.map(col => (
                  <TableHead key={col.header} className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-12 text-sm text-slate-400">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((row, i) => (
                  <TableRow key={row.id || i} className="hover:bg-slate-50/50 transition-colors">
                    {columns.map(col => (
                      <TableCell key={col.header} className="text-sm">
                        {col.render ? col.render(row) : row[col.accessor]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-slate-500">
          <span>{filtered.length} total records</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}