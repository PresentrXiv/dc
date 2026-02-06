import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // Fingerprint: if you don't see this in the client response, you're not hitting this route.
  if (!token) {
    return NextResponse.json(
      { error: "SERVER_MISSING_TOKEN", hasToken: false },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const blob = await put(`posters/${Date.now()}-${file.name}`, file, {
      access: "public",
      token, // must be a real string
    });

    return NextResponse.json({ url: blob.url, marker: "SERVER_USED_TOKEN" });
  } catch (e: any) {
    console.error("Blob upload error:", e);
    return NextResponse.json(
      { error: "UPLOAD_FAILED", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
