import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/wp/Legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy — WealthPulse" }, { name: "description", content: "What WealthPulse stores, who can see it, and how to delete it." }] }),
  component: () => (
    <LegalPage title="Privacy">
      <h2 className="text-hi font-medium">What we store</h2>
      <p>The details you enter or import: holdings, loans, policies, RSU grants, and profile names. When you upload a CAS statement, we read it in your browser, keep only the holdings and transactions found in it, and never store the PDF itself.</p>
      <h2 className="text-hi font-medium">Who can see it</h2>
      <p>Only you, by default. If you join a household, other members see your roll-up numbers and the items you have not marked private. Items you hide, or everything if you switch on "make everything private", are invisible to other members, including the household leader, and are left out of household totals. This is enforced in the database, not only on screen.</p>
      <h2 className="text-hi font-medium">Where prices come from</h2>
      <p>Prices and NAVs come from free public sources (AMFI, NSE, and other free feeds). Your holdings are never sent to those sources.</p>
      <h2 className="text-hi font-medium">Your controls</h2>
      <p>Settings lets you download everything we hold about you, and delete your account and data. Deleting removes your holdings, loans, policies, grants, notifications and profile. If you lead a household, leadership passes to the longest-standing member.</p>
      <h2 className="text-hi font-medium">Cookies and analytics</h2>
      <p>We use only what is needed to keep you signed in. No advertising trackers.</p>
    </LegalPage>
  ),
});
