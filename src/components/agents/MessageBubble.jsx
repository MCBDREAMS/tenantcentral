import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ChevronDown, Loader2, CheckCircle2, XCircle, Wrench, User, Bot,
} from "lucide-react";

const STATUS_META = {
  pending: { icon: Loader2, cls: "text-slate-400 animate-spin", text: "Preparing..." },
  running: { icon: Loader2, cls: "text-blue-500 animate-spin", text: "Running..." },
  in_progress: { icon: Loader2, cls: "text-blue-500 animate-spin", text: "In progress..." },
  completed: { icon: CheckCircle2, cls: "text-emerald-500", text: "Done" },
  success: { icon: CheckCircle2, cls: "text-emerald-500", text: "Success" },
  failed: { icon: XCircle, cls: "text-red-500", text: "Failed" },
  error: { icon: XCircle, cls: "text-red-500", text: "Error" },
};

function isFailed(toolCall) {
  const status = toolCall.status;
  if (status === "failed" || status === "error") return true;
  const r = toolCall.results;
  if (typeof r === "string" && /error|failed/i.test(r)) return true;
  try {
    if (r && typeof r === "object" && r.success === false) return true;
  } catch {}
  return false;
}

function FunctionDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const failed = isFailed(toolCall);
  const meta = STATUS_META[toolCall.status] || STATUS_META.pending;
  const display = toolCall.display_projection || {};
  const hide = display.hide_details && display.details_redacted;

  let args = toolCall.arguments_string;
  try {
    if (args && typeof args === "string") args = JSON.stringify(JSON.parse(args), null, 2);
  } catch {}
  let results = toolCall.results;
  try {
    if (results && typeof results === "string") results = JSON.stringify(JSON.parse(results), null, 2);
  } catch {}

  const labelText = failed
    ? (display.error_label || meta.text)
    : (toolCall.status === "pending" || toolCall.status === "running" || toolCall.status === "in_progress"
      ? (display.active_label || meta.text)
      : (display.label || meta.text));

  const Icon = failed ? XCircle : meta.icon;

  return (
    <div className="mt-2 text-xs border border-slate-200 rounded-lg bg-slate-50/70 overflow-hidden">
      <button
        onClick={() => !hide && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-left ${hide ? "cursor-default" : "hover:bg-slate-100"}`}
      >
        <Icon className={`h-3.5 w-3.5 ${failed ? "text-red-500" : meta.cls}`} />
        <Wrench className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-slate-600 truncate flex-1">{display.label || toolCall.name || "tool"}</span>
        <span className="text-slate-400">{labelText}</span>
        {!hide && (
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && !hide && (
        <div className="px-3 py-2 border-t border-slate-200 space-y-2">
          {args && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Parameters</p>
              <pre className="text-[10px] bg-white border border-slate-200 rounded p-2 overflow-auto max-h-40">{args}</pre>
            </div>
          )}
          {results && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Result</p>
              <pre className="text-[10px] bg-white border border-slate-200 rounded p-2 overflow-auto max-h-40">{results}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message, isStreaming }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"} ${isStreaming ? "opacity-90" : ""}`}>
      <div className={`h-7 w-7 rounded-full shrink-0 flex items-center justify-center ${isUser ? "bg-blue-600" : "bg-slate-800"}`}>
        {isUser ? <User className="h-3.5 w-3.5 text-white" /> : <Bot className="h-3.5 w-3.5 text-white" />}
      </div>
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {message.content && (
          isUser ? (
            <div className="bg-blue-600 text-white rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm shadow-sm">
              <div className="prose prose-sm prose-slate max-w-none [&_p]:my-1.5 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:text-xs [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_a]:text-blue-600">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          )
        )}
        {message.tool_calls?.map((tc, idx) => <FunctionDisplay key={idx} toolCall={tc} />)}
        {isStreaming && !message.content && !message.tool_calls?.length && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs px-2">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking...
          </div>
        )}
      </div>
    </div>
  );
}