import React, { useState } from "react";
import { CornerDownLeft, Loader2 } from "lucide-react";

/** The prompt row: history navigation, Enter to run. */
export default function PsPromptBar({ prompt, value, setValue, onSubmit, history, busy }) {
  const [histIndex, setHistIndex] = useState(-1);

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (busy) return;
      onSubmit(value);
      setHistIndex(-1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const next = histIndex < 0 ? history.length - 1 : Math.max(0, histIndex - 1);
      setHistIndex(next);
      setValue(history[next]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIndex < 0) return;
      const next = histIndex + 1;
      if (next >= history.length) {
        setHistIndex(-1);
        setValue("");
      } else {
        setHistIndex(next);
        setValue(history[next]);
      }
    }
  };

  return (
    <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-950 px-3 py-2.5">
      <span className="font-mono text-[12.5px] text-emerald-400 shrink-0 select-none">{prompt}</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        placeholder="Type a cmdlet — e.g. Get-MgUser -UserPrincipalName alex@contoso.com"
        className="flex-1 bg-transparent font-mono text-[12.5px] text-white placeholder-slate-600 outline-none disabled:opacity-60"
      />
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
      ) : (
        <CornerDownLeft className="h-3.5 w-3.5 text-slate-600" />
      )}
    </div>
  );
}