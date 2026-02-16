# SaaS Product — Real Estate Agent Platform

**Goal:** Productize the website, CRM, IDX feed, and AI tools into a sellable platform for other real estate agents.
**Why:** Recurring revenue, no Zillow/FUB dependency for anyone, built by an agent who knows what agents actually need.

---

## The Product

An all-in-one platform for real estate agents that replaces:

| Replaces | Typical Cost | Our Platform |
|---|---|---|
| KVCore / Sierra / Lofty (website) | $300-500/mo | Included |
| Follow Up Boss (CRM) | $69-500/mo | Included |
| SimplyRETS / IDX Broker (IDX) | $50-100/mo | Included |
| Zillow Premier Agent (leads) | $300-1000/mo | Not needed — agents own their leads |
| Chatbot tools (Drift, etc.) | $50-100/mo | Included |

**What agents get:**
- Custom branded website with IDX search
- AI chatbot trained on their area and listings
- CRM with lead pipeline, notes, activity tracking
- Direct MLS feed (no middleman)
- AI agents for email/text → calendar automation
- Mobile-friendly PWA
- Full data ownership — their leads, their data, forever

---

## Pricing Model (draft)

### Option A — Setup + Monthly
- **One-time setup fee:** $1,500 - $3,000 (site build, branding, MLS connection, chatbot training)
- **Monthly:** $99 - $199/mo (hosting, AI usage, maintenance, support)

### Option B — Monthly Only
- **Monthly:** $199 - $399/mo (higher monthly, no upfront cost — lower barrier to entry)

### Option C — Tiered
| Tier | Monthly | Includes |
|---|---|---|
| **Starter** | $99/mo | Website + IDX + chatbot |
| **Pro** | $199/mo | Starter + CRM + lead capture |
| **Elite** | $349/mo | Pro + AI agents + calendar automation + priority support |

### Revenue Math
- 10 agents × $199/mo = $1,990/mo ($23,880/yr)
- 25 agents × $199/mo = $4,975/mo ($59,700/yr)
- 50 agents × $199/mo = $9,950/mo ($119,400/yr)
- 100 agents × $199/mo = $19,900/mo ($238,800/yr)

---

## Competitive Advantage

1. **Built by an agent, for agents** — not by a tech company guessing what agents need
2. **No Zillow** — agents keep 100% of their leads and data
3. **AI-native** — chatbot, AI agents, smart suggestions built in from day one
4. **Fraction of the cost** — replaces $500-1500/mo in tools with one $199/mo platform
5. **Customizable** — agents can request features, not wait and hope
6. **Direct MLS** — no SimplyRETS middleman, faster, better SEO
7. **Transparent** — agents can see exactly how their site works, no black box

---

## Technical Architecture (Multi-Tenant)

```
Agent A's site ──┐
Agent B's site ──┼──> Shared codebase (template)
Agent C's site ──┘         |
                           v
                    Per-agent Supabase project
                    (own database, own auth, own leads)
                           |
                           v
                    Per-agent MLS credentials
                    (their MLS, their feed)
```

### Per Agent:
- Own Supabase project (database, auth, storage)
- Own domain (agentname.com or subdomain)
- Own MLS credentials
- Own chatbot personality/training
- Own branding (colors, logo, photos, bio)

### Shared:
- Codebase / site template (deploy from master repo)
- CRM dashboard template
- Sync engine code
- AI chatbot infrastructure (shared Anthropic API key, per-agent system prompts)
- Monitoring and alerting system

---

## Onboarding Flow (per agent)

1. Agent signs up and provides: name, brokerage, license #, area, branding assets
2. We spin up their Supabase project
3. Deploy site template with their branding
4. Connect their MLS feed(s)
5. Configure chatbot personality for their area
6. Point their domain
7. Live in 1-2 weeks

---

## Build Phases

### Phase 1 — Prove It (Cory's site)
- [x] Website built and live
- [x] AI chatbot working
- [x] Lead capture flowing to Supabase
- [ ] CRM built (CRM-PLAN.md)
- [ ] Custom IDX feed (IDX-PLAN.md)
- [ ] AI agents (email/text/calendar)
- [ ] Document everything that works and what agents love

### Phase 2 — Template It
- [ ] Refactor codebase into a deployable template
- [ ] Create config file per agent (branding, area, MLS, chatbot personality)
- [ ] Build deployment script: new agent → new Supabase project → deploy site → connect MLS
- [ ] Create admin panel for managing all agent instances
- [ ] Build onboarding form / intake process

### Phase 3 — Sell It
- [ ] Landing page / marketing site for the platform
- [ ] Demo site that agents can play with
- [ ] Pricing page
- [ ] First 5 beta agents (friends, KW colleagues) — discounted or free
- [ ] Collect feedback, iterate
- [ ] Testimonials and case studies

### Phase 4 — Scale It
- [ ] Self-serve signup (automated provisioning)
- [ ] Stripe billing integration
- [ ] Support system (help docs, chat support)
- [ ] Agent referral program
- [ ] Team/brokerage plans (multiple agents under one account)
- [ ] Expand beyond Western NC — any market, any MLS

---

## Target Market

### Early Adopters
- Solo agents frustrated with Zillow and expensive tools
- Tech-savvy agents who want control over their online presence
- KW agents (Cory's network — warm intros)
- Agents in Western NC (Cory's market — easy to demo local results)

### Expansion
- Small teams (2-5 agents)
- Independent brokerages
- Agents in other markets (any US MLS)

---

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| MLS approval per agent | Each agent applies with their own license — standard process |
| Support burden at scale | Build great docs, automate monitoring, hire support help |
| Agents not tech-savvy | Make onboarding dead simple — we handle everything |
| Competition (KVCore, etc.) | Price advantage, customization, no Zillow, AI-native |
| Hosting costs at scale | Supabase free tier covers small agents; Pro tier is $25/mo per project |

---

## Monthly Costs Per Agent (estimated)

| Item | Cost |
|---|---|
| Supabase (Pro) | $25/mo |
| Domain (if we provide) | ~$1/mo |
| Anthropic API (chatbot) | $5-15/mo depending on usage |
| Hosting (GitHub Pages or Vercel) | Free - $20/mo |
| **Total cost per agent** | **~$30-60/mo** |
| **Charge per agent** | **$99-349/mo** |
| **Margin per agent** | **$40-300/mo** |

---

## Next Steps

1. Finish building Cory's platform (website, CRM, IDX, AI agents)
2. Use it daily — find what works, what's missing
3. Document the setup process
4. Pitch to 3-5 friendly agents as beta testers
5. Iterate based on feedback
6. Launch publicly
