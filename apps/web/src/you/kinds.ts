import type { EntityKind } from "@shylog/core"
import {
  IconAddressBook,
  IconBuildingStore,
  IconLuggage,
  IconMap,
  IconMapPin,
} from "@tabler/icons-react"

import type { Icon } from "@/dive/form/rows"

// How the entity screens name each kind: its list's title, one and many of
// it in a sentence ("Search sites", not "Search sites dived"), and its icon
// (the Icon key's Essential set).
export const kindLabels = {
  site: { title: "Sites dived", one: "site", many: "sites", icon: IconMapPin },
  region: { title: "Regions", one: "region", many: "regions", icon: IconMap },
  person: {
    title: "People",
    one: "person",
    many: "people",
    icon: IconAddressBook,
  },
  diveCentre: {
    title: "Dive centres",
    one: "dive centre",
    many: "dive centres",
    icon: IconBuildingStore,
  },
  trip: { title: "Trips", one: "trip", many: "trips", icon: IconLuggage },
} satisfies Record<
  EntityKind,
  { title: string; one: string; many: string; icon: Icon }
>
