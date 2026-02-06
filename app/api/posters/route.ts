import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/app/lib/mongodb';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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
    return NextResponse.json(
      { error: 'Failed to fetch posters' },
      { status: 500 }
    );
  }
}

// POST /api/posters - Upload new poster
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const author = formData.get('author') as string;

    if (!file || !title) {
      return NextResponse.json(
        { error: 'File and title are required' },
        { status: 400 }
      );
    }

    // Generate unique ID
    const id = Date.now().toString();
    const filename = `${id}.pdf`;

    // Save file to public/posters directory
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const postersDir = join(process.cwd(), 'public', 'posters');
    
    // Create directory if it doesn't exist
    if (!existsSync(postersDir)) {
      await mkdir(postersDir, { recursive: true });
    }

    const filepath = join(postersDir, filename);
    await writeFile(filepath, buffer);

    // Save metadata to database
    const client = await clientPromise;
    const db = client.db('dc');
    
    const poster = {
      id,
      title,
      author: author || 'Anonymous',
      filename,
      filepath: `/posters/${filename}`,
      uploadedAt: new Date(),
    };

    await db.collection('posters').insertOne(poster);
    
    return NextResponse.json(poster);
  } catch (error) {
    console.error('Error uploading poster:', error);
    return NextResponse.json(
      { error: 'Failed to upload poster' },
      { status: 500 }
    );
  }
}