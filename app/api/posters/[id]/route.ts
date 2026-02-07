import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/app/lib/mongodb";

const MARKER = "POSTER_DELETE_V1_2026_02_06";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = await clientPromise;
    const db = client.db("dc");

    const result = await db.collection("posters").updateOne(
      { id, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Poster not found (or already deleted)", marker: MARKER },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, marker: MARKER });
  } catch (error: any) {
    console.error("DELETE /api/posters/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to delete poster", marker: MARKER, details: error?.message },
      { status: 500 }
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = await clientPromise;
    const db = client.db("dc");

    const poster = await db.collection("posters").findOne({
      id,
      deletedAt: { $exists: false },
    });

    if (!poster) {
      return NextResponse.json({ error: "Poster not found", marker: MARKER }, { status: 404 });
    }

    return NextResponse.json(poster);
  } catch (error: any) {
    console.error("Error fetching poster:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch poster",
        marker: MARKER,
        details: {
          name: error?.name,
          message: error?.message,
          code: error?.code,
        },
      },
      { status: 500 }
    );
  }
}
