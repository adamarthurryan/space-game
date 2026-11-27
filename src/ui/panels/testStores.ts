/** Store resets for the UI component tests. Test-only. */

import { createSandboxWorld } from '../../gen/scenario';
import { useView } from '../../store/useView';
import { useWorld } from '../../store/useWorld';

const initialView = useView.getState();

/** A fresh sandbox world and the initial view. */
export function resetStores(): void {
  useView.setState(initialView, true);
  useWorld.setState({ world: createSandboxWorld(), version: 0 });
}
