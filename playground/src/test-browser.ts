const cookies = new Map<string, string>()

export async function testBrowserFetch(baseUrl: string, sessionLabel: string, path: string, init: RequestInit = {}): Promise<Response> {
  const key = `${baseUrl}|${sessionLabel}`
  const headers = new Headers(init.headers)
  const cookie = cookies.get(key)
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookies.set(key, setCookie.split(';')[0])
  return response
}
