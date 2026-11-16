# Roadmap

## Stage 1 — multi-user households (done)

## Stage 2 — Detailed CAS import
- [ ] 1. Ownership: CAS upload asks for an editable profile; one statement = one profile
- [ ] 2. DB: cas_imports, mf_transactions (unique, same privacy as holdings), statement NAV/value + verified columns, AI quota, import_cas + reminder functions
- [ ] 3. 91-day lock per profile (UI + database), failed attempts don't count
- [ ] 4. Persistent "upload a CAS" prompt; "unverified" badge on manual funds
- [ ] 5. Deterministic CAMS/KFintech Detailed parser; reject Summary statements
- [ ] 6. AI fallback with PII redaction, 3 calls/user/day
- [ ] 7. Review table with app value vs statement value, >1% flags with acknowledgement
- [ ] 8. SIP detection + reconcile installments up to statement date; estimates after
- [ ] 9. NAV-missing fix (fall back to statement NAV/value, warning, pick scheme)
- [ ] 10. 3-month reminder notification on app load
- [ ] 11. Unit tests (synthetic statements) + database tests; keep existing tests passing
