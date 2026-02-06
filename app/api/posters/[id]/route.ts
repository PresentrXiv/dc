import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/app/lib/mongodb";

const MARKER = "NEW_JSON_ONLY_CODE_2026_02_06";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = await clientPromise;
    const db = client.db("dc");

    const poster = await db.collection("posters").findOne({ id });

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
