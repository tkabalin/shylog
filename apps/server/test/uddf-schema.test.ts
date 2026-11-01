import { describe, expect, it } from "vitest"

import { shylogNamespace } from "../src/uddf/shylog-namespace.ts"
import { d4iXml } from "./uddf-fixtures.ts"
import { uddfSchemaErrors } from "./uddf-schema.ts"

const uddf = (applicationdata: string, tankdata = "") => `<?xml version="1.0"?>
<uddf xmlns="http://www.streit.cc/uddf/3.2/" version="3.2.1">
  <generator><name>Shylog</name></generator>
  <profiledata><repetitiongroup id="group-1"><dive id="dive-1">
    <informationbeforedive><datetime>2026-07-22T08:12:19</datetime></informationbeforedive>
    <applicationdata>${applicationdata}</applicationdata>
    ${tankdata}
    <informationafterdive><greatestdepth>20</greatestdepth><diveduration>1800</diveduration></informationafterdive>
  </dive></repetitiongroup></profiledata>
</uddf>`

describe("uddfSchemaErrors", () => {
  it("accepts Shylog's own application data and nothing else unregistered", () => {
    expect(
      uddfSchemaErrors(
        uddf(
          `<shylog xmlns="${shylogNamespace}"><surface>calm</surface></shylog>`
        )
      )
    ).toEqual([])
    expect(
      uddfSchemaErrors(uddf(`<other xmlns="https://example.com/other"/>`))
    ).toEqual([expect.stringContaining("This element is not expected")])
  })

  // Keeps a hand-logged cylinder that has no start pressure (see the spec).
  it("accepts tank data with no start pressure but checks the rest of it", () => {
    expect(
      uddfSchemaErrors(
        uddf("", "<tankdata><tankvolume>0.012</tankvolume></tankdata>")
      )
    ).toEqual([])
    expect(
      uddfSchemaErrors(
        uddf("", "<tankdata><tankvolume>big</tankvolume></tankdata>")
      )
    ).toEqual([expect.stringContaining("tankvolume")])
  })

  // So pass-through can't copy Subsurface's shape as it is (milestone 16).
  it("finds Subsurface's own D4i export invalid", () => {
    const errors = uddfSchemaErrors(d4iXml).join("\n")
    expect(errors).toContain(
      "'mix(21/0)' is not a valid value of the atomic type 'xs:ID'"
    )
    expect(errors).toContain("}samples': This element is not expected")
  })
})
