import path from 'path'
import type { Page, TestInfo } from '@playwright/test'

/**
 * Returns a `shot(name)` helper that writes numbered PNGs into
 * e2e/artifacts/screens/<group>/ AND attaches them to the HTML report.
 * The numbering keeps the visual story in order for anyone scrubbing the folder.
 */
export function makeShot(page: Page, info: TestInfo, group: string) {
  let n = 0
  const dir = path.resolve(__dirname, '..', 'artifacts', 'screens', group)
  return async function shot(name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
    n += 1
    const file = path.join(dir, `${String(n).padStart(2, '0')}-${name}.png`)
    await page.screenshot({ path: file, fullPage: opts.fullPage ?? false })
    await info.attach(`${group}/${String(n).padStart(2, '0')}-${name}`, {
      path: file,
      contentType: 'image/png',
    })
  }
}
