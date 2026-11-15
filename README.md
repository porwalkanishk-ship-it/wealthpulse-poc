# WealthPulse POC

I am trying to create an application where I can track my networth / how much I have saved at various location. Currently I am doing it in an google sheet and the problem is that I have to add the details manually and its not very convinient.

I have investments across EPFO, PPF, NPS, SBI life, Mutual Funds portfolio, Fixed deposit, RSU, With shubham jain, LIC, Term Plan, Health Insurance.

Use the hybrid: seed my mutual funds with a one-time CAS upload, then update holdings with live prices and compounding interest.
Auto-project units — track each fund’s monthly SIP amount and debit day, then use that day’s AMFI NAV to add units automatically. But do give me an option to reduce the NAV's if I didnot contribute the amount this month due to some reasons.
Add the family profile switcher (All Household, Kanishk, Papa) and renewal calendar to the first version. Leave the elefant money tab.
Visual direction: Bloomberg Slate.
Support multiple liabilities, starting with my home loan and allowing car or education loans later.
For the net worth, add known tangible assets: Physical Real Estate, Gold & SGBs, Liquid Bank Accounts & Emergency Cash, Vehicles, Private Equity.

Locked:
- Visual Direction & Design Tokens: "Bloomberg Slate" (`terminal-dark`). Background `#0B0F17`, panels `#111723`, borders `#1E293B`, muted typography `#7C8BA1`, text `#E2E8F0`, emerald accent `#10B981` (for positive metrics, active SIPs, net equity, debt-free trajectories), crimson accent `#EF4444` (for negative returns, upcoming due dates, liabilities). Typography uses Inter for body and labels, and JetBrains Mono with tabular figures for all numeric values, currency, percentages, and dates.
- Chrome & Navigation: Dark sticky terminal header (`#070A10`) with emerald glowing pulse badge, product title "WealthPulse", Family Profile Switcher (`Household`, `Kanishk`, `Papa`), currency selector (`INR` / `USD`), and primary "Upload CAS" button. Navigation includes Overview, Holdings, Loans & Debt, Renewals Radar, and Insights.
- Core Financial Equation: True Net Worth = Total Gross Assets - Total Liabilities. The top metric strip displays Gross Assets, Total Liabilities, True Net Worth, and Monthly Cashflow (SIP Inflows vs EMI Outflows).
- Asset Categories:
  * Financial & Market Assets: Mutual Funds (seeded via CAS/manual, AMFI live NAV feed), Equities/Demat, RSUs (vested and unvested valuation).
  * Guaranteed & Retirement: EPFO (monthly employer/employee tracking), PPF (annual interest compounding), NPS, Fixed Deposits (with interest rate and maturity dates).
  * Tangible & Known Assets: Physical Real Estate (with Net Home Equity: Property Market Value minus Home Loan Principal Outstanding), Physical Gold & Sovereign Gold Bonds (SGBs with coupon tracking), Liquid Savings & Bank Accounts, Vehicles (depreciated/IDV valuation).
  * Private Receivables: Personal loan/investment with Shubham Jain (₹5,00,000 principal).
- Liabilities & Payoff Tracker:
  * Active Home Loan: Outstanding Principal, Interest Rate %, Monthly EMI, and auto-computed Debt-Free Date and Months Remaining using diminishing balance amortization.
  * Prepayment Simulator: Extra monthly top-up or annual lump-sum calculating years saved and interest saved.
  * Expandable Multi-Loan Support: Slots and modals to add Vehicle Loans, Education Loans, and Personal Loans.
- Protection & Renewals Radar: Separate tracking for Term Life and Health Insurance policies (protection coverage, not counted as asset value) alongside FD maturities and policy renewal deadlines with countdown badges.
- Exclusions: Do not include Elefant Money in v1.

Open:
- Data layer and schema for household profiles, asset holdings, loan accounts, and transaction records with full CRUD and seed data matching the user's portfolio.
- AMFI NAV lookup integration and simulated daily price movements.
- Interactive prepayment sliders, loan payoff amortization tables, and responsive mobile/tablet layouts derived from the desktop terminal design.
- Modal dialogs for CAS PDF upload, manual asset entry, and SIP skip/undo adjustments.

build a real working app, not a clickable prototype; the screen and kit files show layout, content and look (a wireframe's, structure only) and are never code to copy. The screens are the moments the user designed, not the whole product. Before building, walk through each flow as its user would and design what the pictures leave out, as a product designer would for this product: the steps a flow needs to finish and how the app responds to what the user does, including the moments its users will actually run into, like waiting on something or finding nothing yet. Add nothing a user of this product would never meet, and keep an app the user wants simple, simple. Never leave a step the product's core flows need as "coming soon", unless the brief says the user chose to. Where such a step needs an outside service, build every part up to it and say in your reply what's left to connect. Fill product gaps only, never a look the design set: an added step reuses the UI kit's tokens, chrome and parts and the nearest designed screen's layout, with no new visual direction. Look at every screen's picture before writing code; design.md says which picture or sheet holds each screen. Open the UI kit's shells and parts HTML for the header, tab bar, composer and components, not only its tokens. Use each finished screen's copy exactly as design.md lists it; never invent copy for one. A wireframe under design.md's Wireframes gives structure only: build it in the design's look, as design.md says. The screens' photos are placeholders for the mockups only: replace every photo design.md lists with the user's own upload for it, else as design.md says (a photo without people re-composed with imagegen--edit_image from it as a reference, a photo of people generated from its brief and never from the photo), and ship no set photo or its URL. Build and check each screen at the canvas it was drawn at: phone 393×764, tablet landscape 1133×744, tablet portrait 744×1133, desktop 1280×832. After building, screenshot the app at those sizes and states, compare each finished screen with its picture, and fix every visual difference you didn't choose; check a wireframe's screen against its structure, never its grey look. End your reply with "Changed from the mockups": each deliberate change and why, and "Added beyond the mockups": each step, state or interaction you built that no screen shows.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fe86315f-b609-4e95-b08e-e2d79ce91c45).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
