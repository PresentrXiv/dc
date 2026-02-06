import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      // This makes the failure unambiguous in production logs
      return NextResponse.json(
        { error: "Missing BLOB_READ_WRITE_TOKEN on server" },
        { status: 500 }
      );
    }

    const blob = await put(`posters/${Date.now()}-${file.name}`, file, {
      access: "public",
      token, // <-- explicit token prevents “No token found”
    });

    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error("Blob upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file", details: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
