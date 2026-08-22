import { createContext, useContext, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

interface SubscriptionContextType {
  status: "none" | "trialing" | "active" | "canceled" | "past_due" | "expired";
  isPremium: boolean;
  daysLeft: number | null;
  trialEndsAt: string | null;
  isLoading: boolean;
  startTrial: () => void;
  openCheckout: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  status: "none",
  isPremium: false,
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
    isPremium: data?.isPremium ?? false,
    daysLeft: data?.daysLeft ?? null,
    trialEndsAt: data?.trialEndsAt ?? null,
    isLoading,
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
