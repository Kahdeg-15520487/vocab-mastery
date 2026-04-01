import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'

function apiRequest(method: string, urlPath: string, body?: any, token?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : ''
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (body) headers['Content-Length'] = String(postData.length)

    const req = http.request({
      hostname: '127.0.0.1',
      port: 7101,
      path: urlPath,
      method,
      headers,
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, data: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode!, data }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(postData)
    req.end()
  })
}

async function globalSetup() {
  const authDir = path.join(__dirname, '.auth')
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  // ── Step 1: Login via API to get tokens ────────────────────────────
  const { data: loginData, status: loginStatus } = await apiRequest('POST', '/api/auth/login', {
    login: 'testuser',
    password: 'Testtest1!',
  })
  if (loginStatus !== 200) {
    throw new Error(`Login failed: ${loginStatus} ${JSON.stringify(loginData)}`)
  }
  const accessToken = loginData.accessToken
  if (!accessToken) throw new Error('No access token in login response')

  // Save token for tests
  fs.writeFileSync(path.join(authDir, 'token.txt'), accessToken)
  console.log('✓ Got access token via API')

  // ── Step 2: Create browser session with token injected ─────────────
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  // Inject access token into sessionStorage before any page loads
  await page.addInitScript((token) => {
    sessionStorage.setItem('accessToken', token)
  }, accessToken)

  // Navigate to home to establish cookies / session state
  await page.goto('http://localhost:7100/')
  await page.waitForLoadState('networkidle')

  // Save storageState (cookies, localStorage, sessionStorage)
  await context.storageState({ path: path.join(authDir, 'user.json') })
  console.log('✓ Saved browser storageState')

  // ── Step 3: Create a sprint for sprint tests ───────────────────────

  // Check existing sprint
  const { data: sprintData } = await apiRequest('GET', '/api/sprints/current', undefined, accessToken)

  if (!sprintData?.sprint) {
    const { data: createData } = await apiRequest('POST', '/api/sprints', {
      wordTarget: 15,
      durationDays: 7,
    }, accessToken)

    if (createData?.sprint?.id) {
      await apiRequest('POST', `/api/sprints/${createData.sprint.id}/start`, {}, accessToken)
      console.log('✓ Created and started test sprint')
    }
  } else {
    console.log('✓ Active sprint already exists')
  }

  console.log('✓ Global setup complete')
  await browser.close()
}

export default globalSetup
