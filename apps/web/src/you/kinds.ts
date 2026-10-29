import type { EntityKind } from "@shylog/core"
import {
  IconAddressBook,
  IconBuildingStore,
  IconLuggage,
  IconMap,
  IconMapPin,
} from "@tabler/icons-react"

import type { Icon } from "@/dive/form/rows"

// How the entity screens name each kind: its list's title, one of it in a
// sentence, and its icon (the Icon key's Essential set).
export const kindLabels = {
  site: { title: "Sites", one: "site", icon: IconMapPin },
  region: { title: "Regions", one: "region", icon: IconMap },
  person: { title: "People", one: "person", icon: IconAddressBook },
  diveCentre: {
    title: "Dive centres",
    one: "dive centre",
    icon: IconBuildingStore,
  },
  trip: { title: "Trips", one: "trip", icon: IconLuggage },
} satisfies Record<EntityKind, { title: string; one: string; icon: Icon }>
