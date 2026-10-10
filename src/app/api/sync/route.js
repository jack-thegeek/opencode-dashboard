import { NextResponse } from 'next/server';
import { syncData, getLastSync } from '@/lib/db';

export async function POST() {
  try {
    const result = syncData();
    return NextResponse.json(result);
  } catch (error) {
    console.error('API sync failed:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const lastSync = getLastSync();
    return NextResponse.json({ lastSync });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
