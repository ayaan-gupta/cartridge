import type { Metadata } from 'next'
import Link from 'next/link'
import { CartCard } from '@/components/CartCard'
import { ImportCart } from '@/components/ImportCart'
import { getService, RECENT_LIMIT } from '@/lib/service'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'The shelf, on Cartridge' }

export default async function Gallery() {
  const carts = await getService().recent()
  return (
    <section className="gallery">
      <h1>The shelf</h1>
      <p className="lede">
        The last {RECENT_LIMIT} cartridges made here, newest first. Older ones still work by link. <ImportCart />
      </p>
      {carts.length === 0 ? (
        <div className="empty">
          <img src="/art/ui/empty-shelf.png" alt="" width={352} height={120} className="pixel" />
          <p>
            Nothing here yet. <Link href="/">Make the first one.</Link>
          </p>
        </div>
      ) : (
        <div className="carts">
          {carts.map((cart) => (
            <CartCard key={cart.id} cart={cart} />
          ))}
        </div>
      )}
    </section>
  )
}
