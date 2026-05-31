import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { searchOpenFoodFacts } from "@/lib/openfoodfacts";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const OFF = "https://world.openfoodfacts.org/cgi/search.pl";

describe("searchOpenFoodFacts", () => {
  it("returns per-100g from first product", async () => {
    server.use(
      http.get(OFF, () =>
        HttpResponse.json({
          products: [
            {
              code: "3017620422003",
              product_name: "Nutella",
              nutriments: {
                "energy-kcal_100g": 539,
                "proteins_100g": 6.3,
                "carbohydrates_100g": 57.5,
                "fat_100g": 30.9,
              },
            },
          ],
        }),
      ),
    );
    const r = await searchOpenFoodFacts("nutella");
    expect(r?.code).toBe("3017620422003");
    expect(r?.kcal_per_100g).toBe(539);
    expect(r?.fat_per_100g).toBe(30.9);
  });

  it("returns null on empty result set", async () => {
    server.use(http.get(OFF, () => HttpResponse.json({ products: [] })));
    expect(await searchOpenFoodFacts("widget")).toBeNull();
  });

  it("returns null when product lacks energy-kcal_100g", async () => {
    server.use(
      http.get(OFF, () =>
        HttpResponse.json({
          products: [{ code: "x", product_name: "y", nutriments: { "proteins_100g": 10 } }],
        }),
      ),
    );
    expect(await searchOpenFoodFacts("x")).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    server.use(http.get(OFF, () => HttpResponse.error()));
    await expect(searchOpenFoodFacts("x")).rejects.toThrow();
  });
});
