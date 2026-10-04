/**
 * 確定済みレースへの予想バックフィルを手動実行するスクリプト。
 *
 *   DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' npx tsx backfill_predictions.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { predictions } from "./drizzle/schema";
import { backfillPredictionsForConfirmedRaces } from "./server/predictionBackfill";
import { settlePendingConfirmedRaces } from "./server/resultSettlement";

const db = drizzle(process.env.DATABASE_URL!);

async function main() {
  const limit = Number(process.env.BACKFILL_LIMIT ?? "500");
  const backfilled = await backfillPredictionsForConfirmedRaces(db, limit);
  const settled = await settlePendingConfirmedRaces(db as any, 1000);

  const [summary] = await db
    .select({
      total: sql<number>`count(*)`,
      settled: sql<number>`sum(case when ${predictions.isHit} is not null then 1 else 0 end)`,
      hits: sql<number>`sum(case when ${predictions.isHit} = true then 1 else 0 end)`,
      invest: sql<number>`sum(${predictions.investAmount})`,
      ret: sql<number>`sum(${predictions.returnAmount})`,
    })
    .from(predictions);

  console.log(JSON.stringify({ backfilled, settled: settled.length, summary }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
