import { test, expect } from '@playwright/test'

test.describe('Unauthenticated access', () => {
  test('redirects to login for protected routes', async ({ page }) => {
    await page.goto('/sprints')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In')
  })

  test('login rejects invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input').first().fill('nonexistent_user_xyz')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()
    // Should show error and stay on login
    await expect(page.locator('[class*="text-red"]').first()).toBeVisible({ timeout: 5_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})
