import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="lost">
      <img src="/art/ui/lost-cart.png" alt="" width={160} height={120} className="pixel" />
      <h1>No cartridge in this slot</h1>
      <p className="lede">That link does not lead to a game. It may have been mistyped.</p>
      <p>
        <Link href="/" className="button">
          Make a cartridge
        </Link>
      </p>
    </section>
  )
}
