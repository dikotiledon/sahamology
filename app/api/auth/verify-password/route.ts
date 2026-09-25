import { NextRequest, NextResponse } from 'next/server';
import { getProfileSetting, setProfileSetting } from '@/lib/supabase';
import { setSession } from '@/lib/auth';
import { verifyPassword, hashPassword } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    const storedHash = await getProfileSetting('password_hash');

    if (!storedHash) {
      return NextResponse.json(
        { success: false, error: 'No password has been set' },
        { status: 400 }
      );
    }

    const verification = await verifyPassword(password, storedHash);
    const valid = verification.ok;

    if (valid) {
      // Transparently upgrade legacy unsalted SHA-256 hashes to scrypt.
      if (verification.needsRehash) {
        await setProfileSetting('password_hash', await hashPassword(password));
      }

      const response = NextResponse.json({ success: true, valid: true });
      await setSession(response, true, request.headers.get('x-forwarded-proto'));
      return response;
    }

    return NextResponse.json({ success: true, valid: false });
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
