---
name: testing-keiba-settlement
description: How to run and UI-test the Keiba (競馬) React19+Vite+Express+tRPC11+Drizzle/MySQL app locally, especially the race-result settlement / recovery-rate (回収率) features.
---

# Keiba app – local run & settlement UI testing

## Start the stack
```bash
docker start keiba-mysql            # MySQL 8 exposed on 127.0.0.1:3307
cd /home/ubuntu/manus_src/extracted
export PATH=/home/ubuntu/.npm-global/bin:$PATH
pnpm build                          # only when client/server sources changed
DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' \
  STRIPE_SECRET_KEY=sk_test_dummy NODE_ENV=production PORT=3000 node dist/index.js
```
Open http://localhost:3000. If a server is already listening on 3000, don't restart it —
check with `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/`.

Demo/seed data (re-seed if missing):
```bash
DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' STRIPE_SECRET_KEY=sk_test_dummy \
  npx tsx local_result_seed.ts
```
- JRA hit case: raceId `20260822CHUKYO09` (中京9R, ROI 1888.2%)
- NAR miss case: raceId `20260822OOI11` (大井11R, ROI 0%)

## Reaching the screens (no nav links for some pages)
Wouter routes live in `client/src/App.tsx`. Useful direct URLs:
- `/race-result?date=2026-08-22&venue=中京&race=9` (RaceResultPage resolves raceId from date+venue+race via `raceData.getByDate`)
- `/race-result?date=2026-08-22&venue=大井&race=11`
- `/nar-predictions?date=2026-08-22&venue=大井&race=11` (RaceSettlementCard)
- `/prediction-history`, `/dashboard`
Header link 「今日の予想」 goes to `/nar-predictions` (a race list), NOT `client/src/pages/TodaysPredictions.tsx`.
That component may still be unrouted/unimported — verify with
`grep -rn TodaysPredictions client server shared` and by grepping the built bundle for one of its
literal strings (e.g. 「レース結果（1〜3着）」) before claiming it was tested.

## DB gotchas
- `predictions` uses **camelCase** column names in MySQL (`raceId`, `isHit`, `investAmount`, `returnAmount`).
  snake_case queries fail with `Unknown column 'race_id'`. Always `describe predictions;` first.
- History/dashboard aggregation (`server/predictionHistoryPerformance.ts`) only counts rows where
  `isHit IS NOT NULL`. If 予想履歴 shows 「集計できる確定済みの予想がまだありません」 while
  `raceData.getRaceSettlements` returns correct payouts, the seeded `predictions` rows likely have
  NULL `isHit`/`returnAmount`. For test purposes only:
  ```sql
  update predictions set isHit=1, returnAmount=20770 where raceId='20260822CHUKYO09';
  update predictions set isHit=0, returnAmount=0     where raceId='20260822OOI11';
  ```
  (Report this as a possible product gap: settlement API recomputes from official payouts but the
  aggregation path reads persisted columns.)

## /todays-predictions (今週の予想) test data window
`client/src/pages/TodaysPredictions.tsx` lists races from `raceData.getThisWeekend`, which only
returns races whose `raceDate` is within `[today, today+7d]` (`server/raceDataRouter.ts:20-35`).
Past demo races (e.g. 2026-08-22 while the box clock is 2026-08-23) therefore render the
「現在、予想可能なレースはありません」 empty state. To test the page, temporarily shift the demo
races into the window and restore afterwards:
```sql
update races set raceDate='<today>' where raceId in ('20260822CHUKYO09','20260822OOI11');
-- test, then:
update races set raceDate='2026-08-22' where raceId in ('20260822CHUKYO09','20260822OOI11');
```
Note: the date group heading uses `new Date(date+'T00:00:00+09:00').toLocaleDateString('ja-JP')`,
so on a non-JST (e.g. UTC) browser it shows one day earlier than `raceDate` — expect an off-by-one
heading unless the browser/container TZ is Asia/Tokyo.

## Auto-settlement check (settlePendingConfirmedRaces)
`server/resultSettlement.ts:settlePendingConfirmedRaces` is invoked from `getRaceSettlements`,
`getPredictionHistoryPerformance` and `getPredictionHistoryTimeline`
(`server/raceDataRouter.ts:183,298,332`). To prove it works end to end: NULL out
`predictions.isHit`/`returnAmount`, load `/dashboard` (or `/prediction-history`) in the browser,
then re-query the table — the values should be repopulated from the official payouts.

## Handy API probes
```bash
curl -s 'http://localhost:3000/api/trpc/raceData.getRaceSettlements?input=%7B%22json%22%3A%7B%22raceIds%22%3A%5B%2220260822CHUKYO09%22%5D%7D%7D'
curl -s 'http://localhost:3000/api/trpc/raceData.getPredictionHistoryPerformance?input=%7B%22json%22%3A%7B%22limit%22%3A100%2C%22offset%22%3A0%7D%7D'
```
`limit` is capped at 100 server-side; a client passing 200 gets `too_big` (400) and the panel renders
its empty state. If a summary panel is silently empty, always check the browser console for tRPC
`too_big`/BAD_REQUEST errors before blaming the data.
