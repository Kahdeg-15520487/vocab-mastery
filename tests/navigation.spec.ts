import { test, expect } from './helpers/auth'

// All tests in this file use the saved storageState from global-setup
// (already authenticated — no login needed)

test.describe('Page navigation', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav').first()).toBeVisible()
  })

  test('Learn page', async ({ page }) => {
    await page.goto('/learn')
    // Could show setup screen OR resume prompt if session is active
    await expect(
      page.locator('text=/learn new words|resume practice/i').first()
    ).toBeVisible()
  })

  test('Review page', async ({ page }) => {
    await page.goto('/review')
    await expect(page.locator('text=/review/i').first()).toBeVisible()
  })

  test('Quiz page', async ({ page }) => {
    await page.goto('/quiz')
    await expect(page.locator('text=/quiz/i').first()).toBeVisible()
  })

  test('Spelling page', async ({ page }) => {
    await page.goto('/spelling')
    await expect(
      page.locator('text=/spelling|resume/i').first()
    ).toBeVisible()
  })

  test('Fill Blank page', async ({ page }) => {
    await page.goto('/fill-blank')
    await expect(
      page.locator('text=/fill.*blank|resume/i').first()
    ).toBeVisible()
  })

  test('Sprints page', async ({ page }) => {
    await page.goto('/sprints')
    await expect(page.locator('text=/sprint/i').first()).toBeVisible()
  })

  test('Settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('text=/settings/i').first()).toBeVisible()
  })

  test('Stats page', async ({ page }) => {
    await page.goto('/stats')
    await expect(page.locator('text=/stat/i').first()).toBeVisible()
  })

  test('Browse page', async ({ page }) => {
    await page.goto('/browse')
    await expect(page.locator('text=/browse|word/i').first()).toBeVisible()
  })

  test('Lists page', async ({ page }) => {
    await page.goto('/lists')
    await expect(page.locator('text=/list/i').first()).toBeVisible()
  })

  test('Writing page', async ({ page }) => {
    await page.goto('/writing')
    await expect(page.locator('text=/writing|sprint/i').first()).toBeVisible()
  })

  test('404 for unknown route', async ({ page }) => {
    await page.goto('/this-does-not-exist-at-all')
    await expect(page.locator('text=/not found|404|doesn.*exist/i').first()).toBeVisible({ timeout: 5_000 })
  })
})
