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
import { SaveLine } from "./parts"

// The new-dive defaults, in the dive form's own controls rather than the
// board's preset lists (NOTES), saved together.
export function DefaultsSection({ settings }: { settings: Settings }) {
  const desk = useDesk()
  const saved = defaultsValues(settings)
  const [values, setValues] = useState(saved)
  const [errors, setErrors] = useState<DefaultsErrors>({})
  const [busy, setBusy] = useState(false)
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

  const set =
    <K extends keyof DefaultsValues>(name: K) =>
    (value: DefaultsValues[K]) => {
      setValues((was) => ({ ...was, [name]: value }))
      setErrors((was) => ({ ...was, [name]: undefined }))
    }
  const text =
    (name: keyof DefaultsValues) => (event: { target: { value: string } }) =>
      set(name)(event.target.value as never)
  const invalid = (name: keyof DefaultsValues) => ({
    "aria-invalid": !!errors[name] || undefined,
    "aria-describedby": errors[name] ? `error-${name}` : undefined,
  })

  const save = async () => {
    const { errors: found, request } = parseDefaults(values)
    setErrors(found)
    if (!request) return
    // A comma for a point, say: nothing to send. The defaults go as a
    // whole, as the server replaces them so.
    if (
      JSON.stringify(request) === JSON.stringify(parseDefaults(base).request)
    ) {
      setValues(base)
      return
    }
    setBusy(true)
    setFailure(undefined)
    try {
      await commit(apiClient().api.settings.$put({ json: request }))
      setBase(values)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

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
                    onChange={set("cylinderMaterial")}
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
                  onCheckedChange={set("nitrox")}
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
                onChange={set("diveType")}
              />
            ) : (
              <PickRow
                label="Dive type"
                value={values.diveType && diveTypes[values.diveType].label}
                empty="Not set"
                onClick={() => setTypeOpen(true)}
              />
            )}

            <div
              role="group"
              aria-labelledby="you-visibility"
              className="flex flex-col gap-2 px-4 py-3"
            >
              <Label id="you-visibility">Visibility as</Label>
              <Segmented
                labelledBy="you-visibility"
                value={values.visibilityMode}
                // One of the two is always chosen, so a second tap keeps it.
                onChange={(mode) => mode && set("visibilityMode")(mode)}
                options={[
                  { value: "metres", label: "Metres" },
                  { value: "rating", label: "Low, average, high" },
                ]}
              />
            </div>
          </Section>
          <SaveLine
            shown={changed}
            busy={busy}
            error={failure}
            onSave={save}
            onCancel={() => {
              setValues(base)
              setErrors({})
              setFailure(undefined)
            }}
          />
          <OptionSheet
            open={typeOpen}
            onOpenChange={setTypeOpen}
            title="Dive type"
            options={options(diveTypes)}
            value={values.diveType}
            onChange={set("diveType")}
          />
        </div>
      </FormShown.Provider>
    </PlainLabels.Provider>
  )
}
