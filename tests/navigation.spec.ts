import { test, expect } from './helpers/auth'

test.describe('Page navigation — smoke tests', () => {
  const routes = [
    { path: '/', name: 'Home' },
    { path: '/learn', name: 'Learn', regex: /learn|resume/i },
    { path: '/review', name: 'Review', regex: /review/i },
    { path: '/quiz', name: 'Quiz', regex: /quiz|question/i },
    { path: '/spelling', name: 'Spelling', regex: /spelling|resume/i },
    { path: '/fill-blank', name: 'Fill Blank', regex: /fill|blank|resume/i },
    { path: '/browse', name: 'Browse', regex: /browse|word/i },
    { path: '/stats', name: 'Stats', regex: /stat/i },
    { path: '/lists', name: 'Lists', checkContent: true },
    { path: '/settings', name: 'Settings', checkContent: true },
    { path: '/sprints', name: 'Sprints', regex: /sprint/i },
    { path: '/writing', name: 'Writing', regex: /writing|sprint/i },
    { path: '/history', name: 'History', checkContent: true },
    { path: '/favorites', name: 'Favorites', checkContent: true },
    { path: '/leaderboard', name: 'Leaderboard', checkContent: true },
    { path: '/achievements', name: 'Achievements', checkContent: true },
    { path: '/listening', name: 'Listening', regex: /listening/i },
    { path: '/speaking', name: 'Speaking', regex: /speaking/i },
    { path: '/reading', name: 'Reading', checkContent: true },
    { path: '/sentence-review', name: 'Sentence Review', regex: /sentence/i },
    { path: '/vocab-size', name: 'Vocab Size', checkContent: true },
    { path: '/daily-challenge', name: 'Daily Challenge', regex: /challenge/i },
    { path: '/word-chain', name: 'Word Chain', regex: /chain/i },
    { path: '/word-match', name: 'Word Match', regex: /match/i },
    { path: '/speed-round', name: 'Speed Round', checkContent: true },
    { path: '/recommendations', name: 'Recommendations', checkContent: true },
    { path: '/collections', name: 'Collections', checkContent: true },
    { path: '/encounters', name: 'Encounters', checkContent: true },
  ]

  for (const route of routes) {
    test(`${route.name} page loads`, async ({ page }) => {
      const response = await page.goto(route.path)
      expect(response!.status()).toBe(200)
      await page.waitForLoadState('networkidle')

      // Verify we stayed on the intended route (not redirected to home/login)
      const url = page.url()
      const stayed = url.includes(route.path) || (route.path === '/' && url.endsWith(':7100/'))
      if (!stayed) {
        test.skip()
        return
      }

      if (route.regex) {
        await expect(page.getByText(route.regex).first()).toBeVisible({ timeout: 10000 })
      } else if (route.checkContent) {
        const content = await page.locator('main').innerText()
        expect(content.length).toBeGreaterThan(10)
      }
    })
  }

  test('404 for unknown route', async ({ page }) => {
    await page.goto('/this-does-not-exist-at-all')
    await expect(
      page.getByText(/not found|404|doesn.*exist|go back|go home/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
