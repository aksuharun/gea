let counter: number | null = null

/**
 * A process-unique component id.
 *
 * Deliberately base 10, not base 36. `Number.prototype.toString(radix)` is only
 * exactly specified for a receiver that is a safe integer, and a compiler that
 * proves its output rather than trusting it cannot establish that for a runtime
 * counter without an integer-domain analysis — so the radix form is refused on
 * the embedded target, where this module is compiled ahead of time.
 *
 * The radix only ever bought a shorter string. Ids stay just as unique.
 */
export function getComponentId(): string {
  counter ??= Math.floor(Math.random() * 2147483648)
  return (counter++).toString()
}
