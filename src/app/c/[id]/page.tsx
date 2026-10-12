import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Play } from '@/components/Play'
import { manifestBytes } from '@/cart/schema'
import { getService } from '@/lib/service'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const record = await getService().get(id)
  if (!record) return { title: 'No cartridge here' }
  const title = `${record.manifest.title} on Cartridge`
  return {
    title,
    description: record.manifest.blurb,
    openGraph: { title, description: record.manifest.blurb, images: [{ url: `/api/carts/${id}/label?scale=4`, width: 640, height: 576 }] },
  }
}

export default async function CartPage({ params }: Props) {
  const { id } = await params
  const record = await getService().get(id)
  if (!record) notFound()
  return <Play record={record} bytes={manifestBytes(record.manifest)} />
}
