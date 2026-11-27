import type { OrbitLineEntry } from './orbitLineObject';

/** One orbit line in the scene. Its buffers are written by the orbit layer through the entry. */
export function OrbitLine({ entry }: { entry: OrbitLineEntry }) {
  return <primitive object={entry.line} />;
}
