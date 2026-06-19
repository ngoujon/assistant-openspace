/** Mots-clés indiquant une intention de retouche du livrable Markdown. */
const MERGE_INTENT_PATTERNS: RegExp[] = [
  /\bajoute?\b/i,
  /\bmodifi(e|er|é|cation)\b/i,
  /\bcorrige?\b/i,
  /\bréécris\b/i,
  /\bréécrire\b/i,
  /\bsupprime?\b/i,
  /\bintègre?\b/i,
  /\bremplace?\b/i,
  /\bsection\b/i,
  /\blivrable\b/i,
  /\bdocument\b/i,
  /\brapport\b/i,
  /\breadme\b/i,
  /\bmets?\s+à\s+jour\b/i,
  /\bmettre\s+à\s+jour\b/i,
  /\bactualise?\b/i,
  /\brévise?\b/i,
  /\bprécise?\b/i,
  /\bcomplète?\b/i,
  /\benlève?\b/i,
  /\bretire?\b/i,
];

/**
 * Détermine si un message discussion doit déclencher la fusion automatique du livrable.
 * Les messages purement conversationnels évitent un appel LLM coûteux.
 */
export function shouldAutoMergeArtifact(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return MERGE_INTENT_PATTERNS.some((rx) => rx.test(text));
}
