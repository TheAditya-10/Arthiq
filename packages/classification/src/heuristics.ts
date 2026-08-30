/**
 * Deterministic, user-independent keyword dictionary — step 3 of the
 * classifier (docs/CLASSIFICATION_ENGINE.md §2). Bucket/sub-bucket names
 * here must match the seed categories in docs/PRODUCT_REQUIREMENTS.md /
 * the seed script (packages/database/prisma/seed.ts) for the heuristic to
 * actually resolve to a real bucket for a given user — if the user has
 * renamed/deleted that bucket, the heuristic simply abstains (never
 * creates a bucket on the user's behalf).
 */
export interface HeuristicRule {
  pattern: RegExp;
  bucketName: string;
  subBucketName: string;
  confidence: number;
}

export const HEURISTIC_RULES: HeuristicRule[] = [
  { pattern: /ZOMATO|SWIGGY/, bucketName: "Food", subBucketName: "Delivery", confidence: 0.85 },
  {
    pattern: /DOMINOS|PIZZA HUT|MCDONALD|KFC|BURGER KING/,
    bucketName: "Food",
    subBucketName: "Restaurant",
    confidence: 0.75,
  },
  {
    pattern: /STARBUCKS|CAFE COFFEE DAY|CCD|BLUE TOKAI|THIRD WAVE/,
    bucketName: "Food",
    subBucketName: "Cafe",
    confidence: 0.75,
  },
  {
    pattern: /UBER|OLA CABS|RAPIDO/,
    bucketName: "Transport",
    subBucketName: "Cab",
    confidence: 0.85,
  },
  {
    pattern: /INDIAN OIL|BHARAT PETROLEUM|HP PETROL|SHELL|IOCL|BPCL|HPCL/,
    bucketName: "Transport",
    subBucketName: "Fuel",
    confidence: 0.8,
  },
  {
    pattern: /\bDMRC\b|METRO RAIL|NAMMA METRO/,
    bucketName: "Transport",
    subBucketName: "Metro",
    confidence: 0.8,
  },
  {
    pattern: /BIGBASKET|BLINKIT|ZEPTO|GROFERS|DMART|RELIANCE FRESH/,
    bucketName: "Household",
    subBucketName: "Groceries",
    confidence: 0.8,
  },
  {
    pattern: /CROMA|RELIANCE DIGITAL|VIJAY SALES/,
    bucketName: "Household",
    subBucketName: "Electronics",
    confidence: 0.7,
  },
  {
    pattern: /IKEA|PEPPERFRY|URBAN LADDER/,
    bucketName: "Household",
    subBucketName: "Furniture",
    confidence: 0.75,
  },
  {
    pattern: /\bBSES\b|ELECTRICITY BOARD|WATER BOARD|PIPED GAS/,
    bucketName: "Household",
    subBucketName: "Utilities",
    confidence: 0.75,
  },
  {
    pattern: /NETFLIX|PRIME VIDEO|HOTSTAR|SPOTIFY|BOOKMYSHOW/,
    bucketName: "Personal",
    subBucketName: "Entertainment",
    confidence: 0.8,
  },
  {
    pattern: /MYNTRA|AJIO|H&M|ZARA|ZUDIO/,
    bucketName: "Personal",
    subBucketName: "Clothing",
    confidence: 0.75,
  },
  {
    pattern: /CULT\.FIT|CULTFIT|GOLDS GYM|ANYTIME FITNESS/,
    bucketName: "Personal",
    subBucketName: "Fitness",
    confidence: 0.75,
  },
  {
    pattern: /AMAZON|FLIPKART/,
    bucketName: "Personal",
    subBucketName: "Shopping",
    confidence: 0.55,
  },
];
