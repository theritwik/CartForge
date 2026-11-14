/** Absolute URL of an API endpoint, for server-to-server requests from the web app. */
export function apiUrl(path: string): URL {
  const baseUrl = process.env.API_URL;
  if (!baseUrl) {
    throw new Error('API_URL is not set.');
  }
  return new URL(`/api/v1${path}`, baseUrl);
}
