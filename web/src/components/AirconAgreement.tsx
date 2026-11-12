import { useEffect, useState } from "react";
import { setupApi, type AirconCheck, type AirconPattern } from "../api/client";

/** "Your 12 bills agree: about 8 hours a day" (traditional, #13) or the smart meter pattern (#14). Silent without evidence. */
export function AirconAgreement({ token, sin, aircon }: { token: string; sin: string; aircon: AirconPattern }) {
  const [check, setCheck] = useState<AirconCheck | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCheck(null);
    setupApi.airconCheck(token, sin, aircon, controller.signal).then(setCheck).catch(() => {});
    return () => controller.abort();
  }, [token, sin, aircon]);
  if (!check?.available || !check.message) return null;
  return <p className={`agreement ${check.agrees ? "" : "differs"}`} role="status">{check.agrees ? "✓ " : ""}{check.message}</p>;
}
