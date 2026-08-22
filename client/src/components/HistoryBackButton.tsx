import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useLocation } from "wouter";

export const shouldUseBrowserHistory = (historyLength: number) => historyLength > 1;

type HistoryBackButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fallbackHref?: string;
  children: ReactNode;
};

/** 直前の画面へ戻り、履歴がない直リンク時だけ指定先へ遷移する。 */
export function HistoryBackButton({ fallbackHref = "/", children, onClick, type = "button", ...props }: HistoryBackButtonProps) {
  const [, navigate] = useLocation();

  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>["onClick"] = event => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (typeof window !== "undefined" && shouldUseBrowserHistory(window.history.length)) {
      window.history.back();
      return;
    }
    navigate(fallbackHref);
  };

  return <button {...props} type={type} onClick={handleClick}>{children}</button>;
}
