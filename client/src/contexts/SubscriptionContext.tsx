import { createContext, useContext, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

interface SubscriptionContextType {
  status: "none" | "trialing" | "active" | "canceled" | "past_due" | "expired";
  isPremium: boolean;
  /** 有料アクセスの根拠（サブスクリプション / 期限付きアクセスパス）。 */
  accessSource: "subscription" | "access_pass" | "none";
  accessExpiresAt: string | null;
  daysLeft: number | null;
  trialEndsAt: string | null;
  isLoading: boolean;
  startTrial: () => void;
  openCheckout: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  status: "none",
  isPremium: false,
  accessSource: "none",
  accessExpiresAt: null,
  daysLeft: null,
  trialEndsAt: null,
  isLoading: true,
  startTrial: () => {},
  openCheckout: () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = trpc.subscription.getStatus.useQuery(undefined, {
    staleTime: 60_000, // 1分キャッシュ
    refetchOnWindowFocus: true,
  });

  const { data: access, isLoading: isAccessLoading } = trpc.accessPass.getAccess.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const startTrialMutation = trpc.subscription.startTrial.useMutation({
    onSuccess: () => {
      // refetch status
      window.location.reload();
    },
  });

  const checkoutMutation = trpc.subscription.createCheckout.useMutation({
    onSuccess: (result) => {
      if (result.url) {
        window.open(result.url, "_blank");
      }
    },
  });

  const value: SubscriptionContextType = {
    status: data?.status ?? "none",
    isPremium: (data?.isPremium ?? false) || (access?.isPremium ?? false),
    accessSource: access?.source ?? "none",
    accessExpiresAt: access?.expiresAt ?? null,
    daysLeft: data?.daysLeft ?? null,
    trialEndsAt: data?.trialEndsAt ?? null,
    isLoading: isLoading || isAccessLoading,
    startTrial: () => startTrialMutation.mutate(),
    openCheckout: () => checkoutMutation.mutate(),
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
