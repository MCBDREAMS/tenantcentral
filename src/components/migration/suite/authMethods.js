export const AUTH_METHODS = [
  {
    value: "interactive",
    label: "Interactive sign-in (device code)",
    hint: "The operator signs in with MFA in a browser when the script runs. Nothing is stored.",
    fields: [],
  },
  {
    value: "credential",
    label: "Username and password",
    hint: "Stored credential for unattended runs. Use a dedicated migration account with MFA excluded.",
    fields: ["username", "password"],
  },
  {
    value: "app_registration",
    label: "App registration (client ID + secret)",
    hint: "App-only access using the Graph and PnP permissions granted and consented on that tenant.",
    fields: ["client_id", "client_secret"],
  },
  {
    value: "windows_integrated",
    label: "Current Windows session",
    hint: "Runs as the logged-on account of the agent host. On-premises sources only.",
    fields: [],
  },
];

export const authMethod = (value) =>
  AUTH_METHODS.find((m) => m.value === value) || AUTH_METHODS[0];

export const emptyAuth = (method = "interactive") => ({
  method,
  username: "",
  password: "",
  client_id: "",
  client_secret: "",
});

export const parseAuth = (raw, fallback = "interactive") => {
  if (!raw) return emptyAuth(fallback);
  try {
    const parsed = JSON.parse(raw);
    return { ...emptyAuth(fallback), ...parsed, method: parsed.method || fallback };
  } catch {
    return emptyAuth(fallback);
  }
};