import { ReactNode } from "react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import PaywallOverlay from "./PaywallOverlay";
import { Loader2 } from "lucide-react";

interface PaywallGateProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

/**
 * 非課金ユーザーにはペイウォールを表示し、
 * 課金ユーザーには子コンテンツをそのまま表示する。
 * ローディング中はスケルトンを表示し、誤ってペイウォールを出さない。
 */
export default function PaywallGate({ children, title, description }: PaywallGateProps) {
  const { isPremium, isLoading } = useSubscription();

  // ローディング中はスピナーを表示（プレミアム会員に誤ってペイウォールを出さない）
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00E5FF" }} />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            読み込み中...
          </p>
        </div>
      </div>
    );
  }

  if (!isPremium) {
    return <PaywallOverlay title={title} description={description} />;
  }

  return <>{children}</>;
}
