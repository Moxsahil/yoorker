import { api } from "./api";
import type { Court, Organisation, Venue } from "./yoorker";

export async function loadDemoVenue(existingOrganisationId?: string): Promise<Venue> {
  const organisationId =
    existingOrganisationId ??
    (
      await api<Organisation>("/organisations", {
        body: { name: "Green Arena Sports" },
      })
    ).id;
  const suffix = Math.random().toString(36).slice(2, 6);
  const venue = await api<Venue>(`/organisations/${organisationId}/venues`, {
    body: {
      slug: `green-arena-${suffix}`,
      name: "Green Arena",
      address: "Plot 12, Golf Course Extension Road, Sector 57, Gurugram, Haryana",
      location: { lat: 28.4211, lng: 77.0878 },
      city: { name: "Gurugram", state: "Haryana" },
      locality: "Sector 57",
      pincode: "122011",
      amenities: ["Floodlights", "Parking", "Changing rooms", "Drinking water"],
      rules: ["No metal studs", "Arrive 10 minutes early", "Bring your own ball"],
    },
  });
  const court = (body: object) => api<Court>(`/venues/${venue.id}/courts`, { body });
  const turf1 = await court({
    name: "Turf 1",
    sports: ["FOOTBALL"],
    surface: "ARTIFICIAL_TURF",
    capacity: 14,
  });
  const turf2 = await court({
    name: "Turf 2",
    sports: ["FOOTBALL", "CRICKET"],
    surface: "ARTIFICIAL_TURF",
    capacity: 14,
  });
  const ground = await court({
    name: "Cricket ground",
    sports: ["CRICKET"],
    surface: "NATURAL_GRASS",
    capacity: 30,
  });

  const turfWeek = [
    ...[1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      windows: [{ opens: "06:00", closes: "23:00" }],
    })),
    ...[6, 7].map((weekday) => ({
      weekday,
      windows: [{ opens: "06:00", closes: "02:00" }],
    })),
  ];
  const put = (id: string, what: "schedule" | "prices", body: object) =>
    api(`/courts/${id}/${what}`, { method: "PUT", body });
  await put(turf1.id, "schedule", {
    startStepMinutes: 30,
    durations: [{ minutes: 60 }, { minutes: 90 }, { minutes: 120 }],
    days: turfWeek,
  });
  await put(turf2.id, "schedule", {
    startStepMinutes: 30,
    durations: [
      { minutes: 60, sport: "FOOTBALL" },
      { minutes: 90, sport: "FOOTBALL" },
      { minutes: 120, label: "10-over game", sport: "CRICKET" },
    ],
    days: turfWeek,
  });
  const slots = ["06:00-09:30", "12:00-15:30", "17:30-21:00", "21:00-00:30"].map((s) => {
    const [opens, closes] = s.split("-");
    return { opens, closes };
  });
  await put(ground.id, "schedule", {
    startStepMinutes: 30,
    durations: [{ minutes: 210, label: "T20 match" }],
    days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, windows: slots })),
  });

  const turfPrices = {
    basePricePerHourPaise: 120_000,
    rules: [
      {
        name: "Evening",
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        from: "18:00",
        to: "00:00",
        unit: "PER_HOUR",
        pricePaise: 160_000,
      },
      {
        name: "Weekend",
        weekdays: [6, 7],
        from: "00:00",
        to: "00:00",
        unit: "PER_HOUR",
        pricePaise: 180_000,
        priority: 10,
      },
    ],
  };
  await put(turf1.id, "prices", turfPrices);
  await put(turf2.id, "prices", turfPrices);
  const slot = (name: string, weekdays: number[], from: string, to: string, rupees: number) => ({
    name,
    weekdays,
    from,
    to,
    minutes: 210,
    unit: "PER_BOOKING",
    pricePaise: rupees * 100,
  });
  const wd = [1, 2, 3, 4, 5];
  const we = [6, 7];
  await put(ground.id, "prices", {
    basePricePerHourPaise: null,
    rules: [
      slot("Morning", wd, "06:00", "12:00", 3000),
      slot("Weekend morning", we, "06:00", "12:00", 3500),
      slot("Afternoon", wd, "12:00", "17:00", 3500),
      slot("Weekend afternoon", we, "12:00", "17:00", 4000),
      slot("Evening", wd, "17:00", "21:00", 5000),
      slot("Weekend evening", we, "17:00", "21:00", 6000),
      slot("Night", wd, "21:00", "06:00", 6000),
      slot("Weekend night", we, "21:00", "06:00", 7000),
    ],
  });

  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.now() + 86400000));
  await api(`/venues/${venue.id}/blocks`, {
    body: {
      from: `${tomorrow}T06:00`,
      to: `${tomorrow}T08:00`,
      reason: "MAINTENANCE",
      note: "Re-laying the turf",
      courtIds: [turf1.id],
    },
  });
  return venue;
}
