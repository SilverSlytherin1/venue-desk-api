/** How messages and the feedback page greet a guest: the first word of the name they booked with. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
