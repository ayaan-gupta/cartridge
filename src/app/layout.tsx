import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cartridge',
  description: 'Describe a game in one sentence and get a playable, shareable 8-bit cartridge.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f3f0e8',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand" aria-label="Cartridge home">
            <img src="/art/logo.png" alt="Cartridge" width={148} height={26} className="pixel" />
          </Link>
          <nav>
            <Link href="/gallery">The shelf</Link>
            <Link href="/#make" className="nav-make">
              Make one
            </Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>
            Every cartridge here is a small JSON file run by one hand-built engine. Nothing a model writes is ever executed.
          </p>
        </footer>
      </body>
    </html>
  )
}
