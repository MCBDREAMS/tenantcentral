import { AUTH_METHODS } from "@/components/migration/suite/authMethods";

export const CREDENTIAL_ROLES = [
  { value: "source", label: "Source" },
  { value: "destination", label: "Destination" },
  { value: "both", label: "Source & destination" },
];

export const roleLabel = (value) =>
  CREDENTIAL_ROLES.find((r) => r.value === value)?.label || "Source & destination";

export const methodLabel = (value) =>
  AUTH_METHODS.find((m) => m.value === value)?.label || "App registration (client ID + secret)";

export const emptyCredential = () => ({
  label: "",
  role: "both",
  auth_method: "app_registration",
  azure_tenant_id: "",
  domain: "",
  client_id: "",
  client_secret: "",
  username: "",
  password: "",
  notes: "",
});

export const authFromCredential = (credential) => ({
  method: credential.auth_method || "app_registration",
  username: credential.username || "",
  password: credential.password || "",
  client_id: credential.client_id || "",
  client_secret: credential.client_secret || "",
});

export const matchesRole = (credential, role) =>
  !role || credential.role === "both" || credential.role === role;