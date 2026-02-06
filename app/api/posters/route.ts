import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/app/lib/mongodb';

// GET /api/posters - List all posters
export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('dc');

    const posters = await db
      .collection('posters')
      .find({})
      .sort({ uploadedAt: -1 })
      .toArray();

    return NextResponse.json(posters);
  } catch (error) {
    console.error('Error fetching posters:', error);
    return NextResponse.json({ error: 'Failed to fetch posters' }, { status: 500 });
  }
}

// POST /api/posters - Save poster metadata (JSON only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, author, fileUrl } = body ?? {};

    if (!title || !fileUrl) {
      return NextResponse.json(
        { error: 'title and fileUrl are required' },
        { status: 400 }
      );
    }

    const id = Date.now().toString();

    const client = await clientPromise;
    const db = client.db('dc');

    const poster = {
      id,
      title,
      author: author || 'Anonymous',
      fileUrl,
      uploadedAt: new Date(),
    };

    await db.collection('posters').insertOne(poster);

    return NextResponse.json(poster, { status: 201 });
  } catch (error) {
    console.error('Error saving poster metadata:', error);
    return NextResponse.json({ error: 'Failed to save poster' }, { status: 500 });
  }
}
