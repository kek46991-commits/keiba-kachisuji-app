import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { blogRouter } from "./blogRouter";
import { weatherRouter } from "./weatherRouter";
import { subscriptionRouter } from "./stripe/subscriptionRouter";
import { newsletterRouter } from "./newsletterRouter";
import { raceDataRouter } from "./raceDataRouter";
import { newsRouter } from "./newsRouter";
import { scheduleRouter } from "./scheduleRouter";
import { csvUploadRouter } from "./csvUploadRouter";
import { predictionRouter } from "./predictionRouter";
import { narPredictionRouter } from "./narPredictionRouter";
import { anaUmaRouter } from "./anaUmaRouter";
import { encyclopediaRouter } from "./encyclopediaRouter";
import { dashboardRouter } from "./dashboardRouter";
import { jraVanUploadRouter } from "./jraVanUploadRouter";
import { heroAlertRouter } from "./heroAlertRouter";
import { authorizedDataSourceRouter } from "./authorizedDataSourceRouter";
import { syntheticPredictionRouter } from "./syntheticPredictionRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  blog: blogRouter,
  weather: weatherRouter,
  subscription: subscriptionRouter,
  newsletter: newsletterRouter,
  raceData: raceDataRouter,
  news: newsRouter,
  schedule: scheduleRouter,
  csvUpload: csvUploadRouter,
  prediction: predictionRouter,
  narPrediction: narPredictionRouter,
  anaUma: anaUmaRouter,
  encyclopedia: encyclopediaRouter,
  dashboard: dashboardRouter,
  jraVanUpload: jraVanUploadRouter,
  heroAlert: heroAlertRouter,
  authorizedDataSource: authorizedDataSourceRouter,
  syntheticPrediction: syntheticPredictionRouter,
});
export type AppRouter = typeof appRouter;
