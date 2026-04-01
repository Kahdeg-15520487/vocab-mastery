import { test as base, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Read the saved access token from global setup.
 */
export function getAccessToken(): string {
  const tokenPath = path.join(__dirname, '..', '.auth', 'token.txt')
  return fs.readFileSync(tokenPath, 'utf-8').trim()
}

/**
 * Extended test that injects sessionStorage token before each page load.
 * The app uses sessionStorage for the access token, which Playwright can't
 * restore via storageState.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const token = getAccessToken()

    // Inject accessToken into sessionStorage before any page loads
    await page.addInitScript((token) => {
      sessionStorage.setItem('accessToken', token)
    }, token)

    await use(page)
  },
})

export { expect }

/**
 * Make an authenticated API request. Use this instead of page.request
 * because page.request doesn't send the sessionStorage token.
 */
export async function apiGet(page: import('@playwright/test').Page, path: string) {
  const token = getAccessToken()
  return page.request.get(`http://localhost:7100${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
}

export async function apiPost(page: import('@playwright/test').Page, path: string, body?: any) {
  const token = getAccessToken()
  return page.request.post(`http://localhost:7100${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: body ? JSON.stringify(body) : undefined,
  })
}
