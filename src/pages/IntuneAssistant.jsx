import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, Plus, Send, Loader2, MessageSquare, Trash2, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import MessageBubble from "@/components/agents/MessageBubble";

const AGENT_NAME = "intune_troubleshooter";

const SUGGESTIONS = [
  "Why are my Intune devices showing as non-compliant?",
  "Which devices haven't checked in for over 8 hours?",
  "Check for configuration profile assignment gaps",
  "Summarise compliance posture for this tenant",
];

export default function IntuneAssistant({ selectedTenant }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  const tenantHint = selectedTenant?.name ? `(tenant: ${selectedTenant.name})` : "(no tenant selected)";

  const loadConversations = useCallback(async () => {
    setLoadingConvos(true);
    try {
      const convos = await base44.agents.listConversations({ agent_name: AGENT_NAME });
      convos.sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0));
      if (convos.length > 0) {
        setConversation(convos[0]);
      } else {
        const created = await base44.agents.createConversation({
          agent_name: AGENT_NAME,
          metadata: { name: "Intune Assistant", description: "Intune troubleshooting chat" },
        });
        setConversation(created);
      }
    } catch (e) {
      setError("Could not load conversations: " + e.message);
    } finally {
      setLoadingConvos(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load full history when conversation changes
  useEffect(() => {
    if (!conversation?.id) { setMessages([]); return; }
    let active = true;
    (async () => {
      try {
        const full = await base44.agents.getConversation(conversation.id);
        if (active) setMessages(full.messages || []);
      } catch (e) {
        if (active) setMessages([]);
      }
    })();
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return () => { active = false; unsubscribe(); };
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const newConversation = async () => {
    const created = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: { name: "Intune Assistant", description: "Intune troubleshooting chat" },
    });
    setConversation(created);
    setMessages([]);
  };

  const send = async (text) => {
    const content = text.trim();
    if (!content || sending || !conversation) return;
    const prompt = `${content}\n\n(Context: ${tenantHint})`;
    setInput("");
    setSending(true);
    try {
      await base44.agents.addMessage(conversation, { role: "user", content: prompt });
    } catch (e) {
      setError("Failed to send: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  const isStreaming = sending || (lastAssistant && !error && lastAssistant.content?.endsWith?.("\n") === false && (lastAssistant.tool_calls?.some(t => ["pending","running","in_progress"].includes(t.status)) || true));
  const showTyping = sending && !messages.some(m => m.role === "assistant" && (m.content || m.tool_calls?.length));

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="p-4 pb-0 max-w-5xl w-full mx-auto">
        <PageHeader
          title="Intune AI Assistant"
          subtitle="Diagnose compliance, device sync, and profile issues with the Intune troubleshooter agent"
          icon={Bot}
          actions={
            <Button variant="outline" onClick={newConversation} className="gap-2">
              <Plus className="h-4 w-4" /> New chat
            </Button>
          }
        />
      </div>

      <div className="flex-1 overflow-auto max-w-5xl w-full mx-auto px-4 pb-32">
        <div className="flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 mx-auto flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <p className="font-semibold text-slate-700 mb-1">Ask me anything about your Intune environment</p>
              <p className="text-sm text-slate-400 mb-5">I can read your devices, profiles, and tenant config to diagnose issues.</p>
              <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-slate-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.filter(m => m.role === "user" || m.role === "assistant").map((m, idx) => {
            const isLastAssistant = m === lastAssistant;
            return <MessageBubble key={idx} message={m} isStreaming={isLastAssistant && isStreaming} />;
          })}

          {showTyping && (
            <div className="flex gap-2.5">
              <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="fixed bottom-0 left-0 right-0 md:ml-64 bg-white/90 backdrop-blur border-t border-slate-200 z-20">
        <div className="max-w-5xl mx-auto p-3">
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the Intune issue you're seeing..."
              disabled={sending || !conversation}
              className="flex-1"
            />
            <Button type="submit" disabled={sending || !input.trim() || !conversation} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}