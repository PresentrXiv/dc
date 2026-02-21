import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/app/lib/mongodb';
import { ObjectId } from 'mongodb';
// GET /api/comments?posterId=sample
export async function GET(request: NextRequest) {
  try {
    const posterId = request.nextUrl.searchParams.get('posterId');
    
    if (!posterId) {
      return NextResponse.json(
        { error: 'posterId is required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(); // uses the DB from the connection string
    
    const comments = await db
      .collection('comments')
      .find({ posterId })
      .sort({ timestamp: -1 })
      .toArray();
    
    return NextResponse.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/comments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { posterId, page, text, author } = body;

    if (!posterId || !text || page === undefined) {
      return NextResponse.json(
        { error: 'posterId, page, and text are required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();
    
    const comment = {
      posterId,
      page,
      text,
      author: author || 'Anonymous',
      timestamp: new Date(),
    };

    const result = await db.collection('comments').insertOne(comment);
    
    return NextResponse.json({
      ...comment,
      _id: result.insertedId,
    });
  } catch (error) {
    console.error('Error saving comment:', error);
    return NextResponse.json(
      { error: 'Failed to save comment' },
      { status: 500 }
    );
  }
}
// DELETE /api/comments?id=...
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Comment id is required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const result = await db
      .collection('comments')
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}