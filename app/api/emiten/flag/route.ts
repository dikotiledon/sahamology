import { NextRequest, NextResponse } from 'next/server';
import { getEmitenFlag, setEmitenFlag } from '@/lib/supabase';

export async function POST(request: NextRequest) {
    try {
        const { emiten, flag } = await request.json();

        if (!emiten || !flag) {
            return NextResponse.json(
                { success: false, error: 'Emiten and flag are required' },
                { status: 400 }
            );
        }

        if (!['OK', 'NG', 'Neutral'].includes(flag)) {
            return NextResponse.json(
                { success: false, error: 'Invalid flag value. Must be OK, NG, or Neutral' },
                { status: 400 }
            );
        }

        const data = await setEmitenFlag(emiten.toUpperCase(), flag);

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Flag API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            },
            { status: 500 }
        );
    }
}
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const emiten = searchParams.get('emiten');

        if (!emiten) {
            return NextResponse.json(
                { success: false, error: 'Emiten is required' },
                { status: 400 }
            );
        }

        const flag = await getEmitenFlag(emiten.toUpperCase());

        return NextResponse.json({ success: true, flag: flag || null });
    } catch (error) {
        console.error('Flag API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            },
            { status: 500 }
        );
    }
}
