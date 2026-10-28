import { TemplateAstBlock } from '@/app/(workspace)/gtm/playbooks/[id]/types';

/**
 * Sanitizes AST content blocks on save & render (Prohibition C3).
 * Strips script tags, unsafe event handlers, javascript: URIs,
 * while preserving Spintax ({a|b|c}) and dynamic localization tokens ({{token_name}}).
 */
export function sanitizeAstBlocks(blocks: TemplateAstBlock[]): TemplateAstBlock[] {
  return blocks.map((block) => {
    let cleanContent = block.content;

    // Remove script tags and contents
    cleanContent = cleanContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove on* event attributes (onclick, onload, onerror, etc.)
    cleanContent = cleanContent.replace(/on\w+="[^"]*"/gi, '');
    cleanContent = cleanContent.replace(/on\w+='[^']*'/gi, '');

    // Remove javascript: pseudo-protocols
    cleanContent = cleanContent.replace(/javascript:[^"']*/gi, '');

    // Strip unsafe iframe / object / embed tags
    cleanContent = cleanContent.replace(/<\/?(iframe|object|embed|applet|meta|link)[^>]*>/gi, '');

    return {
      ...block,
      content: cleanContent,
    };
  });
}
