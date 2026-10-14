/** Joins truthy class names. Small enough not to justify a dependency. */
export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
