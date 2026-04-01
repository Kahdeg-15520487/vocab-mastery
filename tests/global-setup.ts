import { chromium, type FullConfig } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Log in via UI
  await page.goto('http://localhost:7100/login')
  await page.locator('input').first().fill('testuser')
  await page.locator('input[type="password"]').fill('Testtest1!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15_000 })

  // Extract the access token from sessionStorage
  const accessToken = await page.evaluate(() => sessionStorage.getItem('accessToken'))
  if (!accessToken) throw new Error('No access token found after login')

  // Save cookies (refresh token)
  const statePath = path.join(__dirname, '.auth', 'user.json')
  const authDir = path.join(__dirname, '.auth')
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })
  await page.context().storageState({ path: statePath })

  // Save the raw token for tests that need API calls
  fs.writeFileSync(path.join(authDir, 'token.txt'), accessToken)

  // Create a sprint for the test user via API (so sprint tests have data)
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  }

  // Check if there's already an active sprint
  const sprintRes = await page.evaluate(async (token) => {
    const res = await fetch('/api/sprints/current', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    return res.json()
  }, accessToken)

  if (!sprintRes?.sprint) {
    // Create a sprint with 15 words
    const createRes = await page.evaluate(async (token) => {
      const res = await fetch('/api/sprints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          wordTarget: 15,
          durationDays: 7,
        })
      })
      return res.json()
    }, accessToken)

    if (createRes?.sprint?.id) {
      // Start the sprint
      await page.evaluate(async ({ token, sprintId }) => {
        await fetch(`/api/sprints/${sprintId}/start`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      }, { token: accessToken, sprintId: createRes.sprint.id })
      console.log('✓ Created and started test sprint')
    }
  } else {
    console.log('✓ Active sprint already exists')
  }

  console.log('✓ Auth state saved for testuser')
  await browser.close()
}

export default globalSetup
