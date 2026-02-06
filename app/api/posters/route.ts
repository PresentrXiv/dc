import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/app/lib/mongodb";

const MARKER = "NEW_JSON_ONLY_CODE_2026_02_06";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("dc");

    const posters = await db
      .collection("posters")
      .find({})
      .sort({ uploadedAt: -1 })
      .toArray();

    return NextResponse.json(posters);
  } catch (error: any) {
    console.error("Error fetching posters:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch posters",
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

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "This endpoint no longer accepts file uploads. Upload the PDF first, then POST JSON metadata (title/author/fileUrl).",
          marker: MARKER,
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const title = (body?.title ?? "").toString().trim();
    const author = (body?.author ?? "").toString().trim();

    // IMPORTANT: your client sends fileUrl
    const fileUrl = (body?.fileUrl || body?.url || "").toString().trim();

    if (!title || !fileUrl) {
      return NextResponse.json(
        {
          error: "title and fileUrl (or url) are required",
          marker: MARKER,
          receivedKeys: body ? Object.keys(body) : null,
        },
        { status: 400 }
      );
    }

    const id = Date.now().toString();

    const client = await clientPromise;
    const db = client.db("dc");

    // Connectivity test (helps diagnose 30s hangs)
    const tPing = Date.now();
    await db.command({ ping: 1 });
    const pingMs = Date.now() - tPing;

    const poster = {
      id,
      title,
      author: author || "Anonymous",
      fileUrl,
      uploadedAt: new Date(),
    };

    const tIns = Date.now();
    const result = await db.collection("posters").insertOne(poster);
    const insertMs = Date.now() - tIns;

    return NextResponse.json(
      {
        ...poster,
        _id: result.insertedId,
        marker: MARKER,
        timings: { totalMs: Date.now() - t0, pingMs, insertMs },
      },
      { status: 201 }
    );
} catch (error: any) {
    console.error("Error saving poster metadata:", error);
  
    return NextResponse.json(
      {
        error: "Failed to save poster metadata",
        marker: MARKER,
        DEBUG_POSTERS_ROUTE_VERSION: "POSTERS_CATCH_V2_2026_02_06_2200",
        details: {
          name: error?.name,
          message: error?.message,
          code: error?.code,
          codeName: error?.codeName,
        },
      },
      { status: 500 }
    );
  }
  
}
