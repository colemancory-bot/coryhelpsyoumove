const pptxgen = require("pptxgenjs");

// Brand colors (no # prefix)
const BG = "0C0B09";
const CREAM = "F5F0E8";
const GOLD = "C4B08C";
const MUTED = "8A8578";
const SURFACE = "1A1815";

// Helper to make a fresh shadow each time (pptxgenjs mutates objects)
const goldLine = () => ({ color: GOLD, width: 0.5 });

function addTitleSlide(pres, title, subtitle) {
  let s = pres.addSlide();
  s.background = { color: BG };
  // Gold accent line
  s.addShape(pres.shapes.LINE, { x: 0.8, y: 2.0, w: 2, h: 0, line: { color: GOLD, width: 2 } });
  s.addText(title, { x: 0.8, y: 2.2, w: 8.4, h: 1.2, fontSize: 40, fontFace: "Georgia", color: CREAM, bold: true, margin: 0 });
  s.addText(subtitle, { x: 0.8, y: 3.4, w: 8.4, h: 0.6, fontSize: 16, fontFace: "Calibri", color: GOLD, margin: 0 });
  s.addText("Keller Williams Great Smokies", { x: 0.8, y: 4.6, w: 8.4, h: 0.4, fontSize: 11, fontFace: "Calibri", color: MUTED, margin: 0 });
  return s;
}

function addContentSlide(pres, title, speakerNotes) {
  let s = pres.addSlide();
  s.background = { color: BG };
  // Title
  s.addText(title.toUpperCase(), { x: 0.8, y: 0.35, w: 8.4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: GOLD, charSpacing: 4, margin: 0 });
  // Thin gold line under title
  s.addShape(pres.shapes.LINE, { x: 0.8, y: 0.9, w: 8.4, h: 0, line: { color: GOLD, width: 0.5 } });
  if (speakerNotes) s.addNotes(speakerNotes);
  return s;
}

function addStat(slide, stat, source, x, y, w) {
  slide.addText(stat, { x, y, w: w || 4, h: 0.5, fontSize: 28, fontFace: "Georgia", color: GOLD, bold: true, margin: 0 });
  slide.addText(source, { x, y: y + 0.5, w: w || 4, h: 0.3, fontSize: 9, fontFace: "Calibri", color: MUTED, italic: true, margin: 0 });
}

function addBullets(slide, items, x, y, w, h) {
  let textItems = items.map((item, i) => ({
    text: item,
    options: { bullet: true, color: CREAM, fontSize: 13, fontFace: "Calibri", breakLine: i < items.length - 1 }
  }));
  slide.addText(textItems, { x, y, w: w || 8.4, h: h || 2, margin: 0, paraSpaceAfter: 6 });
}

function addTable(slide, headers, rows, x, y, w, colW) {
  let tableData = [
    headers.map(h => ({ text: h, options: { bold: true, color: BG, fontSize: 10, fontFace: "Calibri", fill: { color: GOLD } } })),
    ...rows.map(row => row.map(cell => ({ text: cell, options: { color: CREAM, fontSize: 10, fontFace: "Calibri", fill: { color: SURFACE } } })))
  ];
  slide.addTable(tableData, { x, y, w, colW, border: { pt: 0.5, color: "2A2824" } });
}

// ============================================================
// RESIDENTIAL PRESENTATION
// ============================================================
function createResidential() {
  let pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Cory Coleman";
  pres.title = "Residential Listing Presentation";

  // Slide 1: Title
  addTitleSlide(pres, "Listing Presentation", "Cory Coleman, Broker");

  // Slide 2: Opening
  let s2 = addContentSlide(pres, "Thank You for the Opportunity", "Thank you for the opportunity to interview for the job of helping you sell your home. My job as your real estate broker is to make as many qualified buyers aware of your property, get them through your door, and help them make a commitment to buy.");
  s2.addText("My job is to make as many qualified buyers\naware of your property, get them through your door,\nand help them make a commitment to buy.", { x: 0.8, y: 1.3, w: 8.4, h: 2, fontSize: 22, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.4, margin: 0 });
  s2.addText('"Thank you for the opportunity to interview\nfor the job of helping you sell your home."', { x: 0.8, y: 3.6, w: 8.4, h: 1, fontSize: 14, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 3: About Me
  let s3 = addContentSlide(pres, "About Me & My Team", "I don't work alone. Backed by Keller Williams, ranked #1 real estate franchise in the U.S. for the 4th consecutive year.");
  s3.addText("Cory Coleman, Broker", { x: 0.8, y: 1.2, w: 8.4, h: 0.5, fontSize: 22, fontFace: "Georgia", color: CREAM, bold: true, margin: 0 });
  s3.addText("Keller Williams Great Smokies  |  Sylva, NC", { x: 0.8, y: 1.7, w: 8.4, h: 0.4, fontSize: 13, fontFace: "Calibri", color: GOLD, margin: 0 });
  addBullets(s3, [
    "Serving Waynesville, Sylva, Bryson City, Maggie Valley, Franklin, Cashiers, Highlands, Dillsboro, Cullowhee",
    "Haywood, Jackson, Macon, and Swain counties"
  ], 0.8, 2.3, 8.4, 1.2);
  s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 3.5, w: 8.4, h: 1.8, fill: { color: SURFACE }, rectRadius: 0.1 });
  s3.addText("KELLER WILLIAMS: #1 IN THE WORLD", { x: 1.1, y: 3.6, w: 8, h: 0.35, fontSize: 10, fontFace: "Calibri", color: GOLD, charSpacing: 3, margin: 0 });
  s3.addText([
    { text: "165,000+ agents", options: { bold: true, color: GOLD, fontSize: 13, fontFace: "Calibri", breakLine: true } },
    { text: " across 60+ countries. ", options: { color: CREAM, fontSize: 13, fontFace: "Calibri", breakLine: true } },
    { text: "$370.8 billion", options: { bold: true, color: GOLD, fontSize: 13, fontFace: "Calibri" } },
    { text: " in sales volume (2024). Ranked #1 by agent count, transaction sides, and sales volume for the 4th consecutive year.", options: { color: CREAM, fontSize: 13, fontFace: "Calibri", breakLine: true } },
    { text: "AI technology won \"Best Use of AI by a Brokerage\" (Inman Awards). Training platform named #1 (HousingWire).", options: { color: CREAM, fontSize: 11, fontFace: "Calibri", breakLine: true } },
    { text: "Source: T3 Sixty Real Estate Almanac, April 2025", options: { color: MUTED, fontSize: 9, fontFace: "Calibri", italic: true } }
  ], { x: 1.1, y: 4.0, w: 7.8, h: 1.2, margin: 0, paraSpaceAfter: 4 });

  // Slide 4: Choose the Agent
  let s4 = addContentSlide(pres, "Choose the Agent, Not the Brokerage", "Choose the agent who you believe will best represent you, not the brokerage name on the sign.");
  s4.addText("The brokerage isn't the one\nnegotiating on your behalf.", { x: 0.8, y: 1.3, w: 8.4, h: 1.2, fontSize: 26, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.3, margin: 0 });
  s4.addText("Buyers don't filter by brokerage.\nThey look at the property.", { x: 0.8, y: 2.8, w: 8.4, h: 1, fontSize: 18, fontFace: "Calibri", color: MUTED, lineSpacingMultiple: 1.4, margin: 0 });
  s4.addText("Choose the person you trust to do the work.", { x: 0.8, y: 4.2, w: 8.4, h: 0.5, fontSize: 16, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 5: What Every Agent Does
  let s5 = addContentSlide(pres, "What Every Agent Does", "Every agent will do these things. I want to talk about what we do above and beyond.");
  addBullets(s5, [
    "Help you through listing documents",
    "Install a lockbox",
    "Enter your property in the MLS",
    "Field phone calls and schedule showings",
    "Coordinate through closing"
  ], 0.8, 1.2, 5, 2.5);
  s5.addText("I don't want to waste your time\non what's standard.", { x: 5.5, y: 1.5, w: 4, h: 1, fontSize: 16, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });
  s5.addText("Let's talk about what we do\nabove and beyond.", { x: 5.5, y: 2.8, w: 4, h: 0.8, fontSize: 16, fontFace: "Georgia", color: CREAM, margin: 0 });

  // Slide 6: Professional Photography
  let s6 = addContentSlide(pres, "Professional Photography", "For us, it all starts with professional photography. Over half of all listings in our MLS are photographed with a cell phone.");
  addStat(s6, "32% Faster", "Source: Real Estate Exposures", 0.8, 1.2, 4);
  s6.addText("Professional photos sell faster\n(89 days vs. 123 days for cell phone)", { x: 0.8, y: 2.0, w: 4, h: 0.6, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s6, "47% Higher", "Source: Redfin / PR Newswire", 5.2, 1.2, 4);
  s6.addText("Asking price per square foot\nwith professional photography", { x: 5.2, y: 2.0, w: 4, h: 0.6, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s6, "118% More Views", "Source: Redfin", 0.8, 3.0, 4);
  s6.addText("Online views compared to\ncell phone photos", { x: 0.8, y: 3.8, w: 4, h: 0.6, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s6.addText("The first showing happens online.\nIf the pictures don't stop someone mid-scroll,\nthey're never coming to see your home.", { x: 5.2, y: 3.2, w: 4.3, h: 1.2, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, lineSpacingMultiple: 1.3, margin: 0 });

  // Slide 7: Professional Video
  let s7 = addContentSlide(pres, "Professional Video", "We produce a narrated property video for every listing.");
  addStat(s7, "403% More Inquiries", "Source: National Association of REALTORS", 0.8, 1.2, 8);
  s7.addText("Listings with video vs. without", { x: 0.8, y: 2.0, w: 8, h: 0.4, fontSize: 12, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s7, "73% of Sellers", "Source: NAR Profile of Home Buyers and Sellers", 0.8, 2.8, 4);
  s7.addText("Prefer an agent who uses video", { x: 0.8, y: 3.6, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s7, "Only 38% of Agents", "Source: NAR Technology Survey", 5.2, 2.8, 4);
  s7.addText("Currently use video marketing", { x: 5.2, y: 3.6, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s7.addText("This isn't a slideshow with music. It's a professionally shot,\nnarrated walkthrough that tells the story of your home.", { x: 0.8, y: 4.3, w: 8.4, h: 0.7, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 8: Drone
  let s8 = addContentSlide(pres, "Drone Photography & Video", "In Western NC, drone footage matters even more. Mountain properties have views, acreage, creek frontage, and road access that you cannot capture from the ground.");
  addStat(s8, "68% Faster", "Source: MLS data, reported by Inman", 0.8, 1.2, 4);
  s8.addText("Listings with aerial imagery\nsell faster", { x: 0.8, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s8, "5-10% More", "Source: HomeTrack / Augi Drones", 5.2, 1.2, 4);
  s8.addText("Average price premium with\naerial video", { x: 5.2, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s8, "83% of Sellers", "Source: NAR Technology Survey", 0.8, 3.0, 4);
  s8.addText("Prefer an agent who uses\ndrone photography", { x: 0.8, y: 3.8, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s8.addText("Mountain properties have views, acreage,\ncreek frontage, and road access that you\nsimply cannot capture from the ground.", { x: 5.2, y: 3.2, w: 4.3, h: 1.2, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, lineSpacingMultiple: 1.3, margin: 0 });

  // Slide 9: Floor Plans
  let s9 = addContentSlide(pres, "Floor Plans", "Every listing gets a labeled floor plan with room dimensions.");
  addStat(s9, "#1 Most Desired", "Source: 2025 NAR Homebuyers and Sellers Survey", 0.8, 1.2, 4);
  s9.addText("Listing feature after photos", { x: 0.8, y: 2.0, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s9, "93% of Buyers", "Source: Rightmove / CubiCasa", 5.2, 1.2, 4);
  s9.addText("More likely to spend time on\na listing with a floor plan", { x: 5.2, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s9, "52% More Clicks", "Source: Rightmove", 0.8, 2.8, 4);
  s9.addText("Click-through increase\nwith floor plans", { x: 0.8, y: 3.6, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s9, "50% Faster", "Source: mov8 Real Estate", 5.2, 2.8, 4);
  s9.addText("Reduction in time on market", { x: 5.2, y: 3.6, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });

  // Slide 10: Property Website
  let s10 = addContentSlide(pres, "Single Property Website", "Every listing gets its own dedicated property website.");
  s10.addText("Your listing gets a dedicated page with:", { x: 0.8, y: 1.3, w: 8.4, h: 0.5, fontSize: 18, fontFace: "Georgia", color: CREAM, margin: 0 });
  addBullets(s10, [
    "Professional video tour",
    "All photos and floor plan",
    "Full listing details and disclosures",
    "Area maps and community info",
    "Easily shareable link"
  ], 0.8, 2.0, 8.4, 2.5);
  s10.addText("If your neighbor has a friend looking to move here,\nthey just share one link and that person has everything.", { x: 0.8, y: 4.3, w: 8.4, h: 0.7, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 11: Social Media
  let s11 = addContentSlide(pres, "Social Media & Digital Marketing", "Video campaign + neighborhood postcards with QR codes.");
  addStat(s11, "157% More Traffic", "Source: NAR", 0.8, 1.2, 4);
  s11.addText("Organic traffic increase with\nvideo on agent websites", { x: 0.8, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s11, "10% of Buyers", "Source: NAR Profile of Home Buyers and Sellers", 5.2, 1.2, 4);
  s11.addText("Purchase because they know\nsomeone in the area", { x: 5.2, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addBullets(s11, [
    "Facebook, Instagram, YouTube video campaign",
    "250-300 neighborhood postcards with QR code",
    "QR code links to your property website"
  ], 0.8, 3.0, 8.4, 2);

  // Slide 12: Agent Outreach
  let s12 = addContentSlide(pres, "Proactive Agent Outreach", "I actively contact top buyer's agents before your listing goes live.");
  s12.addText("I don't list your home and wait\nfor the phone to ring.", { x: 0.8, y: 1.3, w: 8.4, h: 1, fontSize: 24, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.3, margin: 0 });
  addBullets(s12, [
    "Contact highest-performing buyer's agents in your area",
    "Create demand and excitement before listing goes live",
    "Build buzz so showings are lined up from day one"
  ], 0.8, 2.6, 8.4, 2);

  // Slide 13: Open House
  let s13 = addContentSlide(pres, "Open House Strategy", "Advertised across social media, real estate websites, and MLS.");
  addStat(s13, "50% of Buyers", "Source: NAR Profile of Home Buyers and Sellers", 0.8, 1.2, 4);
  s13.addText("Attend open houses during\ntheir search", { x: 0.8, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s13, "37% of Buyers", "Source: NAR data analysis", 5.2, 1.2, 4);
  s13.addText("Attended an open house for the\nhome they purchased", { x: 5.2, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });

  // Slide 14: Getting Ready + Staging
  let s14 = addContentSlide(pres, "Getting Your Home Ready", "Room-by-room checklist and staging guidance.");
  addStat(s14, "1-10% Higher Offers", "Source: 2025 NAR Profile of Home Staging", 0.8, 1.2, 4);
  s14.addText("With professionally staged homes", { x: 0.8, y: 2.0, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s14, "49% of Agents", "Source: NAR 2025 Home Staging Report", 5.2, 1.2, 4);
  s14.addText("Observed staging reduced\ntime on market", { x: 5.2, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s14.addText("Most important rooms to stage:", { x: 0.8, y: 2.8, w: 8.4, h: 0.4, fontSize: 14, fontFace: "Calibri", color: CREAM, margin: 0 });
  s14.addText("Living Room 37%   |   Primary Bedroom 34%   |   Kitchen 23%", { x: 0.8, y: 3.2, w: 8.4, h: 0.4, fontSize: 14, fontFace: "Calibri", color: GOLD, margin: 0 });
  s14.addText("Source: NAR", { x: 0.8, y: 3.6, w: 8.4, h: 0.3, fontSize: 9, fontFace: "Calibri", color: MUTED, italic: true, margin: 0 });
  s14.addText("You'll receive a detailed room-by-room checklist\nyou can print out and work through.", { x: 0.8, y: 4.2, w: 8.4, h: 0.6, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 15: Schedule
  let s15 = addContentSlide(pres, "The Schedule", "Working backwards from your target date.");
  s15.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 1.2, w: 2.6, h: 1.2, fill: { color: SURFACE }, rectRadius: 0.1 });
  s15.addText("YOUR PREP", { x: 0.8, y: 1.25, w: 2.6, h: 0.35, fontSize: 10, fontFace: "Calibri", color: GOLD, align: "center", charSpacing: 3, margin: 0 });
  s15.addText("Room-by-room\nchecklist", { x: 0.8, y: 1.6, w: 2.6, h: 0.7, fontSize: 13, fontFace: "Calibri", color: CREAM, align: "center", margin: 0 });
  s15.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3.7, y: 1.2, w: 2.6, h: 1.2, fill: { color: SURFACE }, rectRadius: 0.1 });
  s15.addText("MARKETING PREP", { x: 3.7, y: 1.25, w: 2.6, h: 0.35, fontSize: 10, fontFace: "Calibri", color: GOLD, align: "center", charSpacing: 3, margin: 0 });
  s15.addText("Photos, video, drone,\nfloor plans, website", { x: 3.7, y: 1.6, w: 2.6, h: 0.7, fontSize: 13, fontFace: "Calibri", color: CREAM, align: "center", margin: 0 });
  s15.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.6, y: 1.2, w: 2.6, h: 1.2, fill: { color: SURFACE }, rectRadius: 0.1 });
  s15.addText("COMING SOON", { x: 6.6, y: 1.25, w: 2.6, h: 0.35, fontSize: 10, fontFace: "Calibri", color: GOLD, align: "center", charSpacing: 3, margin: 0 });
  s15.addText("1 week of visibility\nbefore going live", { x: 6.6, y: 1.6, w: 2.6, h: 0.7, fontSize: 13, fontFace: "Calibri", color: CREAM, align: "center", margin: 0 });
  s15.addText("Coming soon compresses days on market.\nBuyers have a full week to set up showings before day one.", { x: 0.8, y: 2.8, w: 8.4, h: 0.7, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 16: Pricing
  let s16 = addContentSlide(pres, "Pricing Your Home", "The best chance to sell for the most money is right after listing. We want to sell in the first 14 days.");
  addStat(s16, "14 Days", "Source: Zillow / Redfin", 0.8, 1.2, 4);
  s16.addText("After 14 days, listing views\ndramatically decrease", { x: 0.8, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s16, "5 Days vs. 35 Days", "Source: HomeLight", 5.2, 1.2, 4);
  s16.addText("Priced right: 5 days to contract\nPrice reduction needed: 35 days", { x: 5.2, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s16.addText("Let's look at comparable sales together.", { x: 0.8, y: 3.2, w: 8.4, h: 0.5, fontSize: 18, fontFace: "Georgia", color: CREAM, margin: 0 });
  s16.addText('"Where do you think your house should fall in that range?"', { x: 0.8, y: 4.0, w: 8.4, h: 0.5, fontSize: 14, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 17: Commission
  let s17 = addContentSlide(pres, "Commission Structure", "Which package do you think is going to get you the highest price?");
  let commHeaders = ["Service", "Package 1", "Package 2", "Package 3"];
  let commRows = [
    ["Listing documents & MLS", "\u2713", "\u2713", "\u2713"],
    ["Lockbox & sign", "\u2713", "\u2713", "\u2713"],
    ["Professional photography", "\u2713", "\u2713", "\u2713"],
    ["Drone photos & video", "", "\u2713", "\u2713"],
    ["Narrated video tour", "", "\u2713", "\u2713"],
    ["Floor plans", "", "\u2713", "\u2713"],
    ["Property website", "", "\u2713", "\u2713"],
    ["Social media campaign", "", "\u2713", "\u2713"],
    ["Postcards + agent outreach", "", "\u2713", "\u2713"],
    ["Open house", "", "\u2713", "\u2713"],
    ["Pre-listing inspection", "", "", "\u2713"],
    ["Home warranty for buyer", "", "", "\u2713"],
    ["Commission", "2.5%", "3%", "3.5%"],
  ];
  addTable(s17, commHeaders, commRows, 0.8, 1.1, 8.4, [3.5, 1.5, 1.5, 1.5]);

  // Slide 18: Buyer Agent Comp
  let s18 = addContentSlide(pres, "Buyer Agent Compensation", "Coming out of the NAR settlement, you are no longer required to offer buyer agent compensation. But here's what the data shows in our market.");
  s18.addText("You are no longer required to offer\nbuyer agent compensation.", { x: 0.8, y: 1.3, w: 8.4, h: 0.8, fontSize: 20, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.3, margin: 0 });
  s18.addText("But the data matters.", { x: 0.8, y: 2.3, w: 8.4, h: 0.5, fontSize: 16, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });
  s18.addText("Let's review what recent comparable sales\noffered and how those listings performed.", { x: 0.8, y: 3.2, w: 8.4, h: 0.8, fontSize: 14, fontFace: "Calibri", color: CREAM, margin: 0 });

  // Slide 19: Process Overview
  let s19 = addContentSlide(pres, "The Full Process", "From consultation to closing.");
  let steps1 = ["1. Agent consultation (today)", "2. Sign listing agreement", "3. Complete disclosures", "4. Room-by-room prep", "5. Get house ready to show", "6. Coordinate staging", "7. Photos, video, drone, floor plans", "8. Create property website"];
  let steps2 = ["9. Install sign & lockbox", "10. Create MLS listing", "11. Postcards go out", "12. Coming soon goes live", "13. Agent outreach begins", "14. Listing goes live", "15. Showings + daily feedback", "16. Open house"];
  let steps3 = ["17. Social media campaign", "18. Pre-qualify all buyers", "19. Review offers", "20. Negotiate best terms", "21. Close"];
  addBullets(s19, steps1, 0.8, 1.1, 3, 4);
  addBullets(s19, steps2, 3.7, 1.1, 3, 4);
  addBullets(s19, steps3, 6.6, 1.1, 3, 2.5);

  // Slide 20: The Close
  let s20 = addContentSlide(pres, "Let's Get Started", 'Is there anything else you would need to hear from me in order to feel comfortable signing the listing agreement today?');
  s20.addText("We agreed on:", { x: 0.8, y: 1.3, w: 8.4, h: 0.5, fontSize: 18, fontFace: "Georgia", color: CREAM, margin: 0 });
  addBullets(s20, [
    "Price: $______",
    "Timeline: ______",
    "Commission package: ______"
  ], 0.8, 1.9, 8.4, 1.5);
  s20.addText('"Is there anything else you would need to hear\nin order to feel comfortable signing the listing\nagreement today so we can get started?"', { x: 0.8, y: 3.5, w: 8.4, h: 1.2, fontSize: 18, fontFace: "Georgia", color: GOLD, italic: true, lineSpacingMultiple: 1.3, margin: 0 });

  // Slide 21: Sources
  let s21 = addContentSlide(pres, "Sources Referenced", "");
  let sources = [
    "1. Real Estate Exposures - Average Days on Market Study",
    "2. Redfin / PR Newswire - Photography Price Analysis",
    "3. PhotoUp / Redfin - Photography Impact Data",
    "4. NAR - 2025 Profile of Home Buyers and Sellers",
    "5. NAR Technology Survey",
    "6. Inman - MLS Aerial Imagery Analysis",
    "7. HomeTrack / Augi Drones - Drone Photography ROI",
    "8. CubiCasa / Rightmove - Floor Plan Statistics",
    "9. mov8 Real Estate - Floor Plan Market Impact",
    "10. NAR 2025 Home Staging Report",
    "11. Zillow / Redfin - Days on Market Data",
    "12. HomeLight - Pricing Impact Study"
  ];
  addBullets(s21, sources, 0.8, 1.1, 8.4, 4.2);

  pres.writeFile({ fileName: "C:\\Users\\colem\\Projects\\coryhelpsyoumove\\marketing\\listing-presentation-residential.pptx" })
    .then(() => console.log("Residential PPTX created!"));
}

// ============================================================
// LAND PRESENTATION
// ============================================================
function createLand() {
  let pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Cory Coleman";
  pres.title = "Land Listing Presentation";

  // Slide 1: Title
  addTitleSlide(pres, "Land Listing Presentation", "Cory Coleman, Broker");

  // Slide 2: Opening
  let s2 = addContentSlide(pres, "A Different Approach to Selling Land", "Most agents treat land like an afterthought. They stick a sign in the ground and hope someone finds it. I take a completely different approach.");
  s2.addText("Most agents treat land\nlike an afterthought.", { x: 0.8, y: 1.3, w: 8.4, h: 1, fontSize: 26, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.3, margin: 0 });
  s2.addText("They stick a sign in the ground, put it in the MLS\nwith a couple cell phone pictures, and hope someone finds it.", { x: 0.8, y: 2.5, w: 8.4, h: 0.8, fontSize: 14, fontFace: "Calibri", color: MUTED, lineSpacingMultiple: 1.4, margin: 0 });
  s2.addText("I take a completely different approach.", { x: 0.8, y: 3.6, w: 8.4, h: 0.5, fontSize: 20, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 3: About Me
  let s3 = addContentSlide(pres, "About Me & My Team", "I specialize in land and acreage sales across Western North Carolina. Backed by Keller Williams, ranked #1 for the 4th consecutive year.");
  s3.addText("Cory Coleman, Broker", { x: 0.8, y: 1.2, w: 8.4, h: 0.5, fontSize: 22, fontFace: "Georgia", color: CREAM, bold: true, margin: 0 });
  s3.addText("Keller Williams Great Smokies  |  Sylva, NC", { x: 0.8, y: 1.7, w: 8.4, h: 0.4, fontSize: 13, fontFace: "Calibri", color: GOLD, margin: 0 });
  s3.addText("Land expertise:", { x: 0.8, y: 2.2, w: 8.4, h: 0.3, fontSize: 12, fontFace: "Calibri", color: CREAM, margin: 0 });
  addBullets(s3, [
    "Unrestricted vs. restricted land, well and septic requirements",
    "Road access, elevation, flood zones, soil tests, timber value",
    "Haywood, Jackson, Macon, and Swain counties"
  ], 0.8, 2.5, 8.4, 1.2);
  s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 3.7, w: 8.4, h: 1.6, fill: { color: SURFACE }, rectRadius: 0.1 });
  s3.addText("KELLER WILLIAMS: #1 IN THE WORLD", { x: 1.1, y: 3.8, w: 8, h: 0.35, fontSize: 10, fontFace: "Calibri", color: GOLD, charSpacing: 3, margin: 0 });
  s3.addText([
    { text: "165,000+ agents", options: { bold: true, color: GOLD, fontSize: 13, fontFace: "Calibri" } },
    { text: " across 60+ countries. ", options: { color: CREAM, fontSize: 13, fontFace: "Calibri", breakLine: true } },
    { text: "$370.8 billion", options: { bold: true, color: GOLD, fontSize: 13, fontFace: "Calibri" } },
    { text: " in sales volume (2024). #1 by agent count, transactions, and volume for 4 consecutive years.", options: { color: CREAM, fontSize: 13, fontFace: "Calibri", breakLine: true } },
    { text: "Source: T3 Sixty Real Estate Almanac, April 2025", options: { color: MUTED, fontSize: 9, fontFace: "Calibri", italic: true } }
  ], { x: 1.1, y: 4.15, w: 7.8, h: 1.0, margin: 0, paraSpaceAfter: 4 });

  // Slide 4: Choose the Agent
  let s4 = addContentSlide(pres, "Choose the Agent, Not the Brokerage", "Choose the person who understands land, not just the brokerage on the sign.");
  s4.addText("Most residential agents have\nnever sold a raw parcel.", { x: 0.8, y: 1.3, w: 8.4, h: 1, fontSize: 24, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.3, margin: 0 });
  s4.addText("They don't know what questions land buyers ask,\nwhat due diligence matters, or how to market\nproperty that doesn't have a kitchen to photograph.", { x: 0.8, y: 2.6, w: 8.4, h: 1, fontSize: 14, fontFace: "Calibri", color: MUTED, lineSpacingMultiple: 1.4, margin: 0 });

  // Slide 5: Why Land is Different
  let s5 = addContentSlide(pres, "Why Land Marketing is Different", "With a house, buyers walk in and picture themselves living there. With land, they have to imagine everything.");
  s5.addText("The challenges:", { x: 0.8, y: 1.3, w: 8.4, h: 0.4, fontSize: 16, fontFace: "Calibri", color: CREAM, margin: 0 });
  addBullets(s5, [
    "No interior to photograph",
    "Buyers can't visualize buildable area, views, or access",
    "Boundary lines and topography are invisible in standard photos",
    "Cell phone photos of trees and dirt all look the same"
  ], 0.8, 1.8, 8.4, 2.5);
  s5.addText("Our job is to help buyers see the potential.", { x: 0.8, y: 4.2, w: 8.4, h: 0.5, fontSize: 16, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 6: Drone Photography
  let s6 = addContentSlide(pres, "Professional Drone Photography & Video", "For land listings, drone photography isn't a nice-to-have. It's essential.");
  addStat(s6, "68% Faster", "Source: MLS data, reported by Inman", 0.8, 1.2, 4);
  s6.addText("Listings with aerial imagery\nsell faster", { x: 0.8, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s6, "5-10% More", "Source: HomeTrack / Augi Drones", 5.2, 1.2, 4);
  s6.addText("Average price premium with\naerial video", { x: 5.2, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s6, "83% of Sellers", "Source: NAR Technology Survey", 0.8, 3.0, 4);
  s6.addText("Prefer an agent who uses\ndrone photography", { x: 0.8, y: 3.8, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s6.addText("Our drone package:", { x: 5.2, y: 3.0, w: 4, h: 0.4, fontSize: 12, fontFace: "Calibri", color: CREAM, margin: 0 });
  let droneItems = [
    { text: "Full parcel aerial overview", options: { bullet: true, color: CREAM, fontSize: 11, fontFace: "Calibri", breakLine: true } },
    { text: "Boundary flyover with overlaid lines", options: { bullet: true, color: CREAM, fontSize: 11, fontFace: "Calibri", breakLine: true } },
    { text: "Key feature highlights (views, creek, access)", options: { bullet: true, color: CREAM, fontSize: 11, fontFace: "Calibri", breakLine: true } },
    { text: "Approach video from main road", options: { bullet: true, color: CREAM, fontSize: 11, fontFace: "Calibri" } }
  ];
  s6.addText(droneItems, { x: 5.2, y: 3.4, w: 4.3, h: 2, margin: 0, paraSpaceAfter: 4 });

  // Slide 7: Ground Photography
  let s7 = addContentSlide(pres, "Professional Ground Photography", "Capturing the things land buyers care about.");
  addStat(s7, "32% Faster", "Source: Real Estate Exposures", 0.8, 1.2, 4);
  s7.addText("Professional photos sell faster", { x: 0.8, y: 2.0, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s7, "118% More Views", "Source: Redfin", 5.2, 1.2, 4);
  s7.addText("Online views with pro photos", { x: 5.2, y: 2.0, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addBullets(s7, [
    "View from the buildable area",
    "Quality of access road",
    "Existing improvements (cleared areas, driveways, utilities)",
    "Surrounding area for neighborhood context"
  ], 0.8, 2.8, 8.4, 2.5);

  // Slide 8: Video Tour
  let s8 = addContentSlide(pres, "Narrated Property Video Tour", "Most land listings have zero video. This immediately sets your property apart.");
  addStat(s8, "403% More Inquiries", "Source: National Association of REALTORS", 0.8, 1.2, 8);
  s8.addText("Listings with video vs. without", { x: 0.8, y: 2.0, w: 8, h: 0.3, fontSize: 12, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s8, "Only 38% of Agents", "Source: NAR Technology Survey", 0.8, 2.8, 4);
  s8.addText("Currently use video marketing", { x: 0.8, y: 3.6, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s8.addText("I narrate while the drone flies. I point out the\nbuildable ridgeline, south-facing slope, creek,\nand cleared driveway area. I tell the story of\nwhat this land can become.", { x: 5.2, y: 2.8, w: 4.3, h: 1.5, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, lineSpacingMultiple: 1.3, margin: 0 });

  // Slide 9: Survey & Maps
  let s9 = addContentSlide(pres, "Survey Plat & Boundary Maps", "Land buyers want to see exactly where the boundaries are.");
  s9.addText("What we provide:", { x: 0.8, y: 1.3, w: 8.4, h: 0.4, fontSize: 16, fontFace: "Calibri", color: CREAM, margin: 0 });
  addBullets(s9, [
    "GIS aerial overlay with approximate boundary lines",
    "Topographic contour overlay showing elevation changes",
    "Parcel map showing neighboring properties and acreage",
    "Scanned survey plat (if available)"
  ], 0.8, 1.8, 8.4, 2.5);
  s9.addText("An aerial photo with boundary lines overlaid is often\nthe difference between a click and a scroll-past.", { x: 0.8, y: 4.2, w: 8.4, h: 0.7, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 10: Property Info Package
  let s10 = addContentSlide(pres, "Property Information Package", "Answers the questions buyers will ask before they even ask them.");
  let infoItems = [
    "Zoning and restriction status", "County setback requirements",
    "Soil test / perc test results", "Well and septic feasibility",
    "Available utilities at the road", "Road maintenance agreement",
    "Flood zone status (FEMA)", "Property tax history",
    "Timber value estimate", "Surveys, easements, right-of-ways"
  ];
  addBullets(s10, infoItems.slice(0, 5), 0.8, 1.1, 4, 2.5);
  addBullets(s10, infoItems.slice(5), 5.2, 1.1, 4, 2.5);
  s10.addText("Most land listings have none of this readily available.", { x: 0.8, y: 4.2, w: 8.4, h: 0.5, fontSize: 13, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 11: Property Website
  let s11 = addContentSlide(pres, "Single Property Website", "Drone video, photos, boundary maps, info package, area details. One shareable link.");
  s11.addText("Everything a buyer needs in one place:", { x: 0.8, y: 1.3, w: 8.4, h: 0.5, fontSize: 18, fontFace: "Georgia", color: CREAM, margin: 0 });
  addBullets(s11, [
    "Drone video tour",
    "All professional photos",
    "Boundary maps and topo overlays",
    "Full property information package",
    "Area and community details",
    "Easily shareable link"
  ], 0.8, 2.0, 8.4, 2.5);

  // Slide 12: Digital Marketing
  let s12 = addContentSlide(pres, "Digital Marketing & Social Media", "Land buyers are often out of state. They're searching online from 500 miles away.");
  addStat(s12, "157% More Traffic", "Source: NAR", 0.8, 1.2, 4);
  s12.addText("Organic traffic increase with\nvideo on agent websites", { x: 0.8, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addBullets(s12, [
    "Facebook and Instagram video campaign (Western NC, off-grid, homesteading, cabin building)",
    "Posted to land-specific groups and communities",
    "YouTube for long-term search visibility",
    "Area postcards with QR code to property website"
  ], 0.8, 2.8, 8.4, 2.5);

  // Slide 13: Buyer Outreach
  let s13 = addContentSlide(pres, "Targeted Buyer Outreach", "I proactively reach out to buyer's agents and local builders.");
  s13.addText("There's a specific pool of buyers looking for\nunrestricted acreage, homestead properties,\nand buildable lots in WNC.", { x: 0.8, y: 1.3, w: 8.4, h: 1, fontSize: 18, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.3, margin: 0 });
  addBullets(s13, [
    "Contact buyer's agents actively working with land buyers",
    "Reach out to local builders and developers",
    "Create demand before listing goes live"
  ], 0.8, 2.6, 8.4, 2);

  // Slide 14: Every Agent vs. Us
  let s14 = addContentSlide(pres, "What Sets Us Apart", "Every agent vs. what we do.");
  let compHeaders = ["Every Agent", "What We Do Above & Beyond"];
  let compRows = [
    ["Cell phone photos in MLS", "Professional drone video & photography"],
    ["Sign in the yard", "Narrated drone video tour"],
    ["Basic description", "GIS boundary overlays & topo maps"],
    ["Field phone calls", "Complete property info package"],
    ["", "Dedicated property website"],
    ["", "Targeted social media campaign"],
    ["", "Builder/agent outreach"],
    ["", "Postcards with QR code"],
  ];
  addTable(s14, compHeaders, compRows, 0.8, 1.1, 8.4, [4, 4.4]);

  // Slide 15: Pricing
  let s15 = addContentSlide(pres, "Pricing Your Land", "Every parcel is unique. There's no cookie-cutter formula.");
  addStat(s15, "14 Days", "Source: Zillow / Redfin", 0.8, 1.2, 4);
  s15.addText("After 14 days, listing views\ndramatically decrease", { x: 0.8, y: 2.0, w: 4, h: 0.5, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  addStat(s15, "5 Days vs. 35 Days", "Source: HomeLight", 5.2, 1.2, 4);
  s15.addText("Priced right vs. price reduction", { x: 5.2, y: 2.0, w: 4, h: 0.3, fontSize: 11, fontFace: "Calibri", color: CREAM, margin: 0 });
  s15.addText("Factors affecting land value in WNC:", { x: 0.8, y: 2.8, w: 8.4, h: 0.4, fontSize: 14, fontFace: "Calibri", color: CREAM, margin: 0 });
  addBullets(s15, [
    "Acreage, road access, utility availability, water features",
    "Views, restrictions, soil test status, elevation",
    "Proximity to town, timber value"
  ], 0.8, 3.2, 8.4, 1.5);
  s15.addText('"Based on everything we looked at, where do you\nthink your land should be priced?"', { x: 0.8, y: 4.5, w: 8.4, h: 0.6, fontSize: 14, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 16: Commission
  let s16 = addContentSlide(pres, "Commission Structure", "Which package do you think will attract the most serious buyers?");
  let lcommHeaders = ["Service", "Package 1", "Package 2", "Package 3"];
  let lcommRows = [
    ["Listing documents & MLS", "\u2713", "\u2713", "\u2713"],
    ["Sign & lockbox", "\u2713", "\u2713", "\u2713"],
    ["Professional drone photography", "\u2713", "\u2713", "\u2713"],
    ["Ground-level pro photos", "", "\u2713", "\u2713"],
    ["Narrated drone video", "", "\u2713", "\u2713"],
    ["GIS boundary & topo overlays", "", "\u2713", "\u2713"],
    ["Property info package", "", "\u2713", "\u2713"],
    ["Property website", "", "\u2713", "\u2713"],
    ["Social media campaign", "", "\u2713", "\u2713"],
    ["Postcards + builder outreach", "", "\u2713", "\u2713"],
    ["Soil test coordination", "", "", "\u2713"],
    ["Survey coordination", "", "", "\u2713"],
    ["Commission", "5%", "7%", "8%"],
  ];
  addTable(s16, lcommHeaders, lcommRows, 0.8, 1.1, 8.4, [3.5, 1.5, 1.5, 1.5]);

  // Slide 17: Buyer Agent Comp
  let s17 = addContentSlide(pres, "Buyer Agent Compensation", "Let's review what recent comparable sales offered and how they performed.");
  s17.addText("You are no longer required to offer\nbuyer agent compensation.", { x: 0.8, y: 1.3, w: 8.4, h: 0.8, fontSize: 20, fontFace: "Georgia", color: CREAM, lineSpacingMultiple: 1.3, margin: 0 });
  s17.addText("Let's look at the data from recent land sales\nin our market.", { x: 0.8, y: 2.5, w: 8.4, h: 0.6, fontSize: 14, fontFace: "Calibri", color: MUTED, margin: 0 });

  // Slide 18: Process
  let s18 = addContentSlide(pres, "The Full Process", "From consultation to closing.");
  let lsteps1 = ["1. Agent consultation (today)", "2. Sign listing agreement", "3. Property walkthrough + drone", "4. Assemble info package", "5. Coordinate soil test / survey", "6. Photos, drone, boundary maps", "7. Create property website"];
  let lsteps2 = ["8. Create MLS listing", "9. Install sign", "10. Postcards go out", "11. Coming soon goes live", "12. Builder/agent outreach", "13. Listing goes live", "14. Social media campaign"];
  let lsteps3 = ["15. Showings (I accompany all)", "16. Review offers", "17. Negotiate", "18. Buyer due diligence", "19. Close"];
  addBullets(s18, lsteps1, 0.8, 1.1, 3, 4);
  addBullets(s18, lsteps2, 3.7, 1.1, 3, 4);
  addBullets(s18, lsteps3, 6.6, 1.1, 3, 2.5);
  s18.addText("I accompany every land showing to walk\nboundaries and answer questions on the spot.", { x: 0.8, y: 4.5, w: 8.4, h: 0.6, fontSize: 12, fontFace: "Georgia", color: GOLD, italic: true, margin: 0 });

  // Slide 19: Close
  let s19 = addContentSlide(pres, "Let's Get Started", 'Is there anything else you would need to hear from me in order to feel comfortable signing the listing agreement today?');
  s19.addText("We agreed on:", { x: 0.8, y: 1.3, w: 8.4, h: 0.5, fontSize: 18, fontFace: "Georgia", color: CREAM, margin: 0 });
  addBullets(s19, [
    "Price: $______ / $______ per acre",
    "Marketing package: ______",
    "Timeline: ______"
  ], 0.8, 1.9, 8.4, 1.5);
  s19.addText('"Is there anything else you would need to hear\nin order to feel comfortable signing the listing\nagreement today so we can get started?"', { x: 0.8, y: 3.5, w: 8.4, h: 1.2, fontSize: 18, fontFace: "Georgia", color: GOLD, italic: true, lineSpacingMultiple: 1.3, margin: 0 });

  // Slide 20: Sources
  let s20 = addContentSlide(pres, "Sources Referenced", "");
  let sources = [
    "1. Inman - MLS Aerial Imagery Analysis (68% faster)",
    "2. HomeTrack / Augi Drones - Drone Photography ROI",
    "3. NAR Technology Survey (83% prefer drone, 52% adoption)",
    "4. Real Estate Exposures - Average Days on Market Study",
    "5. Redfin - Professional Photography Analysis",
    "6. NAR - Video Statistics (403% more inquiries)",
    "7. NAR - Video Website Traffic (157% increase)",
    "8. CubiCasa / Rightmove - Floor Plan Statistics",
    "9. Zillow / Redfin - Days on Market Data",
    "10. HomeLight - Pricing Impact Study"
  ];
  addBullets(s20, sources, 0.8, 1.1, 8.4, 4.2);

  pres.writeFile({ fileName: "C:\\Users\\colem\\Projects\\coryhelpsyoumove\\marketing\\listing-presentation-land.pptx" })
    .then(() => console.log("Land PPTX created!"));
}

// Run both
createResidential();
createLand();
