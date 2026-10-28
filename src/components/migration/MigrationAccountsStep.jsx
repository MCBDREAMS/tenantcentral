import React, { useState } from "react";
import { Users, MessageSquare, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import MigrationAccountSelector from "./MigrationAccountSelector";
import MigrationChatSelector from "./MigrationChatSelector";

// Step host: users/mailboxes and Teams chats are each selected per item, with a
// select-all shortcut, on their own tab.
export default function MigrationAccountsStep({
  sourceTenant, domains, workloads, userConfig, setUserConfig,
  userMapping, chatConfig, setChatConfig,
}) {
  const hasAccounts = workloads.includes("mailboxes") || workloads.includes("groups");
  const hasChats = workloads.includes("chats");
  const [tab, setTab] = useState(hasAccounts ? "accounts" : "chats");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {hasAccounts && (
          <Button variant={tab === "accounts" ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("accounts")}>
            <Users className="h-4 w-4" />Accounts &amp; mailboxes
          </Button>
        )}
        {hasChats && (
          <Button variant={tab === "chats" ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("chats")}>
            <MessageSquare className="h-4 w-4" />Teams chats
          </Button>
        )}
      </div>

      {!hasAccounts && !hasChats && (
        <div className="flex items-start gap-2 bg-muted/40 border rounded-lg p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          No account or chat workload is in scope. Go back and enable Exchange Mailboxes, Users &amp; Groups or Teams Chats.
        </div>
      )}

      {tab === "accounts" && hasAccounts && (
        <MigrationAccountSelector
          sourceTenant={sourceTenant}
          domains={domains}
          userConfig={userConfig}
          setUserConfig={setUserConfig}
        />
      )}

      {tab === "chats" && hasChats && (
        <MigrationChatSelector
          sourceTenant={sourceTenant}
          userMapping={userMapping}
          chatConfig={chatConfig}
          setChatConfig={setChatConfig}
        />
      )}
    </div>
  );
}