import * as CANNON from "cannon-es";

type CreatePhysicsWorldOptions = {
  groundY: number;
  onLand: () => void;
};

export type PhysicsWorldContext = {
  world: CANNON.World;
  defaultMaterial: CANNON.Material;
  groundBody: CANNON.Body;
};

export function createPhysicsWorld({ groundY, onLand }: CreatePhysicsWorldOptions): PhysicsWorldContext {
  const world = new CANNON.World();
  world.gravity.set(0, -25, 0);
  world.broadphase = new CANNON.NaiveBroadphase();

  const defaultMaterial = new CANNON.Material("default");
  const contactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
    friction: 0.4,
    restitution: 0.15,
  });
  world.addContactMaterial(contactMaterial);
  world.defaultContactMaterial = contactMaterial;

  const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: defaultMaterial });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.position.y = groundY;
  world.addBody(groundBody);

  const recentLands = new Set<number>();
  groundBody.addEventListener("collide", (event: { body: CANNON.Body }) => {
    const bodyId = event.body.id;
    if (!recentLands.has(bodyId)) {
      recentLands.add(bodyId);
      onLand();
      setTimeout(() => recentLands.delete(bodyId), 300);
    }
  });

  return { world, defaultMaterial, groundBody };
}
