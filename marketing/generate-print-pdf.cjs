const PDFDocument = require("pdfkit");
const fs = require("fs");

// Colors
const DARK = "#1A1815";
const GOLD = "#8B7748";
const MUTED = "#666666";
const BLACK = "#222222";
const LIGHT_BG = "#FAFAF8";
const BORDER = "#D4CFC5";

const HEADER = "Cory Coleman  |  Keller Williams Great Smokies  |  (828) 506-6413  |  coryhelpsyoumove.com";
const FOOTER = "Equal Housing Opportunity";

function createPDF(sections, outputPath, title) {
  const doc = new PDFDocument({
    size: "letter",
    margins: { top: 85, bottom: 70, left: 65, right: 65 },
    info: { Title: title, Author: "Cory Coleman" },
    bufferPages: true
  });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const pageW = 612;
  const pageH = 792;
  const contentW = pageW - 130;

  function addHeaderFooter() {
    // Header line
    doc.save();
    doc.moveTo(65, 45).lineTo(pageW - 65, 45).strokeColor(GOLD).lineWidth(0.5).stroke();
    doc.fontSize(7).font("Helvetica").fillColor(MUTED).text(HEADER, 65, 32, { width: contentW, align: "center" });
    // Footer
    doc.moveTo(65, pageH - 45).lineTo(pageW - 65, pageH - 45).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.fontSize(7).font("Helvetica").fillColor(MUTED).text(FOOTER, 65, pageH - 38, { width: contentW, align: "center" });
    doc.restore();
  }

  let isFirstPage = true;

  sections.forEach(function(section, idx) {
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;
    addHeaderFooter();

    let y = 90;

    // Section title
    doc.fontSize(18).font("Times-Bold").fillColor(GOLD).text(section.title, 65, y, { width: contentW });
    y = doc.y + 8;

    // Gold underline
    doc.moveTo(65, y).lineTo(65 + Math.min(doc.widthOfString(section.title, { font: "Times-Bold", fontSize: 18 }), 300), y).strokeColor(GOLD).lineWidth(1).stroke();
    y += 15;

    // Content blocks
    section.blocks.forEach(function(block) {
      // Check if we need a new page
      if (y > pageH - 120) {
        doc.addPage();
        addHeaderFooter();
        y = 90;
      }

      if (block.type === "quote") {
        doc.fontSize(10.5).font("Times-Roman").fillColor(BLACK).text(block.text, 65, y, { width: contentW, lineGap: 4 });
        y = doc.y + 12;
      }
      else if (block.type === "stat") {
        // Stat box
        doc.save();
        doc.roundedRect(65, y, contentW, 38, 3).fillColor("#F5F3EE").fill();
        doc.restore();
        doc.fontSize(14).font("Times-Bold").fillColor(GOLD).text(block.stat, 75, y + 6, { width: contentW - 20 });
        doc.fontSize(8).font("Helvetica").fillColor(MUTED).text(block.detail + "  " + block.source, 75, y + 24, { width: contentW - 20 });
        y += 48;
      }
      else if (block.type === "bullets") {
        block.items.forEach(function(item) {
          if (y > pageH - 100) { doc.addPage(); addHeaderFooter(); y = 90; }
          doc.fontSize(10).font("Helvetica").fillColor(GOLD).text("\u2022", 70, y, { continued: false });
          doc.fontSize(10).font("Helvetica").fillColor(BLACK).text(item, 85, y, { width: contentW - 25, lineGap: 2 });
          y = doc.y + 5;
        });
        y += 5;
      }
      else if (block.type === "table") {
        let colW = block.colWidths || [contentW * 0.45, contentW * 0.18, contentW * 0.18, contentW * 0.18];
        let startX = 65;
        // Header row
        let hx = startX;
        doc.save();
        doc.rect(startX, y, contentW, 18).fillColor(GOLD).fill();
        doc.restore();
        block.headers.forEach(function(h, ci) {
          doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF").text(h, hx + 4, y + 4, { width: colW[ci] - 8 });
          hx += colW[ci];
        });
        y += 18;
        // Data rows
        block.rows.forEach(function(row, ri) {
          if (y > pageH - 100) { doc.addPage(); addHeaderFooter(); y = 90; }
          let bg = ri % 2 === 0 ? "#F5F3EE" : "#FFFFFF";
          doc.save();
          doc.rect(startX, y, contentW, 16).fillColor(bg).fill();
          doc.restore();
          let rx = startX;
          row.forEach(function(cell, ci) {
            let isLast = ri === block.rows.length - 1;
            let fnt = isLast ? "Helvetica-Bold" : "Helvetica";
            let clr = isLast ? GOLD : BLACK;
            doc.fontSize(8).font(fnt).fillColor(clr).text(cell, rx + 4, y + 4, { width: colW[ci] - 8 });
            rx += colW[ci];
          });
          y += 16;
        });
        // Border
        doc.save();
        doc.rect(startX, y - (block.rows.length * 16) - 18, contentW, (block.rows.length * 16) + 18).strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.restore();
        y += 10;
      }
      else if (block.type === "heading") {
        doc.fontSize(12).font("Times-Bold").fillColor(DARK).text(block.text, 65, y, { width: contentW });
        y = doc.y + 6;
      }
      else if (block.type === "emphasis") {
        doc.save();
        doc.roundedRect(65, y, contentW, 30, 3).fillColor("#F5F3EE").fill();
        doc.restore();
        doc.fontSize(10).font("Times-Italic").fillColor(GOLD).text(block.text, 75, y + 8, { width: contentW - 20 });
        y += 40;
      }
      else if (block.type === "numbered") {
        block.items.forEach(function(item, i) {
          if (y > pageH - 100) { doc.addPage(); addHeaderFooter(); y = 90; }
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor(GOLD).text((i + 1) + ".", 70, y);
          doc.fontSize(9.5).font("Helvetica").fillColor(BLACK).text(item, 90, y, { width: contentW - 30, lineGap: 2 });
          y = doc.y + 4;
        });
        y += 5;
      }
    });
  });

  // Page numbers
  let pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font("Helvetica").fillColor(MUTED).text((i + 1) + " / " + pages.count, pageW - 100, pageH - 38, { width: 35, align: "right" });
  }

  doc.end();
  return new Promise(function(resolve) { stream.on("finish", resolve); });
}

// ============================================================
// RESIDENTIAL SECTIONS
// ============================================================
const residentialSections = [
  {
    title: "Thank You for the Opportunity",
    blocks: [
      { type: "quote", text: "Thank you for the opportunity to interview for the job of helping you sell your home. My job as your real estate broker is to make as many qualified buyers aware of your property, get them through your door, and help them make a commitment to buy. So thank you for giving me that chance today." }
    ]
  },
  {
    title: "About Me & My Team",
    blocks: [
      { type: "bullets", items: [
        "Cory Coleman, Broker, Keller Williams Great Smokies",
        "Based in Sylva, NC",
        "Serving Waynesville, Sylva, Bryson City, Maggie Valley, Franklin, Cashiers, Highlands, Dillsboro, Cullowhee",
        "Haywood, Jackson, Macon, and Swain counties"
      ]},
      { type: "heading", text: "Keller Williams: #1 in the World" },
      { type: "quote", text: "Backed by Keller Williams, ranked #1 real estate franchise in the U.S. for the 4th consecutive year by agent count, transaction sides, and sales volume. 165,000+ agents across 60+ countries. $370.8 billion in sales volume in 2024. KW's AI technology won \"Best Use of AI by a Brokerage\" at the Inman Awards, and their training platform was named #1 by HousingWire." },
      { type: "emphasis", text: "What that means for you: cutting-edge marketing tools, a global referral network, and an agent backed by the best training and technology in the industry." }
    ]
  },
  {
    title: "Choose the Agent, Not the Brokerage",
    blocks: [
      { type: "quote", text: "Choose the agent who you believe will best represent you, not the brokerage name on the sign. Whether it's Keller Williams, Coldwell Banker, or RE/MAX, that brokerage isn't the one negotiating on your behalf, communicating with you, or creating your marketing. And when a buyer is searching for a home, they're not filtering by brokerage. They're looking at the property. So choose the person you trust to do the work." }
    ]
  },
  {
    title: "Professional Photography",
    blocks: [
      { type: "quote", text: "For us, it all starts with professional photography. Over half of all listings in our MLS are photographed with a cell phone. The first showing happens online. If the pictures don't stop someone mid-scroll, they're never coming to see your home." },
      { type: "stat", stat: "32% Faster", detail: "Professional photos sell faster (89 days vs. 123 days)", source: "Source: Real Estate Exposures" },
      { type: "stat", stat: "47% Higher Price/SqFt", detail: "Asking price per square foot with professional photography", source: "Source: Redfin / PR Newswire" },
      { type: "stat", stat: "118% More Online Views", detail: "Compared to cell phone photos", source: "Source: Redfin" },
      { type: "stat", stat: "$934 to $116,076 Higher", detail: "Professional photos vs. low-quality images", source: "Source: PhotoUp / Redfin" }
    ]
  },
  {
    title: "Professional Video",
    blocks: [
      { type: "quote", text: "On top of photography, we produce a narrated property video. This isn't a slideshow with music. It's a professionally shot, narrated walkthrough that tells the story of your home." },
      { type: "stat", stat: "403% More Inquiries", detail: "Listings with video vs. without", source: "Source: National Association of REALTORS" },
      { type: "stat", stat: "73% of Sellers", detail: "More likely to list with an agent who uses video", source: "Source: NAR" },
      { type: "stat", stat: "Only 38% of Agents Use Video", detail: "This puts your listing ahead of the majority", source: "Source: NAR Technology Survey" }
    ]
  },
  {
    title: "Drone Photography & Video",
    blocks: [
      { type: "quote", text: "In Western NC, drone footage matters even more than in a typical market. Mountain properties have views, acreage, creek frontage, road access, and proximity to landmarks that you simply cannot capture from the ground." },
      { type: "stat", stat: "68% Faster", detail: "Listings with aerial imagery sell faster", source: "Source: MLS data, Inman" },
      { type: "stat", stat: "83% of Sellers", detail: "Prefer an agent who uses drone photography", source: "Source: NAR Technology Survey" },
      { type: "stat", stat: "5-10% Price Premium", detail: "Properties with aerial video", source: "Source: HomeTrack / Augi Drones" }
    ]
  },
  {
    title: "Floor Plans",
    blocks: [
      { type: "quote", text: "Every listing gets a labeled floor plan with room dimensions. Buyers want to know if their furniture will fit, how the rooms flow, and whether the layout works before scheduling a showing." },
      { type: "stat", stat: "#1 Most Desired Feature", detail: "After photos, by consumers", source: "Source: 2025 NAR Survey" },
      { type: "stat", stat: "93% of Buyers", detail: "More likely to spend time on a listing with a floor plan", source: "Source: Rightmove / CubiCasa" },
      { type: "stat", stat: "52% More Click-Throughs", detail: "Listings with floor plans", source: "Source: Rightmove" }
    ]
  },
  {
    title: "Property Website & Digital Marketing",
    blocks: [
      { type: "quote", text: "Every listing gets its own dedicated property website with the video, photos, floor plan, disclosures, area maps, and all listing details. Easily shareable with a single link." },
      { type: "stat", stat: "157% More Organic Traffic", detail: "Agents who use video on their websites", source: "Source: NAR" },
      { type: "quote", text: "We run a social media marketing campaign across Facebook, Instagram, and YouTube. We also send postcards to 250-300 homes in your neighborhood, each with a QR code linking to your property website." },
      { type: "stat", stat: "10% of Buyers", detail: "Purchase because they know someone in the area", source: "Source: NAR" }
    ]
  },
  {
    title: "Proactive Agent Outreach & Open Houses",
    blocks: [
      { type: "quote", text: "I don't just list your home and wait for the phone to ring. I actively contact the highest-performing buyer's agents in your area before your listing goes live. This creates demand and excitement before day one." },
      { type: "stat", stat: "50% of Buyers", detail: "Attend open houses during their search", source: "Source: NAR" },
      { type: "stat", stat: "37% of Buyers", detail: "Attended an open house for the home they purchased", source: "Source: NAR" }
    ]
  },
  {
    title: "Getting Your Home Ready & Staging",
    blocks: [
      { type: "quote", text: "We go through a room-by-room checklist to get your house market-ready without blowing your budget. Most of the time it's cleaning, minor staging with your own furniture, and small touch-ups." },
      { type: "stat", stat: "1-10% Higher Offers", detail: "With professionally staged homes", source: "Source: 2025 NAR Home Staging Report" },
      { type: "stat", stat: "49% of Agents", detail: "Observed staging reduced time on market", source: "Source: NAR" },
      { type: "quote", text: "Most important rooms to stage: Living room (37%), Primary bedroom (34%), Kitchen (23%)" }
    ]
  },
  {
    title: "The Schedule",
    blocks: [
      { type: "heading", text: "Working Backwards From Your Target Date" },
      { type: "bullets", items: [
        "Your Prep: Room-by-room checklist (timeline varies)",
        "Marketing Prep (1 week): Photos, video, drone, floor plans, website, postcards",
        "Coming Soon (1 week): Everyone can see your listing, showings line up for launch day"
      ]},
      { type: "emphasis", text: "Coming soon compresses days on market. Instead of showings trickling in, we often have 10-20 lined up for day one." }
    ]
  },
  {
    title: "Pricing Your Home",
    blocks: [
      { type: "quote", text: "The best chance to sell your home for the most money is right after it gets listed. We want to sell in the first 14-day window." },
      { type: "stat", stat: "14 Days", detail: "After 14 days, listing views dramatically decrease", source: "Source: Zillow / Redfin" },
      { type: "stat", stat: "5 Days vs. 35 Days", detail: "Priced right: 5 days to contract. Price reduction: 35 days total", source: "Source: HomeLight" },
      { type: "emphasis", text: "\"Based on everything we looked at, where do you think your house should fall in that range?\"" }
    ]
  },
  {
    title: "Commission Structure",
    blocks: [
      { type: "table",
        headers: ["Service", "Package 1", "Package 2", "Package 3"],
        colWidths: [220, 80, 80, 80],
        rows: [
          ["Listing documents & MLS", "\u2713", "\u2713", "\u2713"],
          ["Lockbox & sign", "\u2713", "\u2713", "\u2713"],
          ["Professional photography", "\u2713", "\u2713", "\u2713"],
          ["Drone photos & video", "", "\u2713", "\u2713"],
          ["Narrated video tour", "", "\u2713", "\u2713"],
          ["Floor plans", "", "\u2713", "\u2713"],
          ["Single property website", "", "\u2713", "\u2713"],
          ["Social media campaign", "", "\u2713", "\u2713"],
          ["Neighborhood postcards", "", "\u2713", "\u2713"],
          ["Proactive agent outreach", "", "\u2713", "\u2713"],
          ["Open house", "", "\u2713", "\u2713"],
          ["Pre-listing inspection", "", "", "\u2713"],
          ["Home warranty for buyer", "", "", "\u2713"],
          ["Commission", "2.5%", "3%", "3.5%"]
        ]
      },
      { type: "emphasis", text: "\"Which of these packages do you think is going to get you the highest price for your home?\"" }
    ]
  },
  {
    title: "Buyer Agent Compensation",
    blocks: [
      { type: "quote", text: "Coming out of the NAR settlement, you are no longer required to offer buyer agent compensation. You still can if you choose to, but it's not mandatory. Let's look at the data from recent comparable sales in our market to see what's working." }
    ]
  },
  {
    title: "The Full Process",
    blocks: [
      { type: "numbered", items: [
        "Agent consultation (today)", "Sign listing agreement", "Complete disclosures",
        "Room-by-room prep checklist", "Get house ready to show", "Coordinate staging (if applicable)",
        "Professional photos, video, drone, floor plans", "Create property website",
        "Install sign and lockbox", "Create MLS listing", "Postcards go out",
        "Coming soon listing goes live", "Agent outreach begins", "Listing goes live",
        "Showings begin", "Social media campaign launches", "Daily showing feedback to you",
        "Open house", "Pre-qualify all buyers on offers", "Review offers, select best terms",
        "Negotiate", "Close"
      ]}
    ]
  },
  {
    title: "Let's Get Started",
    blocks: [
      { type: "quote", text: "So it sounds like we agreed on price, timeline, and commission. Is that all correct?" },
      { type: "emphasis", text: "\"Is there anything else you would need to hear from me in order to feel comfortable signing the listing agreement today so we can get started?\"" }
    ]
  },
  {
    title: "Sources Referenced",
    blocks: [
      { type: "numbered", items: [
        "Real Estate Exposures - Average Days on Market Study",
        "Redfin / PR Newswire - Professional Photography Price Analysis",
        "PhotoUp / Redfin - Photography Impact Data",
        "National Association of REALTORS - 2025 Profile of Home Buyers and Sellers",
        "NAR Technology Survey",
        "Inman - MLS Aerial Imagery Analysis",
        "HomeTrack / Augi Drones - Drone Photography ROI",
        "CubiCasa / Rightmove - Floor Plan Statistics",
        "mov8 Real Estate - Floor Plan Market Impact Study",
        "NAR 2025 Home Staging Report",
        "Zillow / Redfin - Days on Market Data",
        "HomeLight - Pricing Impact Study",
        "T3 Sixty Real Estate Almanac, April 2025 - KW Rankings"
      ]}
    ]
  }
];

// ============================================================
// LAND SECTIONS
// ============================================================
const landSections = [
  {
    title: "A Different Approach to Selling Land",
    blocks: [
      { type: "quote", text: "Thank you for the opportunity to interview for the job of helping you sell your land. Selling land in Western NC is a different game than selling a house. Most agents treat land like an afterthought. They stick a sign in the ground, put it in the MLS with a couple cell phone pictures, and hope someone finds it. I take a completely different approach." }
    ]
  },
  {
    title: "About Me & My Team",
    blocks: [
      { type: "bullets", items: [
        "Cory Coleman, Broker, Keller Williams Great Smokies",
        "Based in Sylva, NC",
        "Specializing in land and acreage across Haywood, Jackson, Macon, and Swain counties",
        "Expertise: unrestricted vs. restricted land, well/septic, road access, elevation, flood zones, soil tests, timber value"
      ]},
      { type: "heading", text: "Keller Williams: #1 in the World" },
      { type: "quote", text: "Backed by Keller Williams, ranked #1 real estate franchise in the U.S. for the 4th consecutive year by agent count, transaction sides, and sales volume. 165,000+ agents across 60+ countries. $370.8 billion in sales volume in 2024." },
      { type: "emphasis", text: "What that means for you: cutting-edge marketing tools, a global referral network, and an agent backed by the best training and technology in the industry." }
    ]
  },
  {
    title: "Why Land Marketing is Different",
    blocks: [
      { type: "quote", text: "Selling land is fundamentally different from selling a house. With a house, buyers walk in and picture themselves living there. With land, they have to imagine everything. Our job is to help them see the potential." },
      { type: "bullets", items: [
        "No interior to photograph",
        "Buyers can't visualize buildable area, views, or access from a listing description",
        "Boundary lines, topography, and features are invisible in standard photos",
        "Cell phone photos of trees and dirt all look the same"
      ]}
    ]
  },
  {
    title: "Professional Drone Photography & Video",
    blocks: [
      { type: "quote", text: "For land listings, drone photography isn't a nice-to-have. It's essential. A buyer in Florida or Ohio can watch a 90-second video and understand exactly what this land looks like." },
      { type: "stat", stat: "68% Faster", detail: "Listings with aerial imagery sell faster", source: "Source: MLS data, Inman" },
      { type: "stat", stat: "5-10% Price Premium", detail: "Properties with aerial video", source: "Source: HomeTrack / Augi Drones" },
      { type: "stat", stat: "83% of Sellers", detail: "Prefer an agent who uses drone photography", source: "Source: NAR Technology Survey" },
      { type: "heading", text: "Our Drone Package Includes:" },
      { type: "bullets", items: [
        "Full parcel aerial overview",
        "Boundary flyover with approximate lines overlaid",
        "Key feature highlights (views, creek, buildable areas, road frontage)",
        "Approach video showing access from the main road",
        "Still photos from multiple elevations and angles"
      ]}
    ]
  },
  {
    title: "Professional Ground Photography & Video",
    blocks: [
      { type: "stat", stat: "32% Faster", detail: "Professional photos sell faster", source: "Source: Real Estate Exposures" },
      { type: "stat", stat: "118% More Online Views", detail: "With professional photography", source: "Source: Redfin" },
      { type: "stat", stat: "403% More Inquiries", detail: "Listings with video vs. without", source: "Source: NAR" },
      { type: "quote", text: "For land, I narrate while the drone flies over your property. I point out the buildable ridgeline, south-facing slope, creek, and cleared driveway area. I tell the story of what this land can become. Most land listings have zero video." }
    ]
  },
  {
    title: "Survey Plat & Boundary Maps",
    blocks: [
      { type: "quote", text: "Land buyers want to see exactly where the boundaries are. An aerial photo with boundary lines overlaid is often the difference between a click and a scroll-past." },
      { type: "bullets", items: [
        "GIS aerial overlay with approximate boundary lines",
        "Topographic contour overlay showing elevation changes",
        "Parcel map showing neighboring properties and acreage",
        "Scanned survey plat (if available)"
      ]}
    ]
  },
  {
    title: "Property Information Package",
    blocks: [
      { type: "quote", text: "For every land listing, I assemble a complete property information package that answers the questions buyers will ask before they even ask them. Most land listings have none of this readily available." },
      { type: "bullets", items: [
        "Zoning and restriction status (unrestricted vs. HOA/deed restricted)",
        "County setback and building requirements",
        "Soil test/perc test results (if available)",
        "Well and septic feasibility",
        "Available utilities (power, water, internet at the road)",
        "Road maintenance agreement (if private road)",
        "Flood zone status (FEMA map)",
        "Property tax history and current assessment",
        "Timber value estimate (for heavily wooded parcels)",
        "Any existing surveys, easements, or right-of-ways"
      ]}
    ]
  },
  {
    title: "Property Website & Digital Marketing",
    blocks: [
      { type: "quote", text: "Every land listing gets its own dedicated property website with drone video, photos, boundary maps, the full information package, and area details. Easily shareable with a single link." },
      { type: "stat", stat: "157% More Organic Traffic", detail: "Agents who use video on websites", source: "Source: NAR" },
      { type: "heading", text: "Our Land Marketing Strategy:" },
      { type: "bullets", items: [
        "Facebook and Instagram video campaign (Western NC, off-grid, homesteading, cabin building)",
        "Posted to land-specific groups and communities",
        "YouTube for long-term search visibility",
        "Area postcards with QR code to property website",
        "Proactive outreach to buyer's agents and local builders"
      ]},
      { type: "emphasis", text: "Land buyers are often coming from out of state, searching online from 500 miles away. Our digital presence makes sure they find your property." }
    ]
  },
  {
    title: "Pricing Your Land",
    blocks: [
      { type: "quote", text: "Land is harder to price than a house because every parcel is unique. There's no cookie-cutter formula." },
      { type: "heading", text: "Factors That Affect Land Value in WNC:" },
      { type: "bullets", items: [
        "Acreage and usable/buildable area",
        "Road access (paved vs. gravel vs. 4WD only)",
        "Utility availability at the lot line",
        "Water features (creek, spring, river frontage)",
        "Views (long-range mountain views command premiums)",
        "Restrictions (unrestricted typically sells for more)",
        "Soil test/septic approval status",
        "Elevation, sun exposure, proximity to town, timber value"
      ]},
      { type: "stat", stat: "14 Days", detail: "After 14 days, listing views dramatically decrease", source: "Source: Zillow / Redfin" },
      { type: "stat", stat: "5 Days vs. 35 Days", detail: "Priced right vs. price reduction needed", source: "Source: HomeLight" }
    ]
  },
  {
    title: "Commission Structure",
    blocks: [
      { type: "table",
        headers: ["Service", "Package 1", "Package 2", "Package 3"],
        colWidths: [220, 80, 80, 80],
        rows: [
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
          ["Commission", "5%", "7%", "8%"]
        ]
      },
      { type: "emphasis", text: "\"Which of these packages do you think is going to attract the most serious buyers and get you the best price?\"" }
    ]
  },
  {
    title: "The Full Process",
    blocks: [
      { type: "numbered", items: [
        "Agent consultation (today)", "Sign listing agreement",
        "Property walkthrough with photographer/drone operator",
        "Assemble property information package",
        "Coordinate soil test or survey (if needed)",
        "Professional photos, drone video, boundary maps",
        "Create property website", "Create MLS listing with full info package",
        "Install sign", "Postcards go out", "Coming soon listing goes live",
        "Builder and agent outreach begins", "Listing goes live",
        "Social media campaign launches",
        "Showings (I accompany all land showings to walk boundaries)",
        "Review offers", "Negotiate", "Buyer due diligence period", "Close"
      ]},
      { type: "emphasis", text: "I accompany every land showing. Land requires someone who knows the property to walk boundaries, point out features, and answer questions on the spot." }
    ]
  },
  {
    title: "Let's Get Started",
    blocks: [
      { type: "quote", text: "So it sounds like we agreed on price, marketing package, and timeline. Is that all correct?" },
      { type: "emphasis", text: "\"Is there anything else you would need to hear from me in order to feel comfortable signing the listing agreement today so we can get started?\"" }
    ]
  },
  {
    title: "Sources Referenced",
    blocks: [
      { type: "numbered", items: [
        "Inman - MLS Aerial Imagery Analysis (68% faster with drone)",
        "HomeTrack / Augi Drones - Drone Photography ROI (5-10% premium)",
        "NAR Technology Survey (83% prefer drone, 52% adoption rate)",
        "Real Estate Exposures - Average Days on Market Study (32% faster)",
        "Redfin - Professional Photography Analysis (47% higher/sqft, 118% more views)",
        "National Association of REALTORS - Video Statistics (403% more inquiries)",
        "NAR - Video Website Traffic (157% organic increase)",
        "Zillow / Redfin - Days on Market Decline Data",
        "HomeLight - Pricing Impact Study (5 days vs 35 days)",
        "T3 Sixty Real Estate Almanac, April 2025 - KW Rankings"
      ]}
    ]
  }
];

// Generate both PDFs
async function main() {
  await createPDF(residentialSections, "C:\\Users\\colem\\Projects\\coryhelpsyoumove\\marketing\\listing-presentation-residential-print.pdf", "Residential Listing Presentation - Cory Coleman");
  console.log("Residential PDF created!");
  await createPDF(landSections, "C:\\Users\\colem\\Projects\\coryhelpsyoumove\\marketing\\listing-presentation-land-print.pdf", "Land Listing Presentation - Cory Coleman");
  console.log("Land PDF created!");
}
main();
