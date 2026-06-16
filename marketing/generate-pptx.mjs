import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Try global install path
let PptxGenJS;
try {
  PptxGenJS = (await import("pptxgenjs")).default;
} catch {
  // Fallback: try requiring from global npm path
  const mod = require("pptxgenjs");
  PptxGenJS = mod.default || mod;
}

const pptx = new PptxGenJS();

// Design tokens
const BG = "0C0B09";
const CREAM = "F5F0E8";
const GOLD = "C4B08C";
const DARK_GOLD = "9A8A6A";
const DIM = "8A8578";
const CARD_BG = "1A1815";
const BORDER = "2A2620";

// Font choices
const TITLE_FONT = "Georgia";
const BODY_FONT = "Calibri";

// Presentation settings
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pptx.author = "Cory Coleman";
pptx.company = "Keller Williams Great Smokies";
pptx.title = "Residential Listing Presentation";

// Helper: create a slide with standard dark background and optional gold top bar
function makeSlide(opts = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: BG };
  // Subtle gold line at top
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.04, fill: { color: GOLD },
  });
  return slide;
}

// Helper: add slide title
function addTitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x || 0.7,
    y: opts.y || 0.35,
    w: opts.w || 11.93,
    h: 0.6,
    fontSize: opts.fontSize || 36,
    fontFace: TITLE_FONT,
    color: CREAM,
    bold: true,
    align: "left",
  });
}

// Helper: add a stat callout block
function addStat(slide, number, label, source, x, y, w) {
  slide.addText(number, {
    x, y, w, h: 0.65,
    fontSize: 44,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
    align: "left",
  });
  slide.addText(label, {
    x, y: y + 0.6, w, h: 0.45,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: CREAM,
    align: "left",
    lineSpacingMultiple: 1.1,
  });
  slide.addText(source, {
    x, y: y + 1.0, w, h: 0.35,
    fontSize: 9,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
    align: "left",
  });
}

// Helper: add body text
function addBody(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x, y, w, h,
    fontSize: opts.fontSize || 15,
    fontFace: BODY_FONT,
    color: opts.color || CREAM,
    align: opts.align || "left",
    lineSpacingMultiple: opts.lineSpacing || 1.4,
    valign: opts.valign || "top",
    ...(opts.bullet ? { bullet: opts.bullet } : {}),
  });
}

// Helper: add speaker notes
function addNotes(slide, text) {
  slide.addNotes(text);
}

// ============================================================
// SLIDE 1: Opening
// ============================================================
{
  const slide = pptx.addSlide();
  slide.background = { color: BG };

  // Large centered gold accent shape
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 5.4, y: 1.0, w: 2.5, h: 0.06, fill: { color: GOLD },
  });

  slide.addText("RESIDENTIAL\nLISTING PRESENTATION", {
    x: 1.0, y: 1.4, w: 11.33, h: 2.0,
    fontSize: 48,
    fontFace: TITLE_FONT,
    color: CREAM,
    bold: true,
    align: "center",
    lineSpacingMultiple: 1.3,
  });

  slide.addText("Cory Coleman", {
    x: 1.0, y: 3.6, w: 11.33, h: 0.6,
    fontSize: 26,
    fontFace: TITLE_FONT,
    color: GOLD,
    align: "center",
  });

  slide.addText("Keller Williams Great Smokies", {
    x: 1.0, y: 4.15, w: 11.33, h: 0.5,
    fontSize: 16,
    fontFace: BODY_FONT,
    color: DIM,
    align: "center",
  });

  slide.addText("96 W Sylva Shopping Area, Sylva, NC 28779  |  (828) 506-6413", {
    x: 1.0, y: 4.65, w: 11.33, h: 0.4,
    fontSize: 12,
    fontFace: BODY_FONT,
    color: DIM,
    align: "center",
  });

  // Bottom gold line
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 5.4, y: 5.4, w: 2.5, h: 0.06, fill: { color: GOLD },
  });

  addNotes(slide, "Thank you for the opportunity to interview for the job of helping you sell your home. My job as your real estate broker is to make as many qualified buyers aware of your property, get them through your door, and help them make a commitment to buy. So thank you for giving me that chance today.");
}

// ============================================================
// SLIDE 2: About Me & My Team
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "About Me & My Team");

  // Left column - info card
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 1.3, w: 5.5, h: 4.8,
    fill: { color: CARD_BG },
    rectRadius: 0.1,
  });

  slide.addText("Cory Coleman", {
    x: 1.1, y: 1.6, w: 4.7, h: 0.5,
    fontSize: 24,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText("Broker, Keller Williams Great Smokies", {
    x: 1.1, y: 2.1, w: 4.7, h: 0.35,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: DIM,
  });

  slide.addText("Based in Sylva, NC", {
    x: 1.1, y: 2.55, w: 4.7, h: 0.35,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: CREAM,
  });

  // Separator
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 1.1, y: 3.1, w: 4.3, h: 0.02, fill: { color: BORDER },
  });

  const towns = [
    "Waynesville", "Sylva", "Bryson City",
    "Maggie Valley", "Franklin", "Cashiers",
    "Highlands", "Dillsboro", "Cullowhee"
  ];

  slide.addText("Serving 9 Western NC Communities", {
    x: 1.1, y: 3.3, w: 4.7, h: 0.35,
    fontSize: 13,
    fontFace: BODY_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText(towns.join("  \u2022  "), {
    x: 1.1, y: 3.7, w: 4.7, h: 0.8,
    fontSize: 12,
    fontFace: BODY_FONT,
    color: CREAM,
    lineSpacingMultiple: 1.5,
  });

  slide.addText("Haywood, Jackson, Macon & Swain Counties", {
    x: 1.1, y: 4.5, w: 4.7, h: 0.35,
    fontSize: 12,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  // Right column - key message
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.8, y: 1.3, w: 5.83, h: 4.8,
    fill: { color: CARD_BG },
    rectRadius: 0.1,
  });

  slide.addText("You'll Work Directly With Me", {
    x: 7.2, y: 1.8, w: 5.03, h: 0.5,
    fontSize: 22,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText(
    "I'm the person you'll interact with at every step.\n\n" +
    "Behind the scenes, my team handles documents, marketing coordination, and transaction management.\n\n" +
    "You'll meet them as we move through the process.",
    {
      x: 7.2, y: 2.5, w: 5.03, h: 3.2,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
      lineSpacingMultiple: 1.5,
      valign: "top",
    }
  );

  addNotes(slide, "I don't work alone. I'm part of a small team. I'm the person you'll interact with directly, but I have support behind the scenes handling documents, marketing coordination, and transaction management. You'll meet them as we move through the process.");
}

// ============================================================
// SLIDE 3: Choose the Agent, Not the Brokerage
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Choose the Agent, Not the Brokerage");

  // Central message - large quote style
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 1.5, y: 1.5, w: 10.33, h: 4.5,
    fill: { color: CARD_BG },
    rectRadius: 0.1,
  });

  // Large opening quote mark
  slide.addText("\u201C", {
    x: 1.8, y: 1.4, w: 1.0, h: 1.0,
    fontSize: 72,
    fontFace: TITLE_FONT,
    color: GOLD,
  });

  slide.addText(
    "The brokerage name on the sign isn't the one negotiating on your behalf, communicating with you, or creating your marketing.",
    {
      x: 2.3, y: 2.0, w: 8.73, h: 1.2,
      fontSize: 20,
      fontFace: TITLE_FONT,
      color: CREAM,
      italic: true,
      lineSpacingMultiple: 1.4,
    }
  );

  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 2.3, y: 3.4, w: 3.0, h: 0.03, fill: { color: GOLD },
  });

  slide.addText(
    "When a buyer searches for a home, they're not filtering by brokerage.\nThey're looking at the property.\n\nChoose the person you trust to do the work.",
    {
      x: 2.3, y: 3.7, w: 8.73, h: 1.8,
      fontSize: 16,
      fontFace: BODY_FONT,
      color: CREAM,
      lineSpacingMultiple: 1.5,
    }
  );

  addNotes(slide, "One thing I always tell sellers: choose the agent who you believe will best represent you, not the brokerage name on the sign. Whether it's Keller Williams, Coldwell Banker, or RE/MAX, that brokerage isn't the one negotiating on your behalf, communicating with you, or creating your marketing. And when a buyer is searching for a home, they're not filtering by brokerage. They're looking at the property. So choose the person you trust to do the work.");
}

// ============================================================
// SLIDE 4: What Every Agent Does
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "What Every Agent Does");

  slide.addText("The standard services any licensed agent will provide:", {
    x: 0.7, y: 1.2, w: 11.93, h: 0.4,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  const items = [
    "Help you through listing documents",
    "Install a lockbox",
    "Enter your property in the MLS",
    "Field phone calls and schedule showings",
    "Coordinate through closing",
  ];

  items.forEach((item, i) => {
    const y = 1.9 + i * 0.7;
    // Number circle
    slide.addShape(pptx.shapes.OVAL, {
      x: 1.2, y: y, w: 0.4, h: 0.4,
      fill: { color: CARD_BG },
      line: { color: GOLD, width: 1.5 },
    });
    slide.addText(`${i + 1}`, {
      x: 1.2, y: y, w: 0.4, h: 0.4,
      fontSize: 13,
      fontFace: BODY_FONT,
      color: GOLD,
      bold: true,
      align: "center",
      valign: "middle",
    });
    slide.addText(item, {
      x: 1.85, y: y, w: 8.0, h: 0.4,
      fontSize: 16,
      fontFace: BODY_FONT,
      color: CREAM,
      valign: "middle",
    });
  });

  // Bottom emphasis
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 5.7, w: 11.93, h: 0.9,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });
  slide.addText("Now let's talk about what we do above and beyond.", {
    x: 1.0, y: 5.7, w: 11.33, h: 0.9,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    italic: true,
    align: "center",
    valign: "middle",
  });

  addNotes(slide, "Before I get into what I do differently, let me acknowledge what every licensed agent is going to do for you.\n\nEvery agent will do these things. Some better than others. But I don't want to spend your time going over what's standard. I want to talk about what we do above and beyond this list. Sound good?");
}

// ============================================================
// SLIDE 5: Professional Photography
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Professional Photography");

  slide.addText("The first showing happens online.", {
    x: 0.7, y: 1.15, w: 11.93, h: 0.4,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  // 2x2 stat grid
  const stats = [
    { num: "32%", label: "Faster Sale", sub: "89 vs 123 days on market", src: "Source: Real Estate Exposures" },
    { num: "47%", label: "Higher Asking Price/SqFt", sub: "Compared to cell phone photos", src: "Source: Redfin / PR Newswire" },
    { num: "118%", label: "More Online Views", sub: "vs. non-professional listings", src: "Source: Redfin Study" },
    { num: "$934 - $116K", label: "Higher Sale Price", sub: "Over comparable low-quality listings", src: "Source: PhotoUp / Redfin" },
  ];

  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 6.3;
    const y = 1.8 + row * 2.5;

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w: 5.8, h: 2.1,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(s.num, {
      x: x + 0.3, y: y + 0.2, w: 5.2, h: 0.7,
      fontSize: 38,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(s.label, {
      x: x + 0.3, y: y + 0.85, w: 5.2, h: 0.35,
      fontSize: 15,
      fontFace: BODY_FONT,
      color: CREAM,
      bold: true,
    });

    slide.addText(s.sub, {
      x: x + 0.3, y: y + 1.2, w: 5.2, h: 0.3,
      fontSize: 12,
      fontFace: BODY_FONT,
      color: DIM,
    });

    slide.addText(s.src, {
      x: x + 0.3, y: y + 1.55, w: 5.2, h: 0.3,
      fontSize: 9,
      fontFace: BODY_FONT,
      color: DIM,
      italic: true,
    });
  });

  addNotes(slide, "For us, it all starts with professional photography. And here's why this matters more than most people realize.\n\nIt blows my mind that over half of all listings in our MLS are photographed with a cell phone. The camera on your phone is fine for texting your friends, but it's not going to capture the lighting, angles, and composition that makes a buyer stop scrolling and click on your listing. The first showing happens online. If the pictures don't stop someone mid-scroll, they're never coming to see your home in person.\n\nWe hire a professional real estate photographer. That's all they do. We'll take every room with multiple lighting setups because every room in your house has different light. We typically shoot 100-250 photos and select the best 25-40 for the listing.");
}

// ============================================================
// SLIDE 6: Professional Video
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Professional Video");

  slide.addText("A narrated walkthrough that tells the story of your home.", {
    x: 0.7, y: 1.15, w: 11.93, h: 0.4,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  // 3 stat cards in a row
  const stats = [
    { num: "403%", label: "More Inquiries", sub: "Listings with video vs. without", src: "Source: NAR" },
    { num: "73%", label: "Of Homeowners", sub: "Prefer agents who use video", src: "Source: NAR Profile of Buyers & Sellers" },
    { num: "Only 38%", label: "Of Agents Use Video", sub: "This puts you ahead of 62% of listings", src: "Source: NAR Technology Survey" },
  ];

  stats.forEach((s, i) => {
    const x = 0.7 + i * 4.1;
    const y = 1.9;

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w: 3.7, h: 2.8,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(s.num, {
      x: x + 0.3, y: y + 0.3, w: 3.1, h: 0.7,
      fontSize: 40,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(s.label, {
      x: x + 0.3, y: y + 1.0, w: 3.1, h: 0.4,
      fontSize: 15,
      fontFace: BODY_FONT,
      color: CREAM,
      bold: true,
    });

    slide.addText(s.sub, {
      x: x + 0.3, y: y + 1.45, w: 3.1, h: 0.5,
      fontSize: 12,
      fontFace: BODY_FONT,
      color: DIM,
      lineSpacingMultiple: 1.3,
    });

    slide.addText(s.src, {
      x: x + 0.3, y: y + 2.1, w: 3.1, h: 0.35,
      fontSize: 9,
      fontFace: BODY_FONT,
      color: DIM,
      italic: true,
    });
  });

  // Bottom message
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 5.2, w: 11.93, h: 1.3,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Not a slideshow with music. A professionally shot, narrated walkthrough\nwith a full script highlighting the features that matter most.", {
    x: 1.0, y: 5.2, w: 11.33, h: 1.3,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: CREAM,
    align: "center",
    valign: "middle",
    lineSpacingMultiple: 1.4,
  });

  addNotes(slide, "On top of photography, we produce a narrated property video.\n\nThis isn't a slideshow with music. This is a professionally shot, narrated walkthrough that tells the story of your home. I'll have a full script prepared ahead of time highlighting the features that matter most to buyers in this market.\n\n[Show example video from a similar property]");
}

// ============================================================
// SLIDE 7: Drone Photography & Video
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Drone Photography & Video");

  slide.addText("In Western NC, aerial imagery matters even more.", {
    x: 0.7, y: 1.15, w: 11.93, h: 0.4,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  const stats = [
    { num: "68%", label: "Faster Sale", sub: "Listings with aerial imagery", src: "Source: MLS data / Inman" },
    { num: "83%", label: "Of Sellers Prefer It", sub: "Want an agent who uses drones", src: "Source: NAR Technology Survey" },
    { num: "5-10%", label: "Higher Sale Price", sub: "Properties with aerial video", src: "Source: HomeTrack / Augi Drones" },
  ];

  stats.forEach((s, i) => {
    const x = 0.7 + i * 4.1;
    const y = 1.9;

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w: 3.7, h: 2.8,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(s.num, {
      x: x + 0.3, y: y + 0.3, w: 3.1, h: 0.7,
      fontSize: 40,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(s.label, {
      x: x + 0.3, y: y + 1.0, w: 3.1, h: 0.4,
      fontSize: 15,
      fontFace: BODY_FONT,
      color: CREAM,
      bold: true,
    });

    slide.addText(s.sub, {
      x: x + 0.3, y: y + 1.45, w: 3.1, h: 0.5,
      fontSize: 12,
      fontFace: BODY_FONT,
      color: DIM,
      lineSpacingMultiple: 1.3,
    });

    slide.addText(s.src, {
      x: x + 0.3, y: y + 2.1, w: 3.1, h: 0.35,
      fontSize: 9,
      fontFace: BODY_FONT,
      color: DIM,
      italic: true,
    });
  });

  // What drone shows
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 5.2, w: 11.93, h: 1.3,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Views  \u2022  Acreage  \u2022  Creek Frontage  \u2022  Road Access  \u2022  Proximity to Landmarks", {
    x: 1.0, y: 5.2, w: 11.33, h: 0.5,
    fontSize: 16,
    fontFace: BODY_FONT,
    color: GOLD,
    align: "center",
    valign: "middle",
  });

  slide.addText("Features you simply cannot capture from the ground.", {
    x: 1.0, y: 5.7, w: 11.33, h: 0.7,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: CREAM,
    align: "center",
    valign: "middle",
  });

  addNotes(slide, "We also include aerial drone photography and video with every listing.\n\nIn Western NC, this matters even more than in a typical market. Mountain properties have views, acreage, creek frontage, road access, and proximity to landmarks that you simply cannot capture from the ground. Drone footage shows buyers the full picture of what they're getting.");
}

// ============================================================
// SLIDE 8: Floor Plans
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Floor Plans");

  slide.addText("The #1 most desired listing feature after photos.", {
    x: 0.7, y: 1.15, w: 11.93, h: 0.4,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  const stats = [
    { num: "#1", label: "Most Desired Feature", sub: "By consumers, after photos", src: "Source: 2025 NAR Homebuyers & Sellers Survey" },
    { num: "93%", label: "Of Buyers", sub: "More likely to engage with a listing that has a floor plan", src: "Source: Rightmove / CubiCasa" },
    { num: "52%", label: "More Click-Throughs", sub: "On listings with floor plans", src: "Source: Rightmove Study" },
    { num: "50%", label: "Reduced Time on Market", sub: "Up to 50% faster with floor plans", src: "Source: mov8 Real Estate" },
  ];

  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 6.3;
    const y = 1.8 + row * 2.5;

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w: 5.8, h: 2.1,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(s.num, {
      x: x + 0.3, y: y + 0.2, w: 5.2, h: 0.7,
      fontSize: 38,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(s.label, {
      x: x + 0.3, y: y + 0.85, w: 5.2, h: 0.35,
      fontSize: 15,
      fontFace: BODY_FONT,
      color: CREAM,
      bold: true,
    });

    slide.addText(s.sub, {
      x: x + 0.3, y: y + 1.2, w: 5.2, h: 0.3,
      fontSize: 12,
      fontFace: BODY_FONT,
      color: DIM,
    });

    slide.addText(s.src, {
      x: x + 0.3, y: y + 1.55, w: 5.2, h: 0.3,
      fontSize: 9,
      fontFace: BODY_FONT,
      color: DIM,
      italic: true,
    });
  });

  addNotes(slide, "Every listing also gets a labeled floor plan with room dimensions.\n\nBuyers want to know if their furniture will fit, how the rooms flow, and whether the layout works for them before they even schedule a showing. We give them that information upfront.");
}

// ============================================================
// SLIDE 9: Single Property Website
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Single Property Website");

  // Central card
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 1.5, y: 1.5, w: 10.33, h: 4.8,
    fill: { color: CARD_BG },
    rectRadius: 0.1,
  });

  slide.addText("Every listing gets its own dedicated website.", {
    x: 2.0, y: 1.8, w: 9.33, h: 0.6,
    fontSize: 22,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 2.0, y: 2.5, w: 3.0, h: 0.03, fill: { color: GOLD },
  });

  const features = [
    "Narrated property video",
    "Full photo gallery",
    "Interactive floor plan",
    "Disclosure documents",
    "Area maps & neighborhood info",
    "All listing details in one place",
  ];

  features.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 2.0 + col * 4.5;
    const y = 2.9 + row * 0.65;

    slide.addText("\u2713", {
      x, y, w: 0.3, h: 0.4,
      fontSize: 16,
      fontFace: BODY_FONT,
      color: GOLD,
      bold: true,
    });
    slide.addText(f, {
      x: x + 0.35, y, w: 3.8, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
      valign: "middle",
    });
  });

  slide.addText("Easily shareable. One link gives potential buyers everything they need.", {
    x: 2.0, y: 5.1, w: 9.33, h: 0.6,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  addNotes(slide, "Every listing gets its own dedicated property website.\n\nThis is a full page on our website with the video, all photos, floor plan, disclosures, area maps, and all listing details. The website is easily shareable. If your neighbor has a friend looking to move to the area, they just share the link and that person has everything they need in one place.");
}

// ============================================================
// SLIDE 10: Social Media & Digital Marketing
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Social Media & Digital Marketing");

  // Left: Digital stats
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 1.3, w: 5.8, h: 3.0,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Digital Campaign", {
    x: 1.0, y: 1.5, w: 5.2, h: 0.4,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText("157%", {
    x: 1.0, y: 2.1, w: 5.2, h: 0.7,
    fontSize: 44,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText("Increase in organic traffic with video on website", {
    x: 1.0, y: 2.75, w: 5.2, h: 0.4,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: CREAM,
  });

  slide.addText("Source: NAR", {
    x: 1.0, y: 3.15, w: 5.2, h: 0.3,
    fontSize: 9,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  slide.addText("Facebook  \u2022  Instagram  \u2022  YouTube", {
    x: 1.0, y: 3.6, w: 5.2, h: 0.4,
    fontSize: 13,
    fontFace: BODY_FONT,
    color: DIM,
  });

  // Right: Postcard strategy
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.8, y: 1.3, w: 5.83, h: 3.0,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Neighborhood Postcards", {
    x: 7.1, y: 1.5, w: 5.23, h: 0.4,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText("250-300", {
    x: 7.1, y: 2.1, w: 5.23, h: 0.7,
    fontSize: 44,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText("Homes receive a postcard with QR code\nlinking to your property website", {
    x: 7.1, y: 2.75, w: 5.23, h: 0.6,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: CREAM,
    lineSpacingMultiple: 1.3,
  });

  // Bottom stat
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 4.7, w: 11.93, h: 1.8,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("10%", {
    x: 1.0, y: 4.9, w: 2.5, h: 0.7,
    fontSize: 44,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText("of home buyers purchase because they know someone\nalready living in that area.", {
    x: 3.5, y: 4.9, w: 8.5, h: 0.7,
    fontSize: 16,
    fontFace: BODY_FONT,
    color: CREAM,
    valign: "middle",
    lineSpacingMultiple: 1.3,
  });

  slide.addText("Source: NAR Profile of Home Buyers and Sellers", {
    x: 3.5, y: 5.6, w: 8.5, h: 0.3,
    fontSize: 9,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  addNotes(slide, "That video we talked about becomes the centerpiece of a social media marketing campaign across Facebook, Instagram, and YouTube.\n\nWe also send a postcard to 250-300 homes in your surrounding neighborhood. Each postcard has a QR code that links directly to your property website.\n\nAbout 10% of home buyers purchase because they know someone already living in that area. So if your neighbor Billy has a cousin looking to move out here, Billy scans that QR code, shares the link, and now we've got another potential buyer who might never have found your listing otherwise.");
}

// ============================================================
// SLIDE 11: Proactive Agent Outreach
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Proactive Agent Outreach");

  slide.addText("We don't just list and wait.", {
    x: 0.7, y: 1.15, w: 11.93, h: 0.4,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  // Two benefit cards
  const benefits = [
    {
      title: "Create Pre-Market Demand",
      desc: "Top buyer's agents in your area are contacted before your listing goes live, creating buzz and excitement from day one.",
    },
    {
      title: "Make Agents Look Good",
      desc: "Buyer's agents can tell their clients they have inside access to an upcoming listing. That makes them look proactive and brings more eyes to your property.",
    },
  ];

  benefits.forEach((b, i) => {
    const x = 0.7 + i * 6.3;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.9, w: 5.8, h: 3.5,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(`0${i + 1}`, {
      x: x + 0.4, y: 2.2, w: 1.5, h: 0.6,
      fontSize: 36,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(b.title, {
      x: x + 0.4, y: 2.9, w: 5.0, h: 0.5,
      fontSize: 18,
      fontFace: TITLE_FONT,
      color: CREAM,
      bold: true,
    });

    slide.addShape(pptx.shapes.RECTANGLE, {
      x: x + 0.4, y: 3.5, w: 2.0, h: 0.02, fill: { color: GOLD },
    });

    slide.addText(b.desc, {
      x: x + 0.4, y: 3.7, w: 5.0, h: 1.3,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
      lineSpacingMultiple: 1.5,
    });
  });

  addNotes(slide, "I don't just list your home and wait for the phone to ring. I actively contact the highest-performing buyer's agents in your area before your listing goes live.\n\nThis does two things. First, it creates demand and excitement before you're even on the market. Second, it makes those agents look good to their clients because they can say 'I've got the inside scoop on a property coming to market next week.' We're building buzz before day one.");
}

// ============================================================
// SLIDE 12: Open House Strategy
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Open House Strategy");

  // Stats row
  const stats = [
    { num: "50%", label: "of buyers attend open houses during their search", src: "Source: NAR Profile of Buyers & Sellers" },
    { num: "37%", label: "of buyers attended an open house for the home they purchased", src: "Source: NAR data analysis" },
  ];

  stats.forEach((s, i) => {
    const x = 0.7 + i * 6.3;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.3, w: 5.8, h: 2.4,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(s.num, {
      x: x + 0.4, y: 1.55, w: 5.0, h: 0.7,
      fontSize: 44,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(s.label, {
      x: x + 0.4, y: 2.25, w: 5.0, h: 0.6,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
      lineSpacingMultiple: 1.3,
    });

    slide.addText(s.src, {
      x: x + 0.4, y: 2.85, w: 5.0, h: 0.3,
      fontSize: 9,
      fontFace: BODY_FONT,
      color: DIM,
      italic: true,
    });
  });

  // Our approach
  slide.addText("Our Open House Approach", {
    x: 0.7, y: 4.1, w: 11.93, h: 0.4,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  const items = [
    "Advertised on social media, all major real estate websites, and MLS",
    "Personally screening every visitor who comes through",
    "Neighbors welcome. They may know someone looking to move to the area.",
  ];

  items.forEach((item, i) => {
    slide.addText("\u2713", {
      x: 1.0, y: 4.7 + i * 0.55, w: 0.3, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: GOLD,
    });
    slide.addText(item, {
      x: 1.4, y: 4.7 + i * 0.55, w: 10.5, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
    });
  });

  addNotes(slide, "If you're open to it, I'd love to do an open house.\n\nWe advertise the open house on social media, all major real estate websites, and through the MLS. I'll be there personally screening everyone who comes through. And yes, sometimes nosy neighbors show up. That's not always a bad thing, because if they love it and know someone looking to move to the area, that's another potential buyer.");
}

// ============================================================
// SLIDE 13: Getting Your Home Ready
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Getting Your Home Ready");

  // Left: process
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 1.3, w: 5.8, h: 5.3,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Room-by-Room Checklist", {
    x: 1.0, y: 1.55, w: 5.2, h: 0.4,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  const prep = [
    "Deep cleaning throughout",
    "Minor staging with your own furniture",
    "Small touch-ups and repairs",
    "Declutter and depersonalize",
    "Detailed email checklist provided",
    "Room-by-room with deadlines",
  ];

  prep.forEach((p, i) => {
    slide.addText("\u2713", {
      x: 1.2, y: 2.2 + i * 0.6, w: 0.3, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: GOLD,
    });
    slide.addText(p, {
      x: 1.6, y: 2.2 + i * 0.6, w: 4.5, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
    });
  });

  // Right: staging stats
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.8, y: 1.3, w: 5.83, h: 5.3,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Staging Impact", {
    x: 7.1, y: 1.55, w: 5.23, h: 0.4,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  const stagingStats = [
    { num: "1-10%", label: "Increase in offer price with staging", src: "Source: 2025 NAR Profile of Home Staging" },
    { num: "49%", label: "Of seller's agents saw reduced time on market", src: "Source: NAR 2025 Home Staging Report" },
  ];

  stagingStats.forEach((s, i) => {
    const y = 2.2 + i * 1.7;
    slide.addText(s.num, {
      x: 7.3, y, w: 5.0, h: 0.6,
      fontSize: 36,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });
    slide.addText(s.label, {
      x: 7.3, y: y + 0.55, w: 5.0, h: 0.35,
      fontSize: 13,
      fontFace: BODY_FONT,
      color: CREAM,
    });
    slide.addText(s.src, {
      x: 7.3, y: y + 0.9, w: 5.0, h: 0.3,
      fontSize: 9,
      fontFace: BODY_FONT,
      color: DIM,
      italic: true,
    });
  });

  // Most important rooms
  slide.addText("Most Important Rooms to Stage", {
    x: 7.3, y: 5.3, w: 5.0, h: 0.35,
    fontSize: 13,
    fontFace: BODY_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText("Living Room (37%)  \u2022  Primary Bedroom (34%)  \u2022  Kitchen (23%)", {
    x: 7.3, y: 5.65, w: 5.0, h: 0.35,
    fontSize: 11,
    fontFace: BODY_FONT,
    color: CREAM,
  });

  slide.addText("Source: NAR", {
    x: 7.3, y: 5.95, w: 5.0, h: 0.25,
    fontSize: 9,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  addNotes(slide, "Should you decide to list with me, we're going to go through a room-by-room checklist of everything to do to get your house market-ready without blowing your budget.\n\nMost of the time it's cleaning, minor staging with your own furniture, and small touch-ups. Nothing major for a house in good condition. You'll get this as a detailed email checklist you can print out and work through room by room.\n\nFor vacant homes in good condition, I usually recommend professional staging. Vacant homes just don't photograph or show as well. For homes where the family is living there, we typically work with what you have and just optimize the arrangement.");
}

// ============================================================
// SLIDE 14: The Schedule
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "The Schedule");

  // Timeline - 3 phases
  const phases = [
    {
      label: "YOUR PREP",
      time: "Varies",
      desc: "Complete the room-by-room checklist.\nThis determines our start date.",
      color: GOLD,
    },
    {
      label: "MARKETING PREP",
      time: "1 Week",
      desc: "Professional photos, video, drone footage,\nfloor plans, postcards, website creation.",
      color: GOLD,
    },
    {
      label: "COMING SOON",
      time: "1 Week",
      desc: "Property visible but no access yet.\nBuyers line up showings for launch day.",
      color: GOLD,
    },
  ];

  phases.forEach((p, i) => {
    const x = 0.7 + i * 4.1;
    const y = 1.5;

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w: 3.7, h: 3.8,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    // Phase number
    slide.addText(`PHASE ${i + 1}`, {
      x: x + 0.3, y: y + 0.2, w: 3.1, h: 0.3,
      fontSize: 10,
      fontFace: BODY_FONT,
      color: DIM,
      bold: true,
    });

    slide.addText(p.label, {
      x: x + 0.3, y: y + 0.5, w: 3.1, h: 0.5,
      fontSize: 18,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(p.time, {
      x: x + 0.3, y: y + 1.1, w: 3.1, h: 0.5,
      fontSize: 32,
      fontFace: TITLE_FONT,
      color: CREAM,
      bold: true,
    });

    slide.addShape(pptx.shapes.RECTANGLE, {
      x: x + 0.3, y: y + 1.7, w: 1.5, h: 0.02, fill: { color: GOLD },
    });

    slide.addText(p.desc, {
      x: x + 0.3, y: y + 1.9, w: 3.1, h: 1.5,
      fontSize: 13,
      fontFace: BODY_FONT,
      color: CREAM,
      lineSpacingMultiple: 1.5,
    });
  });

  // Bottom: result
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 5.7, w: 11.93, h: 0.9,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Result: 10-20 showings lined up for launch day instead of a slow trickle.", {
    x: 1.0, y: 5.7, w: 11.33, h: 0.9,
    fontSize: 16,
    fontFace: TITLE_FONT,
    color: GOLD,
    align: "center",
    valign: "middle",
  });

  addNotes(slide, "You told me you'd like to be on the market by [date]. Let me work backwards from there.\n\nWe do a 'coming soon' listing where everyone can see your property but can't get in yet. This compresses our days on market because buyers have a full week to set up showings for day one. Instead of showings trickling in over two weeks, we often have 10-20 showings lined up for launch day.\n\nWe need at least a week for professional photos, video production, drone footage, floor plans, postcard printing, online advertising setup, and website creation.\n\nThen we figure out how much time you need to complete the room-by-room checklist. That gives us our start date.");
}

// ============================================================
// SLIDE 15: Pricing Your Home
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Pricing Your Home");

  slide.addText("The best chance to sell for the most money is right after listing.", {
    x: 0.7, y: 1.15, w: 11.93, h: 0.4,
    fontSize: 15,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
  });

  // Three stat cards
  const stats = [
    {
      num: "14 Days",
      label: "After 14 days, listing views\ndramatically decrease",
      src: "Source: Zillow / Redfin",
    },
    {
      num: "50%",
      label: "Chance of going under contract\nin 1-14 days when priced\nwithin 1% of final sale price",
      src: "Source: HomeLight Study",
    },
    {
      num: "5 vs 35 Days",
      label: "Median days to contract:\ncorrectly priced vs. those\nrequiring a price reduction",
      src: "Source: Redfin / HomeLight",
    },
  ];

  stats.forEach((s, i) => {
    const x = 0.7 + i * 4.1;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.8, w: 3.7, h: 3.3,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(s.num, {
      x: x + 0.3, y: 2.1, w: 3.1, h: 0.7,
      fontSize: 36,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(s.label, {
      x: x + 0.3, y: 2.8, w: 3.1, h: 1.3,
      fontSize: 13,
      fontFace: BODY_FONT,
      color: CREAM,
      lineSpacingMultiple: 1.4,
    });

    slide.addText(s.src, {
      x: x + 0.3, y: 4.3, w: 3.1, h: 0.35,
      fontSize: 9,
      fontFace: BODY_FONT,
      color: DIM,
      italic: true,
    });
  });

  // Bottom note
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 5.5, w: 11.93, h: 1.0,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Let's look at comparable sales and determine the right price together.", {
    x: 1.0, y: 5.5, w: 11.33, h: 1.0,
    fontSize: 16,
    fontFace: TITLE_FONT,
    color: GOLD,
    align: "center",
    valign: "middle",
  });

  addNotes(slide, "Now let's talk about what your home is worth.\n\nThe best chance to sell your home for the most money is right after it gets listed. We really want to sell in that first 14-day window, and the only way to do that is to price it right from the start.\n\n[Pull up comps on laptop, go through one by one]\n\nLet's look at comparable sales. Every home is unique, but comps give us a range and then we adjust based on how your home compares.\n\n[After each comp]: Where do you think your house rates compared to this one?\n[After all comps]: Based on everything we just looked at, where do you think your house should fall in that range?");
}

// ============================================================
// SLIDE 16: Commission Structure (Table)
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Commission Structure");

  const tableRows = [
    [
      { text: "", options: { fill: { color: CARD_BG } } },
      { text: "Package 1", options: { bold: true, color: GOLD, fill: { color: CARD_BG }, align: "center", fontSize: 14 } },
      { text: "Package 2", options: { bold: true, color: GOLD, fill: { color: CARD_BG }, align: "center", fontSize: 14 } },
      { text: "Package 3", options: { bold: true, color: GOLD, fill: { color: CARD_BG }, align: "center", fontSize: 14 } },
    ],
    ...([
      ["Listing documents & MLS", true, true, true],
      ["Lockbox & sign", true, true, true],
      ["Professional photography", true, true, true],
      ["Drone photos & video", false, true, true],
      ["Narrated video tour", false, true, true],
      ["Floor plans", false, true, true],
      ["Single property website", false, true, true],
      ["Social media campaign", false, true, true],
      ["Neighborhood postcards", false, true, true],
      ["Proactive agent outreach", false, true, true],
      ["Open house", false, true, true],
      ["Pre-listing inspection", false, false, true],
      ["1-year home warranty for buyer", false, false, true],
    ].map((row, i) => {
      const bgColor = i % 2 === 0 ? "141210" : CARD_BG;
      return [
        { text: row[0], options: { fontSize: 11, color: CREAM, fill: { color: bgColor }, align: "left" } },
        { text: row[1] ? "\u2713" : "", options: { fontSize: 14, color: row[1] ? GOLD : DIM, fill: { color: bgColor }, align: "center" } },
        { text: row[2] ? "\u2713" : "", options: { fontSize: 14, color: row[2] ? GOLD : DIM, fill: { color: bgColor }, align: "center" } },
        { text: row[3] ? "\u2713" : "", options: { fontSize: 14, color: row[3] ? GOLD : DIM, fill: { color: bgColor }, align: "center" } },
      ];
    })),
    // Commission row
    [
      { text: "Commission", options: { bold: true, fontSize: 13, color: CREAM, fill: { color: "1E1C18" } } },
      { text: "2.5%", options: { bold: true, fontSize: 18, color: GOLD, fill: { color: "1E1C18" }, align: "center", fontFace: TITLE_FONT } },
      { text: "3%", options: { bold: true, fontSize: 18, color: GOLD, fill: { color: "1E1C18" }, align: "center", fontFace: TITLE_FONT } },
      { text: "3.5%", options: { bold: true, fontSize: 18, color: GOLD, fill: { color: "1E1C18" }, align: "center", fontFace: TITLE_FONT } },
    ],
  ];

  slide.addTable(tableRows, {
    x: 0.7,
    y: 1.2,
    w: 11.93,
    colW: [5.0, 2.31, 2.31, 2.31],
    rowH: 0.36,
    border: { type: "solid", color: BORDER, pt: 0.5 },
    fontFace: BODY_FONT,
    color: CREAM,
    valign: "middle",
  });

  addNotes(slide, "Out of these three packages, which one do you think is going to get you the highest price for your home?");
}

// ============================================================
// SLIDE 17: Buyer Agent Compensation
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Buyer Agent Compensation");

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 1.3, w: 11.93, h: 2.5,
    fill: { color: CARD_BG },
    rectRadius: 0.08,
  });

  slide.addText("Post-NAR Settlement", {
    x: 1.1, y: 1.5, w: 5.0, h: 0.4,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  slide.addText(
    "You are no longer required to offer buyer agent compensation.\n\n" +
    "You still can if you choose to, but it is not mandatory.",
    {
      x: 1.1, y: 2.0, w: 11.13, h: 1.2,
      fontSize: 15,
      fontFace: BODY_FONT,
      color: CREAM,
      lineSpacingMultiple: 1.5,
    }
  );

  // What we'll do
  slide.addText("How We'll Decide Together", {
    x: 0.7, y: 4.2, w: 11.93, h: 0.5,
    fontSize: 20,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  const steps = [
    "Review MLS data from recent comparable sales",
    "See what compensation was offered and how those listings performed",
    "Analyze current market conditions in your area",
    "You decide what makes sense for your situation",
  ];

  steps.forEach((s, i) => {
    slide.addText(`${i + 1}`, {
      x: 1.0, y: 4.9 + i * 0.55, w: 0.3, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: GOLD,
      bold: true,
    });
    slide.addText(s, {
      x: 1.5, y: 4.9 + i * 0.55, w: 10.5, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
    });
  });

  addNotes(slide, "Now let's talk about buyer agent incentives. Coming out of the NAR settlement, you are no longer required to offer buyer agent compensation. You still can if you choose to, but it's not mandatory.\n\n[Show MLS data from recent comps showing what compensation was offered and how those listings performed]\n\nBased on the data I'm seeing in our market, here's what's happening...\n\n[Walk through the local data, let seller decide]\n\nBased on those options and our target price, what are you thinking as far as buyer agent compensation?");
}

// ============================================================
// SLIDE 18: The Full Process Overview
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "The Full Process Overview");

  const steps = [
    ["Agent consultation (today)", "Sign listing agreement", "Complete disclosures"],
    ["Room-by-room prep checklist", "Get house ready to show", "Coordinate staging (if applicable)"],
    ["Professional photos, video, drone, floor plans", "Create property website", "Install sign and lockbox"],
    ["Create MLS listing", "Postcards go out", "Coming soon listing goes live"],
    ["Agent outreach begins", "Listing goes live", "Showings begin"],
    ["Social media campaign launches", "Daily showing feedback to you", "Open house"],
    ["Pre-qualify all buyers on offers", "Review offers, select best terms", ""],
    ["Negotiate", "Close", ""],
  ];

  // Grid layout: 4 columns of steps
  let stepNum = 1;
  steps.forEach((row, rowIdx) => {
    row.forEach((step, colIdx) => {
      if (!step) return;
      const x = 0.5 + colIdx * 4.2;
      const y = 1.2 + rowIdx * 0.73;

      slide.addText(`${stepNum}.`, {
        x, y, w: 0.35, h: 0.5,
        fontSize: 10,
        fontFace: BODY_FONT,
        color: GOLD,
        bold: true,
        valign: "top",
      });
      slide.addText(step, {
        x: x + 0.35, y, w: 3.5, h: 0.5,
        fontSize: 11,
        fontFace: BODY_FONT,
        color: CREAM,
        valign: "top",
        lineSpacingMultiple: 1.1,
      });
      stepNum++;
    });
  });

  addNotes(slide, "What questions do you have for me at this point?");
}

// ============================================================
// SLIDE 19: The Close
// ============================================================
{
  const slide = pptx.addSlide();
  slide.background = { color: BG };

  // Centered closing
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 5.4, y: 1.2, w: 2.5, h: 0.06, fill: { color: GOLD },
  });

  slide.addText("Let's Get Started", {
    x: 1.0, y: 1.6, w: 11.33, h: 0.8,
    fontSize: 42,
    fontFace: TITLE_FONT,
    color: CREAM,
    bold: true,
    align: "center",
  });

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 2.5, y: 2.8, w: 8.33, h: 3.0,
    fill: { color: CARD_BG },
    rectRadius: 0.1,
  });

  const confirmItems = [
    { icon: "\u2713", text: "Agreed on price" },
    { icon: "\u2713", text: "Agreed on timeline" },
    { icon: "\u2713", text: "Agreed on commission" },
  ];

  confirmItems.forEach((item, i) => {
    slide.addText(item.icon, {
      x: 3.5, y: 3.1 + i * 0.7, w: 0.4, h: 0.5,
      fontSize: 20,
      fontFace: BODY_FONT,
      color: GOLD,
      bold: true,
      align: "center",
      valign: "middle",
    });
    slide.addText(item.text, {
      x: 4.1, y: 3.1 + i * 0.7, w: 5.5, h: 0.5,
      fontSize: 20,
      fontFace: TITLE_FONT,
      color: CREAM,
      valign: "middle",
    });
  });

  slide.addText("Is there anything else you need to hear to feel comfortable\nsigning the listing agreement today?", {
    x: 1.0, y: 5.3, w: 11.33, h: 0.8,
    fontSize: 16,
    fontFace: BODY_FONT,
    color: DIM,
    italic: true,
    align: "center",
    lineSpacingMultiple: 1.4,
  });

  // Bottom gold line
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 5.4, y: 6.4, w: 2.5, h: 0.06, fill: { color: GOLD },
  });

  addNotes(slide, "So it sounds like we agreed on price. We're going to list your home at $[X]. It sounds like we agreed on a timeline of [date]. And it sounds like we agreed on commission. Is that all correct?\n\nIs there anything else you would need to hear from me in order to feel comfortable signing the listing agreement today so we can get started?\n\n[Pull out pre-filled listing agreement]");
}

// ============================================================
// SLIDE 20: After Signing (bonus)
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "After Signing: Next Steps");

  const nextSteps = [
    { title: "Room-by-Room Walkthrough", desc: "We'll go through every room together, or schedule a second visit" },
    { title: "Detailed Email Recap", desc: "You'll receive a bulleted summary of everything we agreed on" },
  ];

  nextSteps.forEach((ns, i) => {
    const x = 0.7 + i * 6.3;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.3, w: 5.8, h: 2.4,
      fill: { color: CARD_BG },
      rectRadius: 0.08,
    });

    slide.addText(`0${i + 1}`, {
      x: x + 0.4, y: 1.5, w: 1.0, h: 0.5,
      fontSize: 28,
      fontFace: TITLE_FONT,
      color: GOLD,
      bold: true,
    });

    slide.addText(ns.title, {
      x: x + 0.4, y: 2.1, w: 5.0, h: 0.4,
      fontSize: 18,
      fontFace: TITLE_FONT,
      color: CREAM,
      bold: true,
    });

    slide.addText(ns.desc, {
      x: x + 0.4, y: 2.6, w: 5.0, h: 0.6,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: DIM,
      lineSpacingMultiple: 1.3,
    });
  });

  // Email recap details
  slide.addText("Your Recap Email Will Include:", {
    x: 0.7, y: 4.1, w: 11.93, h: 0.4,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: GOLD,
    bold: true,
  });

  const recapItems = [
    "Agreed listing price",
    "Timeline with key dates",
    "Room-by-room prep checklist with deadlines",
    "Next steps and what to expect",
  ];

  recapItems.forEach((item, i) => {
    slide.addText("\u2713", {
      x: 1.0, y: 4.7 + i * 0.55, w: 0.3, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: GOLD,
    });
    slide.addText(item, {
      x: 1.5, y: 4.7 + i * 0.55, w: 10.5, h: 0.4,
      fontSize: 14,
      fontFace: BODY_FONT,
      color: CREAM,
    });
  });

  addNotes(slide, "After signing:\n- Go through room-by-room checklist (or schedule second visit)\n- Send detailed bulleted email recap with: agreed price, timeline with key dates, room-by-room prep checklist with deadlines they agreed to, next steps and what to expect.");
}

// ============================================================
// SLIDE 21: Sources Referenced
// ============================================================
{
  const slide = makeSlide();
  addTitle(slide, "Sources Referenced");

  const sources = [
    "Real Estate Exposures - Average Days on Market Study - realestateexposures.com",
    "Redfin / PR Newswire - Professional Photography Price Analysis",
    "PhotoUp / Redfin - Photography Impact Data - photoup.net",
    "National Association of REALTORS - 2025 Profile of Home Buyers and Sellers - nar.realtor",
    "NAR Technology Survey - nar.realtor",
    "Inman - MLS Aerial Imagery Analysis - inman.com",
    "HomeTrack / Augi Drones - Drone Photography ROI - hometrack.net",
    "CubiCasa / Rightmove - Floor Plan Statistics - cubi.casa",
    "mov8 Real Estate - Floor Plan Market Impact Study",
    "NAR 2025 Home Staging Report - nar.realtor",
    "Zillow / Redfin - Days on Market Data",
    "HomeLight - Pricing Impact Study - homelight.com",
  ];

  sources.forEach((src, i) => {
    const col = i < 6 ? 0 : 1;
    const row = i < 6 ? i : i - 6;
    const x = 0.7 + col * 6.3;
    const y = 1.3 + row * 0.85;

    slide.addText(`${i + 1}.`, {
      x, y, w: 0.35, h: 0.6,
      fontSize: 11,
      fontFace: BODY_FONT,
      color: GOLD,
      bold: true,
      valign: "top",
    });
    slide.addText(src, {
      x: x + 0.35, y, w: 5.55, h: 0.6,
      fontSize: 11,
      fontFace: BODY_FONT,
      color: CREAM,
      valign: "top",
      lineSpacingMultiple: 1.2,
    });
  });
}

// Generate the file
const outputPath = "C:/Users/colem/Projects/coryhelpsyoumove/marketing/listing-presentation-residential.pptx";
await pptx.writeFile({ fileName: outputPath });
console.log("Presentation saved to: " + outputPath);
