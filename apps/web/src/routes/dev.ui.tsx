import { createFileRoute, notFound } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// The shell has no controls yet, so e2e/shell.spec.ts measures touch sizes
// here. Production builds 404 and leave the page component out.
export const Route = createFileRoute("/dev/ui")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: import.meta.env.DEV ? DevUiPage : () => null,
})

const items = [
  { label: "Salt", value: "salt" },
  { label: "Fresh", value: "fresh" },
]

function DevUiPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">UI sample</h1>
      <Button>Save</Button>
      <Input aria-label="Site" placeholder="Site" />
      <Select items={items}>
        <SelectTrigger aria-label="Water">
          <SelectValue placeholder="Water" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <ItemGroup>
        <Item variant="outline" render={<a href="#row" />}>
          <ItemContent>
            <ItemTitle>Partridge Point</ItemTitle>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  )
}
