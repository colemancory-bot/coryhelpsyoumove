```markdown
# Design System Specification: The Serene Professional

## 1. Overview & Creative North Star
**Creative North Star: "The Editorial Sanctuary"**

This design system rejects the frantic, high-density "dashboard-itis" common in real estate software. Instead, it draws inspiration from high-end architectural journals and premium physical stationery. Our goal is to transform a high-utility CRM into a calm, curated workspace that reduces cognitive load through **Soft Minimalism**. 

We achieve a signature look by breaking the rigid grid with intentional white space, high-contrast editorial typography, and "Tonal Layering." By replacing harsh lines with soft shifts in background values, we create an interface that feels less like a database and more like a sophisticated digital assistant.

---

## 2. Colors & Surface Philosophy

The palette is anchored in stability and trust, utilizing muted "Sage" and "Slate" tones to evoke a sense of calm under pressure.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning or containment. 
Structure is defined solely through background color shifts. For example, a dashboard widget should not have an outline; it should be a `surface-container-lowest` card sitting on a `surface` background. The eye perceives the boundary through the change in luminosity, not a hard stroke.

### Surface Hierarchy & Nesting
Treat the UI as a physical desk with stacked sheets of fine, semi-transparent paper.
*   **Base Layer (`surface` / `#f7f9fb`):** The primary canvas.
*   **Secondary Sections (`surface-container-low` / `#f0f4f7`):** Used for sidebar navigation or secondary content areas.
*   **Active Workspaces (`surface-container-lowest` / `#ffffff`):** Reserved for primary data cards and input areas to make them "pop" against the off-white base.
*   **Elevated Elements (`surface-container-highest` / `#dce4e8`):** Use for headers or sections that require immediate grounding.

### The "Glass & Gradient" Rule
To elevate the CRM above "standard SaaS" aesthetics, use Glassmorphism for floating navigation bars or modal overlays.
*   **Token Application:** Use `surface-variant` at 60% opacity with a `20px` backdrop blur.
*   **Signature Textures:** Apply a subtle linear gradient to Primary CTAs (from `primary` to `primary-dim`). This adds a "lithographic" depth that flat hex codes lack.

---

### 3. Typography: The Editorial Voice

We pair the geometric stability of **Manrope** for display with the high-utility legibility of **Inter** for data.

*   **Display & Headlines (Manrope):** Use `display-sm` through `headline-lg` for high-level metrics (e.g., "Total Pipeline Value"). The wide apertures of Manrope convey authority and modern luxury.
*   **Body & Labels (Inter):** All CRM data—client names, addresses, and notes—must use `body-md` or `body-lg`. Inter’s tall x-height ensures readability during long sessions.
*   **Hierarchy Tip:** Always use `on-surface-variant` (#596064) for labels (e.g., "Phone Number") and `on-surface` (#2c3437) for the actual data. This creates a clear visual path for the user’s eyes to scan.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through "Tonal Stacking."
1.  **Level 0:** `surface` (Background)
2.  **Level 1:** `surface-container-low` (Layout Grouping)
3.  **Level 2:** `surface-container-lowest` (The Card)

### Ambient Shadows
When an element must float (e.g., a "Create Lead" FAB), use an extra-diffused shadow:
*   **Blur:** 24px - 40px.
*   **Opacity:** 4% - 6%.
*   **Color:** Use a tinted shadow (`#4a6274` at 5% opacity) rather than grey. This makes the shadow feel like a natural light reflection of the "Slate" brand color.

### The "Ghost Border" Fallback
If a container lacks contrast (common in Dark Mode), use a "Ghost Border": `outline-variant` (#acb3b7) at **15% opacity**. Never use 100% opaque lines.

---

## 5. Component Guidelines

### Buttons (The "Soft Action" Pattern)
*   **Primary:** `primary` fill, `on-primary` text. Use `xl` (1.5rem) roundedness for a friendly, approachable feel.
*   **Secondary:** `primary-container` fill with `on-primary-container` text. No border.
*   **Tertiary:** Ghost style. No fill, no border. Use `primary` text weight 600.

### Input Fields
Avoid the "boxy" look. Use `surface-container-lowest` as the field background on a `surface` page. 
*   **Active State:** Instead of a thick border, use a 2px bottom-accent in `primary` or a subtle inner glow.
*   **Corner Radius:** Standardize on `DEFAULT` (0.5rem).

### Chips & Status Tags
Real estate status must be non-alarming.
*   **Leads:** `secondary-container` (Sage) with `on-secondary-container`.
*   **Hot Deals:** `tertiary-container` (Muted Purple) with `on-tertiary-container`.
*   **Closings:** `primary-container` (Slate) with `on-primary-container`.

### Cards & Lists (The "Breathable" List)
**Forbid divider lines.** Separate list items using the Spacing Scale:
*   Use `3` (1rem) vertical padding between items.
*   Use alternating background shifts (`surface` to `surface-container-low`) for long data tables to maintain row tracking without "grid-wire" visual fatigue.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Asymmetry:** Place a large `display-md` headline on the left with significant white space (`16` / 5.5rem) to the right to create an editorial feel.
*   **Use Generous Line Heights:** For `body-md`, use a line-height of 1.6 to ensure long property descriptions remain legible.
*   **Soft Transitions:** Animate surface color changes over 200ms to maintain the "calm" atmosphere.

### Don’t:
*   **No Pure Black:** Never use #000000. It causes high ocular strain. Use `on-surface` for text and `inverse-surface` for dark mode bases.
*   **No "Safety Orange" or "Neon Red":** Even for errors, use the sophisticated `error` (#a83836) which feels like an architectural "brick" tone rather than a digital alarm.
*   **No Crowding:** If a view feels "full," increase the spacing scale rather than adding borders to separate elements. Space is a functional component, not a luxury.