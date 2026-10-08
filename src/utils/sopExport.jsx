import { exportMarkdown, stamp } from "@/utils/markdownExport";

export const EXPORT_FORMATS = [
  { value: "pdf", label: "PDF (.pdf)" },
  { value: "word", label: "Word (.doc)" },
  { value: "html", label: "HTML (.html)" },
  { value: "md", label: "Markdown (.md)" },
];

export async function exportSop(markdown, tenantName, format) {
  await exportMarkdown(markdown, {
    format,
    title: "Service Operations Procedure",
    subtitle: tenantName,
    prefix: "SOP",
    metaRight: "Generated: " + stamp() + "<br/>Confidential",
  });
}