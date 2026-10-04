import { useEffect, type ComponentType } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";

/**
 * 有料ページのガード。未購入・期限切れの場合は購入ページへリダイレクトする。
 * 判定中はスピナーを出し、プレミアム会員を誤って追い出さない。
 */
export function PremiumRoute({ component: Component }: { component: ComponentType }) {
  const { isPremium, isLoading } = useSubscription();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading || isPremium) return;
    navigate(`/access-pass?from=${encodeURIComponent(location)}`, { replace: true });
  }, [isLoading, isPremium, location, navigate]);

  if (isLoading || !isPremium) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0A1128" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00E5FF" }} />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            {isLoading ? "アクセス権を確認中..." : "購入ページへ移動します..."}
          </p>
        </div>
      </div>
    );
  }

  return <Component />;
}
