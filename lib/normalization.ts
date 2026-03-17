export function normalizeComparable(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeLooseLookup(value: string | null | undefined) {
  return normalizeComparable(value).replace(/[^a-z0-9]+/gi, " ").trim();
}
