import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export function createThickEdges(
  geometry: THREE.BufferGeometry,
  color: number,
  lineWidth: number,
  thresholdAngle = 1
): Line2 {
  const edges = new THREE.EdgesGeometry(geometry, thresholdAngle);
  const posAttr = edges.attributes.position;
  const positions: number[] = [];
  for (let i = 0; i < posAttr.count; i += 2) {
    positions.push(
      posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i),
      posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)
    );
  }
  const lineGeo = new LineGeometry();
  lineGeo.setPositions(positions);
  const lineMat = new LineMaterial({
    color,
    linewidth: lineWidth,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });
  return new Line2(lineGeo, lineMat);
}
