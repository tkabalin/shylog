// Vite's ?raw import, which Vitest resolves, gives a file's text without
// Node's fs, whose types core leaves out.
declare module "*?raw" {
  const text: string
  export default text
}
