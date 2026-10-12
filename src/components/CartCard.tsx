import Link from 'next/link'
import type { CartSummary } from '@/lib/service'

/** A cart on the shelf, drawn as a cartridge with the game's first frame as its label. */
export function CartCard({ cart }: { cart: CartSummary }) {
  return (
    <Link href={`/c/${cart.id}`} className="cart">
      <span className="cart-body">
        <span className="cart-ridges" aria-hidden="true" />
        <span className="cart-label" style={{ background: cart.palette[0] }}>
          <img src={`/api/carts/${cart.id}/label`} width={160} height={144} alt="" loading="lazy" />
        </span>
        <span className="cart-notch" aria-hidden="true" />
      </span>
      <span className="cart-title">{cart.title}</span>
      <span className="cart-blurb">{cart.blurb}</span>
    </Link>
  )
}
