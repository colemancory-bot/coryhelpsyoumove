# Review collection flow compliance (2026-04-24)

Background for the review-flow rule in `CLAUDE.md`.

The review flow (`review.html` + `supabase/functions/review-request/index.ts`) was rebuilt against Google's current review policies (Maps UGC "Prohibited & restricted content", April 2026 enforcement phase) and the FTC's October 2024 fake-reviews rule. The prior flow had six distinct violation patterns; all six are now removed.

**Policies in play:**
- Google: "Discourage or prohibit negative reviews, *or selectively solicit positive reviews* from customers."
- Google: Prohibits "Merchants requesting that staff solicit reviews that include specific content."
- Google: Reviews must "reflect a genuine experience" and not be "content that is not based on a real experience." April 2026 detection phase actively flags AI-generated / templated review content.
- FTC rule (Oct 2024): targets businesses that "only ask for reviews from people they think will leave positive ones." Fines up to $51,744 per violation.

**What was removed (violations in prior flow):**
1. **Star-gating branch** — `onRatingNext()` previously routed 5★ to public posting and 1–4★ to a private-only form. This was "selective solicitation" by Google's definition. Fix: one flow for every rating. Everyone sees the public posting links on the thank-you screen regardless of stars. Private feedback is no longer a branch; it's what happens automatically because every review lands in the moderation queue.
2. **`generateReview()` template generator** — Composed 3–4 sentence reviews from randomized arrays of openers, middles, standouts, and closings. Classic "content not based on real experience" + AI-generated pattern. Deleted entirely.
3. **Fallback standout text** — If reviewer left the textarea blank, the generator substituted phrases like "He made the whole process straightforward and stress-free." Reviewer could post a "review" they never wrote. Deleted with the generator.
4. **Suggestion chips** — 8 pre-written phrases ("Knew every neighborhood," "Local mountain home expert," etc.) that pasted into the textarea on click. "Influencing the contents of the review." Deleted.
5. **Auto-copy-to-clipboard on navigation** — Clicking "Post on Google" silently stuffed the clipboard. Replaced with a manual "Copy my review" button that the reviewer has to click themselves.
6. **SEO-coaching paragraph** — "Mentioning the town name, county, and whether you bought or sold helps search engines recommend Cory to other people." Telling reviewers what specific content to include is the same violation whether it's directed at staff or customers. Deleted.

**Also fixed:** `handleSubmit` previously set `is_published: rating === 5` to auto-publish 5-star reviews without moderation. Now every review lands with `is_published: false` and goes through admin approval. Businesses are allowed to curate their own testimonials page; the moderation queue is not review gating because it only affects the site's own testimonials widget, not whether the reviewer is invited to post on Google / Facebook / Yelp.

**What the new flow looks like:**
1. Email request (unchanged) — sent to every client after a closing.
2. Star rating selector (stars captured for internal testimonial display, not used to branch the flow).
3. Free-form textarea with neutral helper copy: "Reviews tend to be most useful when they describe what actually happened. The area you worked in, what the process was like, or specific details from the transaction are all worth mentioning. Write whatever feels right." No chips, no examples, no sentiment-leading prompts.
4. Thank-you screen shown to every reviewer regardless of rating: reviewer's own text is displayed, manual "Copy my review" button, public posting links for Google / Facebook / Yelp. No auto-copy. No star-based branching.
5. Review lands in moderation queue. Admin approves via existing dashboard before it appears on the public testimonials widget.

**Trade-offs Cory explicitly accepted:**
- 1–4 star reviewers now see the public posting links. In practice most self-select to private (industry data from Birdeye / Podium / SOCi consistently shows this), but the theoretical risk of a negative public review is the price of compliance.
- No more auto-publish of 5-star reviews to the site. Every review needs admin approval first.
- The template generator is gone. Cory has to trust clients to write in their own words. This is the entire point of the fix.
