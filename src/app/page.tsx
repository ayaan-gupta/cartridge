import Link from 'next/link'
import { CartCard } from '@/components/CartCard'
import { Demo } from '@/components/Demo'
import { PromptForm } from '@/components/PromptForm'
import { getService } from '@/lib/service'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const service = getService()
  const recent = await service.recent()
  // The frog cart is the PRD's own example, so it is the one on show.
  const featured = recent.find((cart) => cart.title === 'LILY PAD DASH') ?? recent[0]
  const demo = featured ? await service.get(featured.id) : null

  return (
    <>
      <section className="hero" id="make">
        <div className="hero-text">
          <h1>Describe a game. Get a cartridge.</h1>
          <p className="lede">One sentence in, one playable 8-bit game out, with its own sprites and a link you can send to a friend.</p>
          <PromptForm />
          <p className="fine">A bot plays every cartridge to the end before you see it, so you never get one that cannot be won.</p>
        </div>
        <div className="hero-console">{demo ? <Demo record={demo} /> : null}</div>
      </section>

      <section className="shelf">
        <div className="shelf-head">
          <h2>On the shelf</h2>
          <Link href="/gallery">See all {recent.length}</Link>
        </div>
        <div className="carts">
          {recent.slice(0, 5).map((cart) => (
            <CartCard key={cart.id} cart={cart} />
          ))}
        </div>
      </section>

      <section className="how">
        <div>
          <h3>A manifest, not code</h3>
          <p>The generator fills in a small form: a map, a cast with one of eight behaviours each, and the rules for winning. The engine does the rest.</p>
        </div>
        <div>
          <h3>Played before it ships</h3>
          <p>A bot searches the real game for a winning run inside the time limit. If it cannot find one, the cart is eased or replaced.</p>
        </div>
        <div>
          <h3>Four colours, sixteen pixels</h3>
          <p>160 by 144, one palette per cart, 16 pixel sprites. The limits are the look, and they keep a whole game under 20 KB.</p>
        </div>
      </section>
    </>
  )
}
