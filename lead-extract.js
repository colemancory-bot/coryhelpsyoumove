// lead-extract.js — pure, testable extraction of {first_name,last_name,email,phone}
// from a chatbot conversation. Loaded as a browser global before app.js, and
// require()-able in Node for tests.
//
// Why this exists: the old inline regex in app.js scraped the WHOLE transcript
// and (a) grabbed any 10-digit run as a phone — so a parcel/Map number became a
// phone — and (b) matched "I am interested" as a name. This module fixes both:
//   - A number is only treated as a phone when we have CONFIDENCE it is one:
//     the assistant asked for a phone, OR the user gave clear phone context
//     ("call me at", "my number is", "cell"). Parcel/map/lot context is stripped.
//   - 7-digit numbers assume the 828 (Western NC) area code; a leading 1 is dropped.
//   - Names come from an explicit "my name is X" first; "I'm/I am X" only counts
//     when X is capitalized and not a filler word.
(function (root) {
  var STOPWORDS = /^(interested|looking|trying|hoping|thinking|selling|buying|wondering|planning|reaching|considering|searching|ready|not|just|still|also|going|gonna|here|new|sure|okay|ok|yes|yeah|a|an|the|in|on|at|to|from|with|about)$/i;

  function cleanName(raw) {
    if (!raw) return null;
    var words = raw.trim().split(/\s+/).slice(0, 2);
    if (!words.length) return null;
    // First token must look like a name: capitalized in the original, not filler.
    if (STOPWORDS.test(words[0]) || !/^[A-Z]/.test(words[0])) return null;
    // Drop a trailing token that isn't a clean capitalized word.
    if (words[1] && (STOPWORDS.test(words[1]) || !/^[A-Z]/.test(words[1]))) {
      words = [words[0]];
    }
    return words.join(" ");
  }

  function normalizePhone(raw) {
    var d = String(raw).replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    if (d.length === 7) d = "828" + d; // Western NC default
    if (d.length !== 10) return "";
    return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
  }

  // Remove parcel/map/lot/etc. numbers so they can never be read as a phone.
  function stripNonPhone(text) {
    return text
      .replace(/\b(?:map|parcel|pin|mls|zip|acres?|suite|ste|apt|unit|lot)\b\s*(?:#|number|num|no\.?)?\s*#?\s*\d[\d,.\-]*/gi, " ")
      .replace(/#\s*\d[\d,.\-]*/g, " ");
  }

  function findPhone(text) {
    var cleaned = stripNonPhone(text);
    // 10 digits (optional +1, any separators).
    var m = cleaned.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (m) return normalizePhone(m[0]);
    // 7 digits, but only when separated (avoids matching random digit runs).
    var m7 = cleaned.match(/\b\d{3}[-.\s]\d{4}\b/);
    if (m7) return normalizePhone(m7[0]);
    return "";
  }

  var ASSISTANT_ASKS_PHONE = /\b(phone|best number|number to reach|reach you|call you|good number|cell|mobile|contact number)\b/i;
  var USER_PHONE_CONTEXT = /\b(my number|number is|phone is|call me|reach me|text me|cell|mobile|here'?s my)\b/i;

  function extractLeadFromConversation(convHistory) {
    var result = { first_name: "", last_name: "", email: "", phone: "" };
    if (!Array.isArray(convHistory) || !convHistory.length) return result;

    var userMsgs = [];
    for (var i = 0; i < convHistory.length; i++) {
      var m = convHistory[i];
      if (m && m.role === "user" && typeof m.content === "string") userMsgs.push(m.content);
    }
    if (!userMsgs.length) return result;

    // EMAIL — first match in any user message.
    for (var e = 0; e < userMsgs.length; e++) {
      var em = userMsgs[e].match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      if (em) { result.email = em[0]; break; }
    }

    // NAME — explicit "my name is X" wins; then "I'm/I am/this is X" if it
    // looks like a real (capitalized, non-filler) name; then a bare short name.
    var nameWord = "[A-Za-z][a-zA-Z'’-]*";
    var nameCap = "(" + nameWord + "(?:\\s+" + nameWord + ")?)";
    var reExplicit = new RegExp("(?:my name is|name['’]s|name is)\\s+" + nameCap, "i");
    var reCasual = new RegExp("(?:this is|call me|i['’]m|i am)\\s+" + nameCap, "i");
    var found = null;
    for (var a = 0; a < userMsgs.length && !found; a++) {
      var x = userMsgs[a].match(reExplicit);
      if (x) found = cleanName(x[1]);
    }
    for (var b = 0; b < userMsgs.length && !found; b++) {
      var y = userMsgs[b].match(reCasual);
      if (y) found = cleanName(y[1]);
    }
    if (!found) {
      for (var c = 0; c < Math.min(userMsgs.length, 6) && !found; c++) {
        var t = userMsgs[c].trim();
        if (t.length < 30 && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(t)) found = cleanName(t);
      }
    }
    if (found) {
      var parts = found.split(/\s+/);
      result.first_name = parts[0] || "";
      result.last_name = parts.slice(1).join(" ") || "";
    }

    // PHONE — only when confident: the assistant asked, or the user gave phone
    // context. Walk in order so an ask "arms" the following user replies.
    var asked = false;
    for (var p = 0; p < convHistory.length; p++) {
      var msg = convHistory[p];
      if (!msg || typeof msg.content !== "string") continue;
      if (msg.role === "assistant") {
        if (ASSISTANT_ASKS_PHONE.test(msg.content)) asked = true;
        continue;
      }
      if (msg.role === "user") {
        if (asked || USER_PHONE_CONTEXT.test(msg.content)) {
          var ph = findPhone(msg.content);
          if (ph) { result.phone = ph; break; }
        }
      }
    }

    return result;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { extractLeadFromConversation };
  }
  if (typeof window !== "undefined") {
    window.extractLeadFromConversation = extractLeadFromConversation;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
