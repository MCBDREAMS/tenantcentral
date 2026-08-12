import React from "react";
import ReactDOMServer from "react-dom/server";
import ReactMarkdown from "react-markdown";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const stamp = () => new Date().toISOString().split("T")[0];
const safeName = (name) => (name || "tenant").replace(/\s+/g, "_").replace(/[^\w.-]/g, "");

// Render markdown -> styled HTML fragment using inline styles (Tailwind-free)
// so it renders correctly in a standalone .html/.doc file and in html2canvas.
function markdownToFragment(markdown) {
  return ReactDOMServer.renderToStaticMarkup(
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #e2e8f0", paddingBottom: 6, marginBottom: 10, marginTop: 18 }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginTop: 16, marginBottom: 8 }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, color: "#334155", marginTop: 12, marginBottom: 6 }}>{children}</h3>,
        h4: ({ children }) => <h4 style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginTop: 10, marginBottom: 4 }}>{children}</h4>,
        p: ({ children }) => <p style={{ fontSize: 11, lineHeight: 1.6, color: "#334155", margin: "6px 0" }}>{children}</p>,
        li: ({ children }) => <li style={{ fontSize: 11, lineHeight: 1.6, color: "#334155", margin: "2px 0" }}>{children}</li>,
        ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: "6px 0" }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: "6px 0" }}>{children}</ol>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: "#0f172a" }}>{children}</strong>,
        code: ({ children }) => <code style={{ fontFamily: "Consolas, monospace", fontSize: 10, background: "#f1f5f9", color: "#0f172a", padding: "1px 5px", borderRadius: 3 }}>{children}</code>,
        pre: ({ children }) => <pre style={{ fontFamily: "Consolas, monospace", fontSize: 10, background: "#f8fafc", border: "1px solid #e2e8f0", padding: 10, borderRadius: 6, overflow: "auto", margin: "8px 0" }}>{children}</pre>,
        table: ({ children }) => <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, margin: "10px 0", border: "1px solid #cbd5e1" }}>{children}</table>,
        thead: ({ children }) => <thead style={{ background: "#f1f5f9" }}>{children}</thead>,
        th: ({ children }) => <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#334155", borderBottom: "2px solid #cbd5e1" }}>{children}</th>,
        td: ({ children }) => <td style={{ padding: "5px 8px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{children}</td>,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: "3px solid #3b82f6", paddingLeft: 12, color: "#475569", margin: "8px 0", fontStyle: "italic" }}>{children}</blockquote>,
        hr: () => <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "14px 0" }} />,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function buildHtmlDocument(markdown, tenantName) {
  const fragment = markdownToFragment(markdown);
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<title>SOP - " + tenantName + "</title>",
    "<style>",
    "  @page { size: A4; margin: 18mm; }",
    "  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #1e293b; max-width: 760px; margin: 0 auto; padding: 8px; }",
    "  .doc-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2563eb; padding-bottom: 10px; margin-bottom: 18px; }",
    "  .doc-title { font-size: 20px; font-weight: 700; color: #0f172a; }",
    "  .doc-sub { font-size: 11px; color: #64748b; margin-top: 2px; }",
    "  .doc-meta { text-align: right; font-size: 10px; color: #64748b; }",
    "  h1, h2, h3, h4 { page-break-after: avoid; }",
    "  table, pre, blockquote { page-break-inside: avoid; }",
    "</style>",
    "</head>",
    "<body>",
    '  <div class="doc-header">',
    "    <div>",
    '      <div class="doc-title">Service Operations Procedure</div>',
    '      <div class="doc-sub">' + tenantName + "</div>",
    "    </div>",
    '    <div class="doc-meta">Generated: ' + stamp() + "<br/>Confidential</div>",
    "  </div>",
    "  " + fragment,
    "</body>",
    "</html>",
  ].join("\n");
}

function triggerBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function makeFilename(prefix, name, ext) {
  return prefix + "_" + name + "_" + stamp() + "." + ext;
}

export const EXPORT_FORMATS = [
  { value: "pdf", label: "PDF (.pdf)" },
  { value: "word", label: "Word (.doc)" },
  { value: "html", label: "HTML (.html)" },
  { value: "md", label: "Markdown (.md)" },
];

export async function exportSop(markdown, tenantName, format) {
  const name = safeName(tenantName);
  if (format === "md") {
    triggerBlob(markdown, makeFilename("SOP", name, "md"), "text/markdown;charset=utf-8;");
    return;
  }
  const html = buildHtmlDocument(markdown, tenantName);
  if (format === "html") {
    triggerBlob(html, makeFilename("SOP", name, "html"), "text/html;charset=utf-8;");
    return;
  }
  if (format === "word") {
    triggerBlob(html, makeFilename("SOP", name, "doc"), "application/msword;charset=utf-8;");
    return;
  }
  if (format === "pdf") {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.width = "794px";
    container.style.background = "#ffffff";
    container.style.padding = "16px";
    container.innerHTML = html;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/png");

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= pageHeight;
      }
      pdf.save(makeFilename("SOP", name, "pdf"));
    } finally {
      container.remove();
    }
    return;
  }
  throw new Error("Unknown export format: " + format);
}