import { NextRequest, NextResponse } from 'next/server';
import { getProfileSetting, setProfileSetting } from '@/lib/supabase';
import { isPublicProfileKey, isForbiddenProfileKey } from '@/lib/profile-keys';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, error: 'Missing "key" parameter' },
        { status: 400 }
      );
    }

    if (!isPublicProfileKey(key)) {
      return NextResponse.json(
        { success: false, error: 'Unknown profile key' },
        { status: 400 }
      );
    }

    const value = await getProfileSetting(key);

    return NextResponse.json({ success: true, key, value });
  } catch (error) {
    console.error('Error fetching profile setting:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing "key" or "value" in body' },
        { status: 400 }
      );
    }

    // Password keys are managed only by the dedicated auth routes.
    if (isForbiddenProfileKey(key)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden profile key' },
        { status: 400 }
      );
    }

    if (!isPublicProfileKey(key)) {
      return NextResponse.json(
        { success: false, error: 'Unknown profile key' },
        { status: 400 }
      );
    }

    const result = await setProfileSetting(key, String(value));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error saving profile setting:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
