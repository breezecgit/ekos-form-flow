# Answers: Chris Harris and amendments on the dashboard (nothing changed)

## 1. Where Chris Harris still appears

| Place | Found? | Detail |
|---|---|---|
| Sales Person dropdown (app code) | Removed | Already done earlier |
| Admin, Settings, Sales people list (database) | **Yes, still active** | "Chris Harris, chris.harris@ekosgroup.co.uk", marked active |
| Rep notification emails | **Yes, possible** | The app looks up the sales person's email in that Settings list to notify the rep. If a form still has Chris Harris as Sales Person, he would be the intended recipient. Test mode blocks this for now; after go-live it would go to him. No email has ever been addressed to him (email log: 0) |
| Park rep and manager assignments | No | No park has him as rep or manager |
| Other settings | No | Not mentioned in any setting |
| User accounts / profiles | No | No profile with his name or email, so no app login was ever set up for him |
| Roles / permissions | No | None for him |
| Sales and in-progress forms | No | No sale or form (draft or completed) has him as Sales Person |
| Other code, defaults, seed data | No | The only "Harris" match is "Daniel Harrison-Cox" in Reservation text, which is a different person |

**Login:** he has no account and cannot get into the app. Public sign-up is turned off, so he cannot create one.

**Suggested fix (needs your OK):** remove him from Admin, Settings, Sales people. You or Sadie can do this on that screen, or I can do it. This also ends any chance of rep emails going to him.

## 2. How amendments show on the dashboard

**Today the dashboard and tracker don't show amendments at all.** When an amendment is in progress, the form stays "Completed" and the sale stays wherever it already was. There's no sign that it's being amended. Amendments only appear on the form's own detail page (the Amendments panel).

**What the dashboard has now (Sadie's view):**
1. Filter bar (park, from and to dates)
2. Four totals boxes: Total Sales in Process, Total Sales Complete, Total Orders, Average Sale Completion
3. Park goals chart
4. Park value chart
5. Incomplete Actions, Needs Your Review (Director only)
6. Orders in Process, counted by form stage

Reps see the same, minus box 5.

**Emma's rule (amended sales stay in their existing section, no 6th box) already works.** Nothing needs changing for that.

**Optional extra (only if wanted):** add a small "Amendment in progress" tag next to the Completed status on the tracker and dashboard. It would sit in the same row and section, with no new box. It would use the shared status display, so the tracker and dashboard stay the same. Say if you'd like it.
