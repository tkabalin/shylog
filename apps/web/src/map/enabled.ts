// Off on an instance whose diver dives away from the map's Cape Town, set
// by SHYLOG_EXPLORE in the page the server sends. With no tag (the Vite dev
// server's page) the map stays on.
export const exploreOn =
  document
    .querySelector('meta[name="shylog-explore"]')
    ?.getAttribute("content") !== "off"
