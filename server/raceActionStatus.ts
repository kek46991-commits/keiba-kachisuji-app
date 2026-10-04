export type RaceActionStatus = "predict" | "waiting" | "result" | "missing_result";

export function getRaceActionStatus(input: {
  raceDate: string;
  startTime: string | null;
  resultsConfirmed: boolean;
  now?: Date;
}): RaceActionStatus {
  if (input.resultsConfirmed) return "result";

  const now = input.now ?? new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayJst = jstNow.toISOString().slice(0, 10);
  const timeJst = jstNow.toISOString().slice(11, 16);
  if (input.raceDate < todayJst) return "missing_result";
  const hasStarted = input.raceDate < todayJst || (
    input.raceDate === todayJst && !!input.startTime && input.startTime <= timeJst
  );
  return hasStarted ? "waiting" : "predict";
}
