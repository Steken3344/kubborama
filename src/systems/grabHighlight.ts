import {
  Color,
  createSystem,
  Grabbed,
  Hovered,
  Mesh,
  RayInteractable,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { StickState } from '../components/stick-state.js';
import { woodMaterial } from '../scene-assets/materials.js';

// A clone, never the shared instance itself — see
// .claude/rules/assets-and-manifest.md: reassigning a placed clone's
// `.material` is fine, mutating the shared material in place is not
// (it's shared across every stick/kubb/stake).
const highlightMaterial = woodMaterial.clone();
highlightMaterial.emissive = new Color(0xfff0a0);
highlightMaterial.emissiveIntensity = 0.55;

/**
 * Warm emissive glow on a stick's contours while it's in ray range to
 * grab (RayInteractable + Hovered, the documented pattern — see
 * @iwsdk/core's state-tags.d.ts). Excludes Grabbed sticks: once held,
 * there's nothing left to advertise.
 */
export class GrabHighlightSystem extends createSystem({
  sticks: {
    required: [StickState, RayInteractable],
    excluded: [Grabbed],
  },
}) {
  private hoveredEntities = new Set<number>();

  init(): void {
    this.queries.sticks.subscribe('disqualify', (entity) => {
      this.hoveredEntities.delete(entity.index);
      this.setHighlighted(entity, false);
    });
  }

  update(): void {
    for (const entity of this.queries.sticks.entities) {
      const isHovered = entity.hasComponent(Hovered);
      const wasHovered = this.hoveredEntities.has(entity.index);
      if (isHovered === wasHovered) {
        continue;
      }
      if (isHovered) {
        this.hoveredEntities.add(entity.index);
      } else {
        this.hoveredEntities.delete(entity.index);
      }
      this.setHighlighted(entity, isHovered);
    }
  }

  private setHighlighted(entity: Entity, highlighted: boolean): void {
    const object3D = entity.object3D;
    if (!object3D) {
      return;
    }
    object3D.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = highlighted ? highlightMaterial : woodMaterial;
      }
    });
  }
}
