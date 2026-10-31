import { useEffect, useRef, useState } from "react"
import { diveTypes, type Settings } from "@shylog/core"

import { apiClient } from "@/api/client"
import { OptionSheet, options } from "@/components/pickers/option-sheet"
import { Switch } from "@/components/ui/switch"
import { commit } from "@/data/edits"
import {
  ErrorLine,
  FormShown,
  Label,
  PairInput,
  PickRow,
  PlainLabels,
  Reveal,
  Row,
  RowInput,
  Section,
  Segmented,
  SelectRow,
  Unit,
} from "@/dive/form/rows"
import { useDesk } from "@/hooks/use-desk"

import {
  defaultsValues,
  parseDefaults,
  type DefaultsErrors,
  type DefaultsValues,
} from "./defaults"
import { SaveFailure } from "./parts"

// The new-dive defaults, in the dive form's own controls rather than the
// board's preset lists (NOTES), saved together as each one changes.
export function DefaultsSection({ settings }: { settings: Settings }) {
  const desk = useDesk()
  const saved = defaultsValues(settings)
  const [values, setValues] = useState(saved)
  const [errors, setErrors] = useState<DefaultsErrors>({})
  const [failure, setFailure] = useState<string>()
  const [typeOpen, setTypeOpen] = useState(false)
  // Oxygen is open from the start when nitrox is saved; only a switch
  // flipped here eases it open (see Reveal), not every visit to the tab.
  const shown = useRef(false)
  useEffect(() => {
    shown.current = true
  }, [])
  // A sync that brings other settings shows them unless something is typed.
  const [base, setBase] = useState(saved)
  const changed = JSON.stringify(values) !== JSON.stringify(base)
  if (!changed && JSON.stringify(saved) !== JSON.stringify(base)) {
    setBase(saved)
    setValues(saved)
  }

  // The values the server last took. Saves run one at a time against it,
  // so a tap just after leaving a field can't land before that field.
  const last = useRef(saved)
  const queue = useRef(Promise.resolve())
  // Including what a sync brings from another phone.
  useEffect(() => {
    last.current = base
  }, [base])
  const save = (next: DefaultsValues, { waiting = false } = {}) => {
    const { errors: found, request } = parseDefaults(next)
    // Nitrox just switched on waits for its oxygen rather than calling it
    // missing; leaving the field empty says so.
    if (waiting && found.oxygen) {
      setErrors({ ...found, oxygen: undefined })
      return
    }
    setErrors(found)
    if (!request) return
    queue.current = queue.current.then(async () => {
      // A comma for a point, say: nothing to send. The defaults go as a
      // whole, as the server replaces them so.
      if (
        JSON.stringify(request) ===
        JSON.stringify(parseDefaults(last.current).request)
      )
        return
      setFailure(undefined)
      try {
        await commit(apiClient().api.settings.$put({ json: request }))
        last.current = next
        setBase(next)
      } catch (error) {
        setValues(last.current)
        setErrors({})
        setFailure(error instanceof Error ? error.message : String(error))
      }
    })
  }

  // A tap saves at once; typing saves as its field is left.
  const pick = <K extends keyof DefaultsValues>(
    name: K,
    value: DefaultsValues[K]
  ) => {
    const next = { ...values, [name]: value }
    setValues(next)
    save(next, { waiting: name === "nitrox" })
  }
  const text =
    (name: keyof DefaultsValues) => (event: { target: { value: string } }) => {
      setValues((was) => ({ ...was, [name]: event.target.value }))
      setErrors((was) => ({ ...was, [name]: undefined }))
    }
  const invalid = (name: keyof DefaultsValues) => ({
    "aria-invalid": !!errors[name] || undefined,
    "aria-describedby": errors[name] ? `error-${name}` : undefined,
  })

  return (
    <PlainLabels.Provider value>
      <FormShown.Provider value={shown}>
        <div>
          <Section title="New dive defaults">
            <div className="flex flex-col gap-2 px-4 py-3">
              <Label id="you-cylinder">Cylinder</Label>
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-end max-[374px]:grid-cols-1 max-[374px]:gap-2">
                <div
                  className="flex flex-col gap-1 pr-3"
                  role="group"
                  aria-labelledby="you-material"
                >
                  <span
                    id="you-material"
                    className="text-xs text-muted-foreground"
                  >
                    Material
                  </span>
                  <Segmented
                    labelledBy="you-material"
                    value={values.cylinderMaterial}
                    onChange={(value) => pick("cylinderMaterial", value)}
                    options={[
                      { value: "steel", label: "Steel" },
                      { value: "aluminium", label: "Aluminium" },
                    ]}
                  />
                </div>
                <PairInput
                  id="you-cylinderVolume"
                  label="Volume"
                  unit="L"
                  inputMode="decimal"
                  value={values.cylinderVolume}
                  onChange={text("cylinderVolume")}
                  onBlur={() => save(values)}
                  placeholder="—"
                  className="border-l pl-4 max-[374px]:border-l-0 max-[374px]:pl-0"
                  {...invalid("cylinderVolume")}
                />
              </div>
              <ErrorLine
                id="error-cylinderVolume"
                message={errors.cylinderVolume}
                inBlock
              />
            </div>

            <div>
              <Row>
                <Label htmlFor="you-startPressure">Start pressure</Label>
                <RowInput
                  id="you-startPressure"
                  inputMode="numeric"
                  value={values.startPressure}
                  onChange={text("startPressure")}
                  onBlur={() => save(values)}
                  placeholder="—"
                  {...invalid("startPressure")}
                />
                <Unit>bar</Unit>
              </Row>
              <ErrorLine
                id="error-startPressure"
                message={errors.startPressure}
              />
            </div>

            <div className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex min-h-8.5 items-center justify-between">
                <Label htmlFor="you-nitrox">Nitrox</Label>
                <Switch
                  id="you-nitrox"
                  checked={values.nitrox}
                  onCheckedChange={(value) => pick("nitrox", value)}
                />
              </div>
              {values.nitrox && (
                <Reveal>
                  <PairInput
                    id="you-oxygen"
                    label="Oxygen"
                    unit="%"
                    inputMode="decimal"
                    value={values.oxygen}
                    onChange={text("oxygen")}
                    onBlur={() => save(values)}
                    placeholder="—"
                    {...invalid("oxygen")}
                  />
                  <ErrorLine
                    id="error-oxygen"
                    message={errors.oxygen}
                    inBlock
                  />
                </Reveal>
              )}
            </div>

            <div>
              <Row>
                <Label htmlFor="you-weight">Weight</Label>
                <RowInput
                  id="you-weight"
                  inputMode="decimal"
                  value={values.weight}
                  onChange={text("weight")}
                  onBlur={() => save(values)}
                  placeholder="—"
                  {...invalid("weight")}
                />
                <Unit>kg</Unit>
              </Row>
              <ErrorLine id="error-weight" message={errors.weight} />
            </div>

            {desk ? (
              <SelectRow
                label="Dive type"
                value={values.diveType}
                options={options(diveTypes)}
                empty="Not set"
                onChange={(value) => pick("diveType", value)}
              />
            ) : (
              <PickRow
                label="Dive type"
                value={values.diveType && diveTypes[values.diveType].label}
                empty="Not set"
                onClick={() => setTypeOpen(true)}
              />
            )}
          </Section>
          <SaveFailure error={failure} />
          <OptionSheet
            open={typeOpen}
            onOpenChange={setTypeOpen}
            title="Dive type"
            options={options(diveTypes)}
            value={values.diveType}
            onChange={(value) => pick("diveType", value)}
          />
        </div>
      </FormShown.Provider>
    </PlainLabels.Provider>
  )
}
