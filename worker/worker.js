export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') ?? '*'
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }
    const url = new URL(req.url)
    const key = url.pathname.slice(1)
    if (!key) return new Response('not found', { status: 404, headers })
    if (req.method === 'PUT') {
      const body = await req.text()
      await env.ROOMS.put(key, body, { expirationTtl: 21600 })
      return new Response('ok', { headers })
    }
    if (req.method === 'GET') {
      const value = await env.ROOMS.get(key)
      if (!value) return new Response('waiting', { status: 404, headers })
      return new Response(value, { headers })
    }
    return new Response('method not allowed', { status: 405, headers })
  }
}