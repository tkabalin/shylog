// Letters that Unicode does not decompose into a base letter and an accent
// (Vietnamese đ above all), or whose capital lowercases to something else
// (ı, ß). Curly quotes fold too, since iOS types ’ where an import has '.
const folds: Record<string, string> = {
  đ: "d",
  ł: "l",
  ø: "o",
  ı: "i",
  ß: "ss",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
}

// The deduplication key for a name: case, spacing and accents on Latin
// letters ignored; the stored name keeps whatever was typed. Marks in other
// scripts (й, ё, ガ) are kept, since they change the word.
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, "$1")
    .toLowerCase()
    .replace(/[đłøıß‘’“”]/g, (char) => folds[char])
    .replace(/\s+/g, " ")
    .trim()
}

// Sites and regions are unique by name within a country.
export function placeKey(name: string, countryCode: string): string {
  return `${countryCode}:${normaliseName(name)}`
}
