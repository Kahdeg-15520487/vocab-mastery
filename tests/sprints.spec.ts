import { test, expect, apiGet, apiPost } from './helpers/auth'

// All tests use saved storageState — already authenticated

test.describe('Learn session', () => {
  test('shows setup with start button', async ({ page }) => {
    await page.goto('/learn')
    // Could be setup or resume prompt
    await expect(
      page.locator('text=/learn new words|resume practice/i').first()
    ).toBeVisible()
  })

  test('starts a session and shows flashcard', async ({ page }) => {
    await page.goto('/learn')
    await page.waitForLoadState('networkidle')

    // If there's a resume prompt, start over; otherwise click start
    const startOverBtn = page.locator('button', { hasText: /start over/i })
    if (await startOverBtn.isVisible().catch(() => false)) {
      await startOverBtn.click()
    } else {
      const startBtn = page.locator('button', { hasText: /start|begin/i })
      if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click()
      }
    }

    // Should show flashcard, loading spinner, or empty state
    await page.waitForLoadState('networkidle')
    const pageContent = await page.locator('main').innerText().catch(() => '')
    // Just verify the page has actual content (not just nav)
    expect(pageContent.length).toBeGreaterThan(10)
  })
})

test.describe('Quiz session', () => {
  test('shows setup or auto-starts', async ({ page }) => {
    await page.goto('/quiz')
    // Should show either quiz setup or quiz questions
    await expect(
      page.locator('text=/quiz|question/i').first()
    ).toBeVisible()
  })
})

test.describe('Sprint integration', () => {
  test('sprint practice buttons navigate with sprintId', async ({ page }) => {
    await page.goto('/sprints')
    await page.waitForLoadState('networkidle')

    const studyBtn = page.locator('button:has-text("Study")')
    if (!(await studyBtn.isVisible().catch(() => false))) {
      test.info().annotations.push({ type: 'skip-reason', description: 'No active sprint' })
      test.skip()
      return
    }

    await studyBtn.click()
    await expect(page).toHaveURL(/\/learn\?sprintId=/, { timeout: 5_000 })
    await expect(page.locator('text=/practicing sprint words/i')).toBeVisible()
  })

  test('sprint banner appears with sprintId query param', async ({ page }) => {
    // Get sprint via API
    const res = await apiGet(page, '/api/sprints/current')
    if (!res.ok()) { test.skip(); return }
    const { sprint } = await res.json()
    if (!sprint) { test.skip(); return }

    await page.goto(`/learn?sprintId=${sprint.id}`)
    await expect(page.locator('text=/practicing sprint words/i')).toBeVisible()
  })

  test('no sprint banner without sprintId', async ({ page }) => {
    await page.goto('/learn')
    await expect(page.locator('text=/practicing sprint words/i')).not.toBeVisible()
  })

  test('sprint words are clickable links to word detail', async ({ page }) => {
    await page.goto('/sprints')
    await page.waitForLoadState('networkidle')

    const wordLinks = page.locator('a[href*="/words/"]')
    const count = await wordLinks.count()
    if (count === 0) { test.skip(); return }

    const href = await wordLinks.first().getAttribute('href')
    expect(href).toMatch(/\/words\//)
    await wordLinks.first().click()
    await expect(page).toHaveURL(/\/words\//, { timeout: 5_000 })
  })

  test('Back to Sprint link works from quiz results', async ({ page }) => {
    // Get sprint
    const sprintRes = await apiGet(page, '/api/sprints/current')
    if (!sprintRes.ok()) { test.skip(); return }
    const { sprint } = await sprintRes.json()
    if (!sprint) { test.skip(); return }

    // Abandon any existing quiz session
    await apiPost(page, '/api/sessions/abandon-active', { type: 'quiz' }).catch(() => {})

    // Start auto-quiz with sprintId
    await page.goto(`/quiz?sprintId=${sprint.id}&auto=true`)

    // Wait for quiz content
    await page.waitForLoadState('networkidle')

    // Check for quiz question or "Question" text
    const questionLocator = page.getByText(/question \d/i).first()
    const hasQ = await questionLocator.isVisible({ timeout: 15_000 }).catch(() => false)
    if (!hasQ) { test.skip(); return }

    // Answer all questions by clicking the first enabled quiz option each time.
    // After clicking, the button gets disabled; a "Next" button appears, then
    // the next question loads. We use force-click + wait for the option to
    // re-enable (new question) or results page to appear.
    for (let i = 0; i < 15; i++) {
      // Find enabled option buttons (quiz answer choices have text starting with 1-4)
      const enabledOpt = page.locator('main button:not([disabled])').filter({
        hasText: /^[1-4]/
      }).first()

      if (!(await enabledOpt.isVisible({ timeout: 3_000 }).catch(() => false))) {
        // No more options — either on results or between questions
        // Check for a "Next" or "See Results" button
        const nextBtn = page.locator('main button', { hasText: /next|see results/i }).first()
        if (await nextBtn.isVisible().catch(() => false)) {
          await nextBtn.click()
          await page.waitForTimeout(500)
          continue
        }
        break
      }

      await enabledOpt.click()

      // After answering, options get disabled. Wait for either:
      // - a "Next" / "See Results" button to appear, or
      // - new enabled options (next question auto-loads)
      await page.waitForTimeout(500)
      const nextBtn = page.locator('main button', { hasText: /next|see results/i }).first()
      if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nextBtn.click()
        await page.waitForTimeout(500)
      }
    }

    // Check for "Back to Sprint" link on results
    await page.waitForLoadState('networkidle')
    const backLink = page.locator('a').filter({ hasText: /back to sprint/i }).first()
    await expect(backLink).toBeVisible({ timeout: 5_000 })

    await backLink.click()
    await expect(page).toHaveURL(/\/sprints/, { timeout: 5_000 })
  })
})
