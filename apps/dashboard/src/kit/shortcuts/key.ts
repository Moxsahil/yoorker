export function pressedKey(event: KeyboardEvent): string {
  return typeof event.key === "string" ? event.key.toLowerCase() : "";
}
