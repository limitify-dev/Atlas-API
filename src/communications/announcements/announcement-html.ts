import sanitizeHtml from 'sanitize-html';

// Whitelist mirrors exactly what the web admin's rich text toolbar can
// produce (bold/italic/underline/lists/links). Anything else — scripts,
// event handler attributes, iframes, etc. — is stripped. This runs
// server-side as the source of truth; the client also sanitizes before
// submit, but that can be bypassed by calling the API directly.
export function sanitizeAnnouncementContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    },
  }).trim();
}

// Push notifications and the in-app notification bell render as plain
// text, not HTML — strip all markup down to a readable preview string.
export function announcementContentToPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}
