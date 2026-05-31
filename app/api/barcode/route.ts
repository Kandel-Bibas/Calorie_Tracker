import { NextResponse } from "next/server";
import { lookupByBarcode } from "@/lib/openfoodfacts";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve a barcode (UPC/EAN) to per-100g nutrition via Open Food Facts.
 *
 *   POST /api/barcode  { code: "3017620422003" }
 *
 * Returns:
 *   { ok: true,  product: { name, code, kcal_per_100g, protein_per_100g, ... } }
 *   { ok: false, error: "not_found" | "auth_required" | "bad_request" }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const code = (body as { code?: unknown })?.code;
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const product = await lookupByBarcode(code);
  if (!product) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    product: {
      name: product.product_name,
      code: product.code,
      kcal_per_100g: product.kcal_per_100g,
      protein_per_100g: product.protein_per_100g,
      carb_per_100g: product.carb_per_100g,
      fat_per_100g: product.fat_per_100g,
    },
  });
}
