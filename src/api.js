export async function apiRequest(path, options = {}) {
  const { body, headers, ...requestOptions } = options;
  const response = await fetch(`/api${path}`, {
    ...requestOptions,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}