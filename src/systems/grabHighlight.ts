import {
  Color,
  createSystem,
  Grabbed,
  Hovered,
  Mesh,
  OneHandGrabbable,
  RayInteractable,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { woodMaterial } from '../scene-assets/materials.js';

// A clone, never the shared instance itself — see
// .claude/rules/assets-and-manifest.md: reassigning a placed clone's
// `.material` is fine, mutating the shared material in place is not
// (it's shared across every stick/kubb/stake).
const highlightMaterial = woodMaterial.clone();
highlightMaterial.emissive = new Color(0xfff0a0);
highlightMaterial.emissiveIntensity = 0.55;

/**
 * Warm emissive glow on a grabbable piece's contours while it's in ray
 * range to grab (RayInteractable + Hovered, the documented pattern — see
 * @iwsdk/core's state-tags.d.ts): sticks, and since 2026-11-01 the kubbs
 * waiting to be tossed (InkastSystem makes them grabbable). Excludes
 * Grabbed pieces: once held, there's nothing left to advertise.
 */
export class GrabHighlightSystem extends createSystem({
  sticks: {
    required: [OneHandGrabbable, RayInteractable],
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
