import type { Page } from '@playwright/test'

/**
 * Pacing + narration helpers that turn the raw Playwright runs into a
 * walkthrough a person can actually watch: an on-screen caption banner explains
 * each step, and `beat()` dwells so the viewer can read the screen. Combined
 * with `launchOptions.slowMo` (playwright.config.ts), every click/select also
 * moves at a deliberate, watchable speed.
 */

const CAPTION_ID = '__vrsi_demo_caption__'

/** Show (or update) the narration banner pinned above the footer. */
export async function caption(page: Page, text: string): Promise<void> {
  await page
    .evaluate(
      ({ id, t }) => {
        let el = document.getElementById(id)
        if (!el) {
          el = document.createElement('div')
          el.id = id
          el.style.cssText = [
            'position:fixed',
            'left:50%',
            'bottom:52px',
            'transform:translateX(-50%)',
            'z-index:2147483647',
            'background:rgba(2,6,23,0.94)',
            'color:#fff',
            'padding:14px 24px',
            'border-radius:14px',
            'font:600 19px/1.35 system-ui,Segoe UI,Arial,sans-serif',
            'box-shadow:0 10px 34px rgba(0,0,0,0.55)',
            'border:1px solid rgba(59,130,246,0.7)',
            'max-width:78vw',
            'text-align:center',
            'pointer-events:none',
            'letter-spacing:.2px',
          ].join(';')
          document.body.appendChild(el)
        }
        el.textContent = t
      },
      { id: CAPTION_ID, t: text },
    )
    // A full-page navigation can clear the banner mid-call — that's fine, the
    // next caption() re-creates it. Never let narration fail the tour.
    .catch(() => undefined)
}

/** Remove the narration banner (e.g. right before a clean final frame). */
export async function clearCaption(page: Page): Promise<void> {
  await page
    .evaluate((id) => document.getElementById(id)?.remove(), CAPTION_ID)
    .catch(() => undefined)
}

/** Dwell so a viewer can read the current screen. */
export function beat(page: Page, ms = 1900): Promise<void> {
  return page.waitForTimeout(ms)
}
