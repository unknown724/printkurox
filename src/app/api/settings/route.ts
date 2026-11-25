import { NextResponse } from 'next/server';
import { getHostelChangeSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const hostelChangeEnabled = await getHostelChangeSetting();

    return NextResponse.json(
      {
        success: true,
        hostelChangeEnabled,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    console.error('Failed to get settings:', err);
    return NextResponse.json(
      {
        success: false,
        hostelChangeEnabled: false,
      },
      { status: 500 }
    );
  }
}
