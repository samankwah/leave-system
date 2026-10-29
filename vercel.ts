import type { VercelConfig } from "@vercel/config/v1";

/**
 * Functions run in London (lhr1), the same region as the Neon database (aws eu-west-2),
 * so each query is a ~1 ms round trip. London is also the closest Vercel region to Ghana.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  regions: ["lhr1"],
};
