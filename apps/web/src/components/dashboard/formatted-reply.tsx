/**
 * Renders WhatsApp-style `*bold*` (single asterisk) as actual bold text.
 * The AI's replies are written once and sent to both WhatsApp and the web
 * chat surfaces, so the web side has to understand WhatsApp's markdown
 * subset rather than showing the literal asterisks.
 */
export function FormattedReply({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <strong key={i} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
