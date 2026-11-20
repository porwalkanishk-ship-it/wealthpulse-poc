import { createFileRoute } from "@tanstack/react-router";
import { DISCLAIMER, LegalPage } from "@/components/wp/Legal";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms — WealthPulse" }, { name: "description", content: "Terms of use for WealthPulse." }] }),
  component: () => (
    <LegalPage title="Terms of use">
      <p>{DISCLAIMER}</p>
      <h2 className="text-hi font-medium">Your records</h2>
      <p>You are responsible for the accuracy of what you enter. Statement imports are checked against your entries, but differences can remain. Check against your official statements before acting.</p>
      <h2 className="text-hi font-medium">No advice</h2>
      <p>Nothing in the app is a recommendation to buy, sell or hold anything. Projections, estimates and "what if" views are illustrations, not forecasts. RSU values that have not vested are contingent on continued employment and are not part of net worth.</p>
      <h2 className="text-hi font-medium">Availability</h2>
      <p>This is an early version provided as is, for a small group of families. Features, prices and availability may change or stop without notice.</p>
      <h2 className="text-hi font-medium">Ending your use</h2>
      <p>You can delete your account and data at any time from Settings.</p>
    </LegalPage>
  ),
});
