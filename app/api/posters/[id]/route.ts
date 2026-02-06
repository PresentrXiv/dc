import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/app/lib/mongodb';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = await clientPromise;
    const db = client.db('dc');

    const poster = await db.collection('posters').findOne({ id });

    if (!poster) {
      return NextResponse.json(
        { error: 'Poster not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(poster);
  } catch (error) {
    console.error('Error fetching poster:', error);
    return NextResponse.json(
      { error: 'Failed to fetch poster' },
      { status: 500 }
    );
  }
}
