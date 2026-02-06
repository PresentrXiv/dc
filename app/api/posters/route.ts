import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/app/lib/mongodb';

const MARKER = 'NEW_JSON_ONLY_CODE_2026_02_06';

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
    return NextResponse.json(
      { error: 'Failed to fetch posters', marker: MARKER },
      { status: 500 }
    );
  }
}

// Expected JSON body: { title, author?, fileUrl }   OR   { title, author?, url }
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // If anything is still sending FormData, stop clearly
    if (contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        {
          error:
            'This endpoint no longer accepts file uploads. Upload the PDF to Vercel Blob first, then POST JSON metadata (title/author/fileUrl).',
          marker: MARKER,
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const title = (body?.title ?? '').toString();
    const author = (body?.author ?? '').toString();

    // Accept either fileUrl or url, normalize to fileUrl
    const fileUrl = (body?.fileUrl || body?.url || '').toString();

    if (!title.trim() || !fileUrl.trim()) {
      return NextResponse.json(
        {
          error: 'title and fileUrl (or url) are required',
          marker: MARKER,
          receivedKeys: body ? Object.keys(body) : null,
        },
        { status: 400 }
      );
    }

    const id = Date.now().toString();

    const client = await clientPromise;
    const db = client.db('dc');

    const poster = {
      id,
      title: title.trim(),
      author: author.trim() || 'Anonymous',
      fileUrl: fileUrl.trim(),
      uploadedAt: new Date(),
    };

    await db.collection('posters').insertOne(poster);

    return NextResponse.json({ ...poster, marker: MARKER }, { status: 201 });
  } catch (error) {
    console.error('Error saving poster metadata:', error);
    return NextResponse.json(
      { error: 'Failed to save poster metadata', marker: MARKER },
      { status: 500 }
    );
  }
}
