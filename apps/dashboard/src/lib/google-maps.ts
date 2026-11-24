const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const hasGoogleMaps = Boolean(KEY);

let ready: Promise<void> | null = null;

function load(): Promise<void> {
  if (!KEY) return Promise.reject(new Error("Google Maps isn't set up"));
  ready ??= new Promise<void>((resolve, reject) => {
    const callback = "__yoorkerMapsReady";
    (window as unknown as Record<string, () => void>)[callback] = resolve;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key: KEY,
      v: "weekly",
      loading: "async",
      language: "en",
      region: "IN",
      callback,
    })}`;
    script.async = true;
    script.onerror = () => {
      ready = null;
      script.remove();
      reject(new Error("Couldn't load Google Maps. Check your connection."));
    };
    document.head.append(script);
  });
  return ready;
}

export interface AddressFields {
  address: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
}

export interface FoundPlace extends AddressFields {
  name: string;
  lat: number;
  lng: number;
}

export interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

type Component = { name: string; types: string[] };

function fromComponents(components: Component[], formatted: string | null | undefined) {
  const first = (...types: string[]) =>
    types.map((type) => components.find((c) => c.types.includes(type))?.name).find(Boolean) ?? "";
  return {
    address: (formatted ?? "").replace(/,\s*India$/, ""),
    locality: first("sublocality_level_1", "sublocality", "neighborhood"),
    city: first("locality", "administrative_area_level_3", "administrative_area_level_2"),
    state: first("administrative_area_level_1"),
    pincode: first("postal_code").replace(/\s/g, ""),
  };
}

export async function newSearchSession() {
  await load();
  const { AutocompleteSessionToken } = (await google.maps.importLibrary(
    "places",
  )) as google.maps.PlacesLibrary;
  return new AutocompleteSessionToken();
}

export async function suggestPlaces(
  input: string,
  sessionToken: google.maps.places.AutocompleteSessionToken,
): Promise<Suggestion[]> {
  await load();
  const { AutocompleteSuggestion } = (await google.maps.importLibrary(
    "places",
  )) as google.maps.PlacesLibrary;
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    includedRegionCodes: ["in"],
    language: "en-IN",
  });
  return suggestions.flatMap(({ placePrediction: p }) =>
    p
      ? [
          {
            id: p.placeId,
            main: p.mainText?.text ?? p.text.text,
            secondary: p.secondaryText?.text ?? "",
            prediction: p,
          },
        ]
      : [],
  );
}

export async function placeDetails(suggestion: Suggestion): Promise<FoundPlace> {
  const place = suggestion.prediction.toPlace();
  await place.fetchFields({
    fields: ["displayName", "formattedAddress", "location", "addressComponents", "types"],
  });
  if (!place.location) throw new Error("Google has no pin for that place");
  return {
    name: place.types?.some((type) => type === "establishment" || type === "point_of_interest")
      ? (place.displayName ?? "")
      : "",
    lat: place.location.lat(),
    lng: place.location.lng(),
    ...fromComponents(
      (place.addressComponents ?? []).map((c) => ({ name: c.longText ?? "", types: c.types })),
      place.formattedAddress,
    ),
  };
}

async function geocode(request: google.maps.GeocoderRequest) {
  await load();
  const { Geocoder } = (await google.maps.importLibrary(
    "geocoding",
  )) as google.maps.GeocodingLibrary;
  const results = await new Geocoder()
    .geocode({ ...request, language: "en" })
    .then((response) => response.results)
    .catch((error: { code?: string }) => {
      if (error.code === "ZERO_RESULTS") return [];
      throw error;
    });
  const best = results[0];
  if (!best) return null;
  return {
    lat: best.geometry.location.lat(),
    lng: best.geometry.location.lng(),
    ...fromComponents(
      best.address_components.map((c) => ({ name: c.long_name, types: c.types })),
      best.formatted_address,
    ),
  };
}

export const addressAt = (lat: number, lng: number) => geocode({ location: { lat, lng } });

export const findAddress = (query: string) =>
  geocode({ address: query, componentRestrictions: { country: "IN" } });
