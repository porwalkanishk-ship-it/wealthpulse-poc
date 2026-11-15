import { createFileRoute, redirect } from "@tanstack/react-router";

// The terminal lives behind sign-in; / forwards there (the gate sends signed-out visitors to /auth).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WealthPulse — Household Net Worth Terminal" },
      { name: "description", content: "One terminal for your family's net worth: live AMFI NAVs, SIP tracking, home loan payoff and renewals." },
      { property: "og:title", content: "WealthPulse — Household Net Worth Terminal" },
      { property: "og:description", content: "One terminal for your family's net worth: live AMFI NAVs, SIP tracking, home loan payoff and renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/overview" });
  },
});
