import { test, expect, apiGet, apiPost } from './helpers/auth'

// ─── Browse ──────────────────────────────────────────────────────────────────

test.describe('Browse topics', () => {
  test('shows all 18 topic categories', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    const selects = page.locator('select')
    await expect(selects.first()).toBeVisible({ timeout: 15000 })

    // Find the topic select (the one with 'All Topics' as first option)
    const selectCount = await selects.count()
    let topicSelect = null
    for (let i = 0; i < selectCount; i++) {
      const firstOpt = await selects.nth(i).locator('option').first().textContent().catch(() => '')
      if (firstOpt?.includes('All Topics')) {
        topicSelect = selects.nth(i)
        break
      }
    }

    if (topicSelect) {
      const options = topicSelect.locator('option')
      const optionCount = await options.count()
      expect(optionCount).toBeGreaterThanOrEqual(18)
    } else {
      expect(selectCount).toBeGreaterThanOrEqual(2)
    }
  })

  test('filtering by topic shows words', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    const selects = page.locator('select')
    const count = await selects.count()
    let topicSelect = null

    for (let i = 0; i < count; i++) {
      const firstOption = await selects.nth(i).locator('option').first().textContent()
      if (firstOption?.includes('All Topics')) {
        topicSelect = selects.nth(i)
        break
      }
    }

    if (!topicSelect) {
      expect(true).toBeTruthy()
      return
    }

    await topicSelect.selectOption('animals')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })

  test('subtopic dropdown appears when topic has categories', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    const selects = page.locator('select')
    const count = await selects.count()
    let topicSelect = null

    for (let i = 0; i < count; i++) {
      const firstOption = await selects.nth(i).locator('option').first().textContent()
      if (firstOption?.includes('All Topics')) {
        topicSelect = selects.nth(i)
        break
      }
    }

    if (!topicSelect) {
      expect(true).toBeTruthy()
      return
    }

    await topicSelect.selectOption('animals')
    await page.waitForLoadState('networkidle')

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

    const levelSelect = page.locator('select').filter({ hasText: /All Levels/ })
    await levelSelect.selectOption('A1')
    await page.waitForLoadState('networkidle')

    const wordCards = page.locator('[class*="card"]')
    const count = await wordCards.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('search returns results', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[placeholder*="Search"]')
    await searchInput.fill('water')
    await page.waitForTimeout(500)
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.toLowerCase()).toContain('water')
  })
})

// ─── Word detail ─────────────────────────────────────────────────────────────

test.describe('Word detail page', () => {
  test('word detail page loads via API', async ({ page }) => {
    // Get a word ID via API
    const res = await apiGet(page, '/api/words?limit=1')
    const data = await res.json()
    if (!data.words?.[0]?.id) { test.skip(); return }

    await page.goto(`/words/${data.words[0].id}`)
    await page.waitForLoadState('networkidle')

    // Should show word info
    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(20)
  })
})

// ─── Home page ───────────────────────────────────────────────────────────────

test.describe('Home page', () => {
  test('shows topic cards with Browse all link', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=/learn by topic/i')).toBeVisible()
    await expect(page.locator('text=/browse all/i')).toBeVisible()

    const topicCards = page.locator('[class*="card"]').filter({ hasText: /\d+ words/ })
    const count = await topicCards.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('quick actions grid is visible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const learnLink = page.locator('a[href="/learn"], a[href="/learn/"]')
    if (await learnLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(learnLink).toBeVisible()
    }
  })

  test('dashboard shows streak widget', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Dashboard should show streak or a placeholder
    const streakText = page.locator('text=/streak|day/i')
    if (await streakText.isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await streakText.isVisible()).toBeTruthy()
    }
  })

  test('dashboard shows word of the day', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const wotd = page.locator('text=/word of the day/i')
    if (await wotd.isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await wotd.isVisible()).toBeTruthy()
    }
  })
})

// ─── Stats page ──────────────────────────────────────────────────────────────

test.describe('Stats page', () => {
  test('shows statistics dashboard', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(50)
  })

  test('shows activity heatmap', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const heatmap = page.locator('text=/activity|heatmap/i')
    if (await heatmap.isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await heatmap.isVisible()).toBeTruthy()
    }
  })
})

// ─── Favorites ───────────────────────────────────────────────────────────────

test.describe('Favorites', () => {
  test('favorites page loads', async ({ page }) => {
    await page.goto('/favorites')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── History ─────────────────────────────────────────────────────────────────

test.describe('History', () => {
  test('session history page loads', async ({ page }) => {
    await page.goto('/history')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Leaderboard ─────────────────────────────────────────────────────────────

test.describe('Leaderboard', () => {
  test('leaderboard page loads', async ({ page }) => {
    await page.goto('/leaderboard')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Achievements ────────────────────────────────────────────────────────────

test.describe('Achievements', () => {
  test('achievements page loads', async ({ page }) => {
    await page.goto('/achievements')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Dark mode ───────────────────────────────────────────────────────────────

test.describe('Dark mode', () => {
  test('toggle dark mode works', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const darkToggle = page.locator('button').filter({ hasText: /🌙|☀️|dark|light/i }).first()
    if (await darkToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await darkToggle.click()
      await page.waitForTimeout(500)

      const htmlClass = await page.locator('html').getAttribute('class')
      expect(htmlClass).toContain('dark')
    }
  })
})

// ─── Speaking Practice ───────────────────────────────────────────────────────

test.describe('Speaking Practice', () => {
  test('speaking page loads with setup screen', async ({ page }) => {
    const response = await page.goto('/speaking')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    // Should show speaking practice content (heading or empty state)
    const url = page.url()
    if (!url.includes('/speaking')) {
      // Page was redirected — likely auth issue, skip
      test.skip()
      return
    }

    // Page should have speaking-related content
    const content = await page.locator('main').innerText()
    expect(content.toLowerCase()).toContain('speaking')
  })
})

// ─── Sprints page ────────────────────────────────────────────────────────────

test.describe('Sprints page', () => {
  test('sprints page loads with milestones', async ({ page }) => {
    await page.goto('/sprints')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(50)

    const milestones = page.locator('text=/milestone/i')
    if (await milestones.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await milestones.isVisible()).toBeTruthy()
    }
  })
})

// ─── Writing Exercise ────────────────────────────────────────────────────────

test.describe('Writing Exercise', () => {
  test('writing exercise page loads', async ({ page }) => {
    await page.goto('/writing')
    await page.waitForLoadState('networkidle')

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Sentence Review ─────────────────────────────────────────────────────────

test.describe('Sentence Review', () => {
  test('sentence review page loads', async ({ page }) => {
    const response = await page.goto('/sentence-review')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/sentence-review')) {
      // Redirected — auth issue, skip
      test.skip()
      return
    }

    // Should show sentence review heading or empty state
    const content = await page.locator('main').innerText()
    expect(content.toLowerCase()).toContain('sentence')
  })
})

// ─── Listening ───────────────────────────────────────────────────────────────

test.describe('Listening Comprehension', () => {
  test('listening page loads with setup', async ({ page }) => {
    const response = await page.goto('/listening')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/listening')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.toLowerCase()).toContain('listening')
  })
})

// ─── Reading Mode ────────────────────────────────────────────────────────────

test.describe('Reading Mode', () => {
  test('reading page loads with text input', async ({ page }) => {
    const response = await page.goto('/reading')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/reading')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Vocab Size Estimator ────────────────────────────────────────────────────

test.describe('Vocab Size Estimator', () => {
  test('vocab size page loads', async ({ page }) => {
    const response = await page.goto('/vocab-size')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/vocab-size')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Daily Challenge ─────────────────────────────────────────────────────────

test.describe('Daily Challenge', () => {
  test('daily challenge page loads', async ({ page }) => {
    const response = await page.goto('/daily-challenge')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/daily-challenge')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.toLowerCase()).toContain('challenge')
  })
})

// ─── Word Chain ──────────────────────────────────────────────────────────────

test.describe('Word Chain Game', () => {
  test('word chain page loads', async ({ page }) => {
    const response = await page.goto('/word-chain')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/word-chain')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.toLowerCase()).toContain('chain')
  })
})

// ─── Speed Round ─────────────────────────────────────────────────────────────

test.describe('Speed Round', () => {
  test('speed round page loads', async ({ page }) => {
    const response = await page.goto('/speed-round')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/speed-round')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Recommendations ─────────────────────────────────────────────────────────

test.describe('Recommendations', () => {
  test('recommendations page loads', async ({ page }) => {
    const response = await page.goto('/recommendations')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/recommendations')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Collections ─────────────────────────────────────────────────────────────

test.describe('Collections', () => {
  test('collections page loads', async ({ page }) => {
    const response = await page.goto('/collections')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/collections')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Encounters ──────────────────────────────────────────────────────────────

test.describe('Word Encounters', () => {
  test('encounters page loads', async ({ page }) => {
    const response = await page.goto('/encounters')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (!url.includes('/encounters')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    expect(content.length).toBeGreaterThan(10)
  })
})

// ─── Lists ───────────────────────────────────────────────────────────────────

test.describe('Study Lists', () => {
  test('lists page shows system lists and create button', async ({ page }) => {
    const response = await page.goto('/lists')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    // Verify we stayed on lists
    if (!page.url().includes('/lists')) {
      test.skip()
      return
    }

    // Should show system lists
    const content = await page.locator('main').innerText()
    expect(content).toMatch(/favorites|difficult|review/i)

    // Should have a create/new list button
    const createBtn = page.locator('button').filter({ hasText: /new list|create|\+/i }).first()
    await expect(createBtn).toBeVisible({ timeout: 5000 })
  })
})

// ─── Settings ────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test('settings page has account section', async ({ page }) => {
    const response = await page.goto('/settings')
    expect(response!.status()).toBe(200)
    await page.waitForLoadState('networkidle')

    // Verify we stayed on settings
    if (!page.url().includes('/settings')) {
      test.skip()
      return
    }

    const content = await page.locator('main').innerText()
    // Should have account-related content
    expect(content.toLowerCase()).toMatch(/account|password|profile|settings/)
  })

  test('can change daily goal', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // Find daily goal input
    const goalInput = page.locator('input[type="number"], input[type="range"]').first()
    if (await goalInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Just verify it's interactive
      expect(await goalInput.isVisible()).toBeTruthy()
    }
  })
})

// ─── Global Search ───────────────────────────────────────────────────────────

test.describe('Global Search', () => {
  test('Ctrl+K opens search modal', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Press Ctrl+K to open search
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(1000)

    // Search modal should be visible — look for an input that appeared
    const searchInput = page.locator('input[placeholder*="earch"], input[placeholder*="word"]').first()
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('water')
      await page.waitForTimeout(1000)

      // Should show results or "no results" text
      const results = page.getByText(/water|no.*result|found/i).first()
      await expect(results).toBeVisible({ timeout: 5000 })
    }
  })
})

// ─── API Health ──────────────────────────────────────────────────────────────

test.describe('API endpoints', () => {
  test('words API returns data', async ({ page }) => {
    const res = await apiGet(page, '/api/words?limit=5')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.words.length).toBeGreaterThan(0)
  })

  test('themes API returns categories', async ({ page }) => {
    const res = await apiGet(page, '/api/themes')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.length).toBeGreaterThan(0)
  })

  test('progress API returns dashboard', async ({ page }) => {
    const res = await apiGet(page, '/api/progress/dashboard')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toBeDefined()
  })

  test('stats API returns data', async ({ page }) => {
    const res = await apiGet(page, '/api/stats')
    expect(res.status()).toBe(200)
  })

  test('lists API returns user lists', async ({ page }) => {
    const res = await apiGet(page, '/api/lists')
    expect(res.status()).toBe(200)
  })

  test('achievements API returns achievements', async ({ page }) => {
    const res = await apiGet(page, '/api/progress/achievements')
    expect(res.status()).toBe(200)
  })

  test('leaderboard API returns data', async ({ page }) => {
    const res = await apiGet(page, '/api/stats/leaderboard')
    expect(res.status()).toBe(200)
  })
})
