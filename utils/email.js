// utils/email.js - Email content extraction helpers

/**
 * Get clean, LLM-friendly content from a message.
 * Uses getFull + extracts text parts and converts HTML if needed.
 */
export async function getMessageContent(messageId, maxChars = 6000) {
  try {
    const full = await browser.messages.getFull(messageId, {
      decodeContent: true,
      decodeHeaders: true,
    });

    const header = await browser.messages.get(messageId);

    let bodyText = "";

    // Try to find a good text part
    if (full.parts) {
      // Recursive search for text/plain or text/html
      bodyText = extractTextFromParts(full.parts);
    }

    // Fallback to raw if nothing found
    if (!bodyText && full.body) {
      bodyText = full.body;
    }

    // Simple HTML to text if needed (basic version)
    if (bodyText.includes("<html") || bodyText.includes("<body")) {
      bodyText = stripHtml(bodyText);
    }

    // Truncate for efficiency and token limits
    if (bodyText.length > maxChars) {
      bodyText = bodyText.substring(0, maxChars) + "\n\n[... email body truncated for LLM efficiency ...]";
    }

    return {
      subject: header.subject || "",
      from: header.author || "",
      date: header.date ? new Date(header.date).toISOString() : "",
      to: header.recipients?.join(", ") || "",
      body: bodyText.trim(),
      messageId: header.headerMessageId || "",
    };
  } catch (error) {
    console.error("Failed to get message content:", error);
    return null;
  }
}

function extractTextFromParts(parts) {
  let text = "";

  for (const part of parts) {
    if (part.contentType === "text/plain" && part.body) {
      text += part.body + "\n";
    } else if (part.contentType === "text/html" && part.body && !text) {
      // Prefer plain, but use HTML if no plain
      text = stripHtml(part.body);
    }

    if (part.parts) {
      text += extractTextFromParts(part.parts);
    }
  }
  return text;
}

function stripHtml(html) {
  // Very basic stripper (good enough for LLM context)
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
