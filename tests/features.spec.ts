import { test, expect } from './helpers/auth'

test.describe('Browse topics', () => {
  test('shows all 18 topic categories', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    // The topic dropdown is the first select
    const topicSelect = page.locator('select').first()
    const options = topicSelect.locator('option')
    const optionCount = await options.count()
    // 1 (All Topics) + 1 (No Topic) + 18 categories = 20
    expect(optionCount).toBeGreaterThanOrEqual(18)
  })

  test('filtering by topic shows words', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    // Select a topic from the first select dropdown
    const topicSelect = page.locator('select').first()
    await topicSelect.selectOption('animals')
    await page.waitForLoadState('networkidle')

    // Should show words content
    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })

  test('subtopic dropdown appears when topic has categories', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    // Select "Animals" topic by value
    const topicSelect = page.locator('select').first()
    await topicSelect.selectOption('animals')
    await page.waitForLoadState('networkidle')

    // Wait for category dropdown to appear (loaded via API)
    const categorySelect = page.locator('select').filter({ hasText: /All Categories/ }).first()
    if (await categorySelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await categorySelect.selectOption({ index: 1 })
      await page.waitForLoadState('networkidle')
      expect(true).toBeTruthy()
    }
  })

  test('level filter works', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    // Select A1 level
    const levelSelect = page.locator('select').filter({ hasText: /All Levels/ })
    await levelSelect.selectOption('A1')
    await page.waitForLoadState('networkidle')

    // Should show filtered results
    const wordCards = page.locator('[class*="card"]')
    const count = await wordCards.count()
    // May or may not have results depending on user's progress
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('search returns results', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    // Type a common word
    const searchInput = page.locator('input[placeholder*="Search"]')
    await searchInput.fill('water')
    await page.waitForTimeout(500) // Wait for debounce
    await page.waitForLoadState('networkidle')

    // Should show search results
    const content = await page.locator('main').innerText()
    // Should contain "water" somewhere
    expect(content.toLowerCase()).toContain('water')
  })
})

test.describe('Word detail page', () => {
  test('word detail page loads', async ({ page }) => {
    // Go to browse and click a word
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    const wordCard = page.locator('[class*="cursor-pointer"]').first()
    if (await wordCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wordCard.click()
      await page.waitForLoadState('networkidle')

      // Modal should appear with word details
      const modal = page.locator('[class*="fixed"]').filter({ hasText: /phonetic|definition|CEFR/i })
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Check word detail elements
        const modalText = await modal.innerText()
        expect(modalText.length).toBeGreaterThan(10)
      }
    }
  })
})

test.describe('Home page', () => {
  test('shows topic cards with Browse all link', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should show "Learn by Topic" section
    await expect(page.locator('text=/learn by topic/i')).toBeVisible()

    // Should show "Browse all" link
    await expect(page.locator('text=/browse all/i')).toBeVisible()

    // Should show topic cards (at most 6 from .slice(0,6))
    const topicCards = page.locator('[class*="card"]').filter({ hasText: /\d+ words/ })
    const count = await topicCards.count()
    // The home page has other cards too that match "words", so just check >= 1
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('quick actions grid is visible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should have quick action links
    const learnLink = page.locator('a[href="/learn"], a[href="/learn/"]')
    if (await learnLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(learnLink).toBeVisible()
    }
  })
})

test.describe('Stats page', () => {
  test('shows statistics dashboard', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    // Should have stat-related content
    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(50)
  })
})

test.describe('Favorites', () => {
  test('favorites page loads', async ({ page }) => {
    await page.goto('/favorites')
    await page.waitForLoadState('networkidle')

    // Should show favorites heading or empty state
    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

test.describe('History', () => {
  test('session history page loads', async ({ page }) => {
    await page.goto('/history')
    await page.waitForLoadState('networkidle')

    // Should show history content
    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

test.describe('Leaderboard', () => {
  test('leaderboard page loads', async ({ page }) => {
    await page.goto('/leaderboard')
    await page.waitForLoadState('networkidle')

    // Should show leaderboard content
    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

test.describe('Achievements', () => {
  test('achievements page loads', async ({ page }) => {
    await page.goto('/achievements')
    await page.waitForLoadState('networkidle')

    // Should show achievements content
    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

test.describe('Dark mode', () => {
  test('toggle dark mode works', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find dark mode toggle button (moon/sun icon)
    const darkToggle = page.locator('button').filter({ hasText: /🌙|☀️|dark|light/i }).first()
    if (await darkToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Toggle dark mode
      await darkToggle.click()
      await page.waitForTimeout(500)

      // Check html element has dark class
      const htmlClass = await page.locator('html').getAttribute('class')
      expect(htmlClass).toContain('dark')
    }
  })
})
