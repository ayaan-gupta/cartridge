import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Browser } from 'playwright'
import { chromium } from 'playwright'

/** Reuses whatever Chromium Playwright has already downloaded, any revision. */
export function cachedChromium(): string | undefined {
  const caches = [path.join(homedir(), 'Library', 'Caches', 'ms-playwright'), path.join(homedir(), '.cache', 'ms-playwright')]
  for (const cache of caches) {
    if (!existsSync(cache)) continue
    const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
    for (const dir of dirs) {
      for (const arch of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux', 'chrome-linux']) {
        const bin = path.join(cache, dir, arch, arch.startsWith('chrome-headless-shell') ? 'chrome-headless-shell' : 'headless_shell')
        if (existsSync(bin)) return bin
      }
    }
  }
  return undefined
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: cachedChromium() })
}
