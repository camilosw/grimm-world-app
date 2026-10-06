/// <reference types="node" />
// Access gate: Vercel Routing Middleware, run before every request on the deployment (not in `npm run dev`).
// The code is the ACCESS_CODE environment variable of the Vercel project, never in the repository. Entering it
// sets a cookie holding a hash of the code for a year, so changing ACCESS_CODE locks every device out again.
import { next } from '@vercel/functions'

const COOKIE = 'gw-access'
const LOGIN = '/__access'
const YEAR = 365 * 24 * 60 * 60

// The manifest and icons are fetched without cookies (installing to the home screen) and give nothing away.
const open = (path: string) => path === '/manifest.webmanifest' || path.startsWith('/icons/')

const normalize = (code: string) => code.trim().toUpperCase()

async function token(code: string): Promise<string> {
  const data = new TextEncoder().encode(`grimm-world:${normalize(code)}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
}

// Only same-site paths, so the form can't redirect elsewhere.
const safePath = (path: unknown) =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && path !== LOGIN ? path : '/'

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function page(to: string, error: boolean): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Grimm World</title>
<link rel="icon" type="image/png" href="/icons/icon-192.png" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<style>
  :root { --bg: #1b1512; --panel: #2a211c; --panel-2: #3a2e27; --text: #f1e7d6; --muted: #b3a48d; --accent: #c9302c; --gold: #e0b252; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg);
    color: var(--text); font-family: system-ui, -apple-system, sans-serif; }
  form { width: min(100%, 360px); display: grid; gap: 16px; padding: 28px 24px; background: var(--panel);
    border-radius: 10px; text-align: center; }
  img { width: 96px; height: 96px; margin: 0 auto; border-radius: 16px; }
  h1 { margin: 0; color: var(--gold); font-size: 1.6rem; font-weight: 600; }
  p { margin: 0; color: var(--muted); }
  input { width: 100%; min-height: 52px; padding: 0 12px; border: 2px solid var(--panel-2); border-radius: 10px;
    background: var(--bg); color: var(--text); font: 600 1.6rem/1 ui-monospace, monospace; letter-spacing: 0.35em;
    text-align: center; text-transform: uppercase; }
  input:focus { outline: none; border-color: var(--gold); }
  button { min-height: 48px; border: 0; border-radius: 10px; background: var(--accent); color: var(--text);
    font: 600 1.1rem system-ui, sans-serif; cursor: pointer; }
  .error { color: #ff8a70; }
  .buy { padding-top: 16px; border-top: 1px solid var(--panel-2); font-size: 0.9rem; line-height: 1.45; }
  a { color: var(--gold); }
</style>
</head>
<body>
<form method="post" action="${LOGIN}">
  <img src="/icons/icon-192.png" alt="" />
  <h1>Grimm World</h1>
  <p class="${error ? 'error' : ''}">${error ? 'Wrong code, try again.' : 'Enter the access code.'}</p>
  <input name="code" required minlength="6" maxlength="6" pattern="[A-Za-z0-9]{6}" autocomplete="off"
    autocapitalize="characters" autocorrect="off" spellcheck="false" autofocus aria-label="Access code" />
  <input type="hidden" name="next" value="${escape(to)}" />
  <button type="submit">Enter</button>
  <p class="buy">You need your own copy of the game to play it:
    <a href="https://raoulschaupp.itch.io/grimm-world" target="_blank" rel="noopener noreferrer">buy it on itch.io ↗</a>.
    The access code is on its download page.</p>
</form>
</body>
</html>`
  return new Response(html, {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (open(url.pathname)) return next()

  const code = process.env.ACCESS_CODE
  if (!code?.trim()) {
    return new Response('ACCESS_CODE is not set in the Vercel project.', { status: 503 })
  }
  const expected = await token(code)

  if (url.pathname === LOGIN && request.method === 'POST') {
    const form = await request.formData()
    const to = safePath(form.get('next'))
    const given = form.get('code')
    if (typeof given !== 'string' || (await token(given)) !== expected) return page(to, true)
    return new Response(null, {
      status: 303,
      headers: {
        location: new URL(to, url).toString(),
        'set-cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`,
        'cache-control': 'no-store',
      },
    })
  }

  if (cookie(request, COOKIE) === expected) return next()

  const wantsPage = request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')
  if (wantsPage) return page(safePath(url.pathname + url.search), false)
  return new Response('Access code required.', { status: 401, headers: { 'cache-control': 'no-store' } })
}
