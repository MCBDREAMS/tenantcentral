import React from "react";
import ReactMarkdown from "react-markdown";

// react-markdown (without remark-gfm) does not parse GFM pipe tables, so any
// "| col | col |" inventory block renders as plain text with literal pipes.
// This renderer pre-segments the markdown: GFM table blocks are parsed and
// rendered as real HTML <table>s; everything else goes through ReactMarkdown.

const isTableLine = (line) => {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length >= 3;
};
const isSeparatorLine = (line) => {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|")) return false;
  const cells = t.slice(1, -1).split("|");
  return cells.length > 0 && cells.every((c) => /^[\s]*:?-+:?[\s]*$/.test(c));
};
const splitRow = (line) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function segmentMarkdown(md) {
  const lines = (md || "").split("\n");
  const blocks = [];
  let buffer = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableLine(lines[i]) && i + 1 < lines.length && isSeparatorLine(lines[i + 1])) {
      if (buffer.length) {
        blocks.push({ type: "md", text: buffer.join("\n") });
        buffer = [];
      }
      const tableLines = [lines[i]];
      let j = i + 1;
      while (j < lines.length && isTableLine(lines[j])) {
        tableLines.push(lines[j]);
        j++;
      }
      const header = splitRow(tableLines[0]);
      const rows = tableLines.slice(2).map(splitRow);
      blocks.push({ type: "table", header, rows });
      i = j;
    } else {
      buffer.push(lines[i]);
      i++;
    }
  }
  if (buffer.length) blocks.push({ type: "md", text: buffer.join("\n") });
  return blocks;
}

const mdComponents = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mt-10 mb-5 border-b border-slate-200 pb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold text-slate-800 mt-10 mb-4">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-slate-700 mt-6 mb-3">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-6 my-4 space-y-3 text-slate-600 leading-relaxed">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 my-4 space-y-3 text-slate-600 leading-relaxed">{children}</ol>,
  li: ({ children }) => <li className="text-slate-600 leading-relaxed">{children}</li>,
  p: ({ children }) => <p className="text-slate-600 my-3 leading-relaxed">{children}</p>,
  code: ({ children }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
  table: ({ children }) => <div className="overflow-x-auto my-6"><table className="w-full border border-slate-300 rounded-lg text-xs border-collapse">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2.5 text-left font-semibold text-slate-700 border border-slate-300">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2.5 text-slate-600 border border-slate-200">{children}</td>,
};

function SopTable({ header, rows }) {
  return (
    <div className="overflow-x-auto my-6">
      <table className="w-full border border-slate-300 rounded-lg text-xs border-collapse">
        <thead className="bg-slate-100">
          <tr>
            {header.map((h, ci) => (
              <th key={ci} className="px-3 py-2.5 text-left font-semibold text-slate-700 border border-slate-300 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? "bg-slate-50/50" : ""}>
              {header.map((_, ci) => (
                <td key={ci} className="px-3 py-2.5 text-slate-600 border border-slate-200 align-top break-words">{row[ci] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SopRenderer({ content }) {
  const blocks = segmentMarkdown(content);
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "table" ? (
          <SopTable key={i} header={b.header} rows={b.rows} />
        ) : (
          <ReactMarkdown key={i} components={mdComponents}>{b.text}</ReactMarkdown>
        )
      )}
    </>
  );
}