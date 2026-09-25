import { NextResponse } from 'next/server';
import { getTokenStatus } from '@/lib/supabase';
import { toPublicTokenStatus } from '@/lib/token-status';

export async function GET() {
  try {
    const status = await getTokenStatus();
    return NextResponse.json(toPublicTokenStatus(status));
  } catch (error) {
    console.error('Error fetching token status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token status' },
      { status: 500 }
    );
  }
}
