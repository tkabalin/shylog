// The namespace of Shylog's <applicationdata><shylog> block in UDDF, shared
// by the export writer and the schema check.
export const shylogNamespace = "https://github.com/tkabalin/shylog/uddf"

// UDDF 3.2's own, which Subsurface needs: under any other it reads no dives.
export const uddfNamespace = "http://www.streit.cc/uddf/3.2/"

// The export's <generator> name, by which the import knows its own files.
export const generatorName = "Shylog"
