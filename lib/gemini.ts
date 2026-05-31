import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { MealAnalysisSchema, type MealAnalysis } from "@/schemas/meal-analysis";

const MODEL = "gemini-3-flash-preview";

export const SYSTEM_PROMPT = `You are a nutrition analyst. The user is telling you what they ate and (usually) how much. Your job is to parse their meal into items AND provide accurate per-100g nutrition for each item AS PREPARED.

For each food item, return:
1. A normalized food name (display_name + usda_query — used for caching).
2. The grams the user stated (set user_provided_grams=true). Only estimate if they didn't say.
3. The logging_mode (component / composite / restaurant_estimate / saved_recipe).
4. The preparation method.
5. PER-100G NUTRITION as the food was actually prepared and eaten:
   - kcal_per_100g
   - protein_per_100g (grams)
   - carb_per_100g (grams)
   - fat_per_100g (grams)

CRITICAL NUTRITION RULES:
- Values are PER 100 GRAMS of the food AS PREPARED, NOT raw/dry.
- Pan-fried potatoes ≈ 250 kcal/100g (oil absorbed), NOT 87 (boiled).
- Cooked white rice ≈ 130 kcal/100g, NOT 360 (dry).
- Cooked ground turkey (85-93% lean) ≈ 180-220 kcal/100g (default to 200 if lean% unknown).
- Cooking method MUST be baked into the values. If user says "fried", the kcal MUST reflect oil absorption.
- For composite dishes (single total grams), give per-100g of the whole dish, not individual ingredients.
- For uncommon / regional / ethnic foods, use your best calibrated estimate. It's better to be approximately right than to refuse.

GRAMS RULES:
- TRUST the user's stated grams exactly. If they say "220g spaghetti", use 220.
- Only estimate grams when not stated. Set user_provided_grams=false and document estimation_basis.
- For "a slice of pizza" etc., use sensible defaults (1 slice cheese pizza ≈ 107g, 1 medium banana ≈ 118g, 1 cup cooked rice ≈ 195g).

OUTPUT: Strictly conform to the provided JSON Schema. No prose outside schema fields.`;

export interface AnalyzeInput {
  imageBytes?: Uint8Array;
  imageMime?: string;
  transcript?: string;
  typed_text?: string;
}

export interface AnalyzeOutput {
  parsed: MealAnalysis;
  raw: unknown;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms: number;
}

export async function analyzeMeal(input: AnalyzeInput): Promise<AnalyzeOutput> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const parts: Array<Record<string, unknown>> = [];
  if (input.imageBytes && input.imageMime) {
    parts.push({
      inlineData: {
        mimeType: input.imageMime,
        data: Buffer.from(input.imageBytes).toString("base64"),
      },
    });
  }
  const text = [input.transcript, input.typed_text].filter(Boolean).join("\n\n");
  if (text) parts.push({ text });

  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: zodToGeminiSchema(MealAnalysisSchema),
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
    },
  } as Parameters<typeof ai.models.generateContent>[0]);
  const latency_ms = Date.now() - t0;

  const rawText = (response as { text?: string }).text ?? "";
  const json = JSON.parse(rawText);
  const parsed = MealAnalysisSchema.parse(json);

  const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
    .usageMetadata;

  return {
    parsed,
    raw: json,
    input_tokens: usage?.promptTokenCount,
    output_tokens: usage?.candidatesTokenCount,
    latency_ms,
  };
}

/**
 * Convert a Zod schema to a JSON-Schema-compatible object that Gemini 3 accepts.
 * Gemini accepts standard JSON Schema since Nov 2025.
 *
 * Uses any-typed access to Zod's internal `_def` shape (intentional — Zod's
 * internals aren't part of its public TS surface).
 */
export function zodToGeminiSchema(schema: z.ZodTypeAny): unknown {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const def: any = (schema as any)._def;
  const typeName: string = def.typeName;

  if (typeName === "ZodObject") {
    const shape: Record<string, z.ZodTypeAny> = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const key of Object.keys(shape)) {
      const child = shape[key]!;
      properties[key] = zodToGeminiSchema(child);
      if (!(child instanceof z.ZodOptional)) required.push(key);
    }
    return { type: "object", properties, required };
  }
  if (typeName === "ZodArray") return { type: "array", items: zodToGeminiSchema(def.type) };
  if (typeName === "ZodString") return { type: "string", description: def.description };
  if (typeName === "ZodNumber") return { type: "number", description: def.description };
  if (typeName === "ZodBoolean") return { type: "boolean", description: def.description };
  if (typeName === "ZodEnum") return { type: "string", enum: def.values };
  if (typeName === "ZodOptional") return zodToGeminiSchema(def.innerType);
  if (typeName === "ZodDefault") return zodToGeminiSchema(def.innerType);
  return { type: "string" };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
