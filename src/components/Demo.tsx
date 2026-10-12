'use client'

import { useMemo } from 'react'
import type { CartRecord } from '@/lib/service'
import { Console } from './Console'

/** The console on the home page: a hand-written cart, played by the bot until you take over. */
export function Demo({ record }: { record: CartRecord }) {
  const cart = useMemo(() => ({ manifest: record.manifest, sheet: record.sheet }), [record])
  return <Console cart={cart} tape={record.tape} attract maxScale={2} />
}
