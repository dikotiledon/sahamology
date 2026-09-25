import { NextRequest, NextResponse } from 'next/server';
import { setProfileSetting } from '@/lib/supabase';
import { clearSession } from '@/lib/auth';
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, enabled } = body;

    if (enabled && (!password || password.length < MIN_PASSWORD_LENGTH)) {
      return NextResponse.json(
        { success: false, error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter` },
        { status: 400 }
      );
    }

    if (enabled) {
      const hash = await hashPassword(password);
      await setProfileSetting('password_hash', hash);
      await setProfileSetting('password_enabled', 'true');
    } else {
      await setProfileSetting('password_hash', '');
      await setProfileSetting('password_enabled', 'false');
    }

    const response = NextResponse.json({ success: true });
    await clearSession(response);
    return response;
  } catch (error) {
    console.error('Error setting password:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
