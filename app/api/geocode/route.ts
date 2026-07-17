import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/ors/geocode'

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 })
    }

    const result = await geocodeAddress(address)

    if (!result) {
      return NextResponse.json({ latitude: null, longitude: null })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Geocode API route error:', error)
    return NextResponse.json({ latitude: null, longitude: null })
  }
}