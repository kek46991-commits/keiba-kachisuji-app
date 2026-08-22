export const RESULT_WAITING_REFETCH_MS = 30_000;

export function getResultWaitingRefetchInterval(
  races: Array<{ actionStatus?: string }> | undefined,
): number | false {
  return races?.some((race) => race.actionStatus === "waiting")
    ? RESULT_WAITING_REFETCH_MS
    : false;
}
