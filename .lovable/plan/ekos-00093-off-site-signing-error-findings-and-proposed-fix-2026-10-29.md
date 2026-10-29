# EKOS-00093 off-site signing error – findings and proposed fix

Investigation only so far. No code changes, no emails, nothing published. Email test mode stays ON.

## 1. Where the error comes from
`validateSigningWrite` in `src/lib/forms/write-validation.ts` (line 92) runs when the customer presses Submit on the signing link. It checks each signing box the page sends. If a box is currently **hidden** (its show rule says no), the server refuses the whole signature with "Only the visible signing details can be changed through this link." The check refuses hidden boxes even when their value has not changed.

## 2. What is tripping it on EKOS-00093
The submission is a Reservation, status "In Review (Offsite)". It has a valid, unused `customer_offsite` token that expires 27 Jan 2027. Its saved answers include:
- `customer_one_date` = 2026-10-29
- `customer_two_date` = 2026-10-29
- no `second_customer` answer

The "Customer Two Date of signing" box fills in today's date automatically. That automatic date is added to every date box with that setting, including hidden ones. It happened when the rep saved the form, and it happens again when the signing page loads. The signing page then sends **every** customer-signature box, visible or not (`src/routes/sign.$token.tsx`, line 158). The Customer Two boxes only show when "Is there a second customer?" = Yes. So when Sadie picks No, or leaves it blank, the hidden `customer_two_date` still goes to the server, and the server refuses it.

This is not about Castle View or anything park-specific. Any off-site Reservation with no second customer will hit this. A signer who answers "Yes" gets through.

## 3. Was today's change (0b5022f) the cause?
No. That change only touched the copying of answers from earlier forms (`prefill.ts`, `ekos.functions.ts`, one NHO field, one email line). It did not touch the signing page, the automatic date, or this check. The check dates from 18 Oct, and the automatic hidden date was there before that.

## 4. Smallest safe fix
Both parts below keep the protection: a signer still cannot change any box they cannot see, and still cannot touch anything outside the signing section.
- **Server (`validateSigningWrite`):** if a hidden signing box is sent with its value **unchanged** from what is saved (or empty), ignore it: don't save it and don't reject. Still reject if a hidden box is sent with a **different** value.
- **Signing page (`sign.$token.tsx`):** only send signing boxes that are currently visible, so hidden automatic dates are never sent.
- **Optional extra:** the hidden `customer_two_date` is unchanged on the server, so with the fix the signature goes through for this sale. One edge case: if the customer's browser date is a different day from the saved date, the date counts as changed. The signing-page part of the fix covers that. Existing data can stay as it is.

## Other forms' signing links
The same pattern (hidden box with an automatic date, or a second-person box behind Yes/No) also exists on the Written Statement: the occupier 2 boxes and the second witness date. The Construction and Director signing links use the same check. The two-part fix is in shared code, so it covers every form's signing link. NHO and Unit Sale Agreement customer-signature boxes will be checked for the same pattern during the fix, and tests will cover them.

## Tests to add
- Reservation off-site, second customer = No, with a hidden pre-filled Customer Two date: signing succeeds, and Customer Two values are not saved.
- A hidden box sent with a **changed** value is still refused.
- A box outside the signing section is still refused.
- Written Statement: the same no-second-occupier case.
- Run the full test suite. Then sign EKOS-00093 on preview only if you approve. That sends a test-mode email to the test recipients only.
