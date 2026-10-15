// A migration batch's selection, mappings and per-item progress log are far larger than an
// entity text field allows (~32 KB), so the bulky JSON is written to the app's private file
// storage and referenced from the record by uri instead of being stored inline.

// Write a JSON value to private storage. Returns the file uri to save on the record.
export async function putJson(base44, data, name) {
  const file = new File([JSON.stringify(data)], `${name}.json`, { type: 'application/json' });
  const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
  if (!file_uri) throw new Error(`Could not store the ${name} data.`);
  return file_uri;
}

// Read a JSON value previously written by putJson.
export async function getJson(base44, fileUri, name) {
  const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 600 });
  if (!signed_url) throw new Error(`Could not read the ${name} data.`);
  const res = await fetch(signed_url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Could not read the ${name} data (${res.status}).`);
  return await res.json();
}