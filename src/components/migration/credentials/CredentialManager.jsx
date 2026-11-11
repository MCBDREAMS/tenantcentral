import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2, Plus, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import CredentialFormDialog from "./CredentialFormDialog";
import CredentialRow from "./CredentialRow";
import { CREDENTIAL_ROLES, matchesRole } from "./credentialMeta";

export default function CredentialManager() {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const page = await base44.entities.TenantCredential.list({ sort: "-updated_date", limit: 200 });
      setCredentials(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (credential) => {
    setEditing(credential);
    setDialogOpen(true);
  };

  const remove = async (credential) => {
    if (!window.confirm(`Delete the saved credential "${credential.label}"?`)) return;
    await base44.entities.TenantCredential.delete(credential.id);
    toast({ title: "Credential deleted" });
    load();
  };

  const query = search.trim().toLowerCase();
  const visible = credentials.filter(
    (c) =>
      (role === "all" || matchesRole(c, role)) &&
      (!query ||
        [c.label, c.domain, c.username, c.azure_tenant_id, c.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query)))
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
            Saved credentials
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Label the accounts you use for source and destination tenants, then pick them in a project instead of retyping secrets.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add credential
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {[{ value: "all", label: "All" }, ...CREDENTIAL_ROLES].map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={role === option.value ? "default" : "outline"}
              onClick={() => setRole(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search credentials"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading credentials
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {credentials.length === 0
              ? "No saved credentials yet. Add the account you use to read the source and write to the destination."
              : "No credentials match this filter."}
          </p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {visible.map((credential) => (
              <CredentialRow
                key={credential.id}
                credential={credential}
                onEdit={openEdit}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </div>

      <CredentialFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        credential={editing}
        onSaved={load}
      />
    </section>
  );
}