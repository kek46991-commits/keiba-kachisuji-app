import { z } from "zod";

export const TRACK_CONDITION_FILTER_VALUES = ["good", "slightly_heavy", "heavy", "bad"] as const;

export const predictionHistoryFilterInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  venue: z.string().trim().min(1).max(32).optional(),
  distance: z.number().int().positive().max(5000).optional(),
  trackCondition: z.enum(TRACK_CONDITION_FILTER_VALUES).optional(),
  venueMissing: z.boolean().default(false),
  distanceMissing: z.boolean().default(false),
  trackConditionMissing: z.boolean().default(false),
}).superRefine((input, context) => {
  if (input.venue && input.venueMissing) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "会場指定と会場未登録は同時に指定できません" });
  }
  if (input.distance && input.distanceMissing) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "距離指定と距離未登録は同時に指定できません" });
  }
  if (input.trackCondition && input.trackConditionMissing) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "馬場状態指定と馬場状態未登録は同時に指定できません" });
  }
});
