import { test as base, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'

const AUTH_DIR = path.join(__dirname, '..', '.auth')
const TOKEN_PATH = path.join(AUTH_DIR, 'token.txt')

/**
 * Login via API and return a fresh access token.
 */
function loginViaAPI(): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ login: 'testuser', password: 'Testtest1!' })
    const req = http.request({
      hostname: '127.0.0.1',
      port: 7101,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(body.length),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.accessToken) {
            resolve(parsed.accessToken)
          } else {
            reject(new Error('No accessToken in login response: ' + data))
          }
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * Read the saved access token. If older than 10 minutes, refresh it.
 */
let lastRefresh = 0
let cachedToken = ''

export async function getAccessToken(): Promise<string> {
  const now = Date.now()
  // Refresh token every 10 minutes (token expires in 15 min)
  if (!cachedToken || now - lastRefresh > 10 * 60 * 1000) {
    try {
      cachedToken = await loginViaAPI()
      lastRefresh = now
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })
      fs.writeFileSync(TOKEN_PATH, cachedToken)
    } catch (e) {
      // Fallback to saved token if API login fails
      if (fs.existsSync(TOKEN_PATH)) {
        cachedToken = fs.readFileSync(TOKEN_PATH, 'utf-8').trim()
      } else {
        throw e
      }
    }
  }
  return cachedToken
}

/**
 * Synchronous token read for cases where we need the token immediately
 * (already refreshed by a previous getAccessToken() call).
 */
export function getTokenSync(): string {
  if (!cachedToken && fs.existsSync(TOKEN_PATH)) {
    cachedToken = fs.readFileSync(TOKEN_PATH, 'utf-8').trim()
  }
  return cachedToken
}

/**
 * Extended test that injects a fresh sessionStorage token before each page load.
 * Auto-refreshes the token if it's older than 10 minutes.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const token = await getAccessToken()

    // Inject accessToken into sessionStorage before any page loads
    await page.addInitScript((token) => {
      sessionStorage.setItem('accessToken', token)
    }, token)

    await use(page)
  },
})

export { expect }

/**
 * Make an authenticated API request.
 */
export async function apiGet(page: import('@playwright/test').Page, urlPath: string) {
  const token = await getAccessToken()
  return page.request.get(`http://localhost:7100${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
}

export async function apiPost(page: import('@playwright/test').Page, urlPath: string, body?: any) {
  const token = await getAccessToken()
  return page.request.post(`http://localhost:7100${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiPut(page: import('@playwright/test').Page, urlPath: string, body?: any) {
  const token = await getAccessToken()
  return page.request.put(`http://localhost:7100${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiDelete(page: import('@playwright/test').Page, urlPath: string) {
  const token = await getAccessToken()
  return page.request.delete(`http://localhost:7100${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
}
