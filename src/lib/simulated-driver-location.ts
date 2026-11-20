import { distanceMeters } from "../server/dispatch/geography";
import type { DriverLocationProvider, DriverLocationUpdate, VehicleType } from "./driver-location";

export const syntheticPickup: [number, number] = [-0.187, 5.6037];
const stepX = .008;
const stepY = .007;
const extent = 8;
type Node = { x: number; y: number };
export type Behavior = "IDLE" | "WAITING" | "CRUISING" | "REPOSITIONING" | "APPROACHING_PICKUP" | "AT_PICKUP" | "ON_TRIP" | "OFFLINE";
type Profile = { minSpeed: number; maxSpeed: number; acceleration: number; deceleration: number; waitMin: number; waitMax: number };
export const MotorcycleMovementProfile: Profile = { minSpeed: 15 / 3.6, maxSpeed: 35 / 3.6, acceleration: .9, deceleration: 1.4, waitMin: 5, waitMax: 25 };
export const CabMovementProfile: Profile = { minSpeed: 10 / 3.6, maxSpeed: 30 / 3.6, acceleration: .5, deceleration: .8, waitMin: 15, waitMax: 55 };
const hotspots: Node[] = [{ x: -5, y: 4 }, { x: 4, y: 4 }, { x: -3, y: -4 }, { x: 5, y: -3 }, { x: 0, y: 2 }, { x: 6, y: 6 }];

export type SimulatedAgent = {
  id: string; vehicle: VehicleType; from: Node; to: Node; previous: Node | null;
  objective: Node; progress: number; speed: number; targetSpeed: number; heading: number;
  state: Behavior; waitSeconds: number; rng: number; segmentLength: number;
};

function random(agent: SimulatedAgent): number {
  agent.rng = (Math.imul(agent.rng, 1664525) + 1013904223) >>> 0;
  return agent.rng / 4294967296;
}
function same(a: Node, b: Node) { return a.x === b.x && a.y === b.y; }
function point(node: Node): [number, number] { return [syntheticPickup[0] + node.x * stepX, syntheticPickup[1] + node.y * stepY]; }
function length(a: Node, b: Node) {
  const [longitude, latitude] = point(a), [lon, lat] = point(b);
  return distanceMeters({ longitude, latitude }, { longitude: lon, latitude: lat });
}
function heading(a: Node, b: Node) {
  return (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
}
function neighbors(node: Node): Node[] {
  return [{ x: node.x + 1, y: node.y }, { x: node.x - 1, y: node.y }, { x: node.x, y: node.y + 1 }, { x: node.x, y: node.y - 1 }]
    .filter((n) => Math.abs(n.x) <= extent && Math.abs(n.y) <= extent);
}
function chooseNext(agent: SimulatedAgent): Node {
  const options = neighbors(agent.to).filter((node) => !agent.previous || !same(node, agent.previous));
  const ranked = options.map((node) => ({
    node,
    score: Math.abs(node.x - agent.objective.x) + Math.abs(node.y - agent.objective.y) + random(agent) * 3,
  }));
  ranked.sort((a, b) => a.score - b.score);
  return ranked[0].node;
}

export function syntheticRoads(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = -extent; i <= extent; i++) {
    for (const [a, b] of [[{ x: -extent, y: i }, { x: extent, y: i }], [{ x: i, y: -extent }, { x: i, y: extent }]]) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [point(a), point(b)] } });
    }
  }
  return { type: "FeatureCollection", features };
}

export class SimulatedDriverLocationProvider implements DriverLocationProvider {
  readonly agents: SimulatedAgent[];
  private lastTime: number | null = null;
  constructor(seed: number, count = 30) {
    this.agents = Array.from({ length: count }, (_, i) => {
      const agent: SimulatedAgent = {
        id: `sim-${i}`, vehicle: i % 2 ? "TAXI" : "RIDE", from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, previous: null,
        objective: hotspots[0], progress: 0, speed: 0, targetSpeed: 0, heading: 90, state: "CRUISING", waitSeconds: 0,
        rng: (seed + Math.imul(i + 1, 2654435761)) >>> 0, segmentLength: 0,
      };
      const spread = i < 12 ? 2 : 6;
      agent.from = { x: Math.floor(random(agent) * (spread * 2 + 1)) - spread, y: Math.floor(random(agent) * (spread * 2 + 1)) - spread };
      const choices = neighbors(agent.from);
      agent.to = choices[Math.floor(random(agent) * choices.length)];
      agent.objective = hotspots[Math.floor(random(agent) * hotspots.length)];
      agent.progress = random(agent) * .9;
      agent.segmentLength = length(agent.from, agent.to);
      agent.heading = heading(agent.from, agent.to);
      const profile = agent.vehicle === "RIDE" ? MotorcycleMovementProfile : CabMovementProfile;
      agent.targetSpeed = profile.minSpeed + random(agent) * (profile.maxSpeed - profile.minSpeed);
      agent.speed = agent.targetSpeed * random(agent);
      if (random(agent) < .35) { agent.state = "WAITING"; agent.waitSeconds = profile.waitMin + random(agent) * profile.waitMax; agent.speed = 0; }
      return agent;
    });
  }

  locations(now: number): readonly DriverLocationUpdate[] {
    if (!Number.isFinite(now)) throw new RangeError("Simulation timestamp must be finite.");
    const dt = this.lastTime === null ? 0 : Math.min(1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    return this.agents.map((agent) => {
      const profile = agent.vehicle === "RIDE" ? MotorcycleMovementProfile : CabMovementProfile;
      if (agent.waitSeconds > 0) {
        agent.waitSeconds = Math.max(0, agent.waitSeconds - dt);
        if (agent.waitSeconds === 0) agent.state = "CRUISING";
      } else {
        const remaining = (1 - agent.progress) * agent.segmentLength;
        const target = Math.min(agent.targetSpeed, Math.sqrt(2 * profile.deceleration * remaining));
        agent.speed += Math.max(-profile.deceleration * dt, Math.min(profile.acceleration * dt, target - agent.speed));
        agent.progress += agent.speed * dt / agent.segmentLength;
        if (agent.progress >= .9999 || (remaining < .5 && agent.speed < 1)) {
          agent.previous = agent.from;
          agent.from = agent.to;
          if (same(agent.from, agent.objective)) agent.objective = hotspots[Math.floor(random(agent) * hotspots.length)];
          const next = chooseNext(agent);
          agent.to = next;
          agent.progress = 0;
          agent.segmentLength = length(agent.from, agent.to);
          agent.heading = heading(agent.from, agent.to);
          agent.targetSpeed = profile.minSpeed + random(agent) * (profile.maxSpeed - profile.minSpeed);
          if (random(agent) < (hotspots.some((n) => same(n, agent.from)) ? .7 : .2)) {
            agent.state = "WAITING"; agent.waitSeconds = profile.waitMin + random(agent) * (profile.waitMax - profile.waitMin); agent.speed = 0;
          } else agent.state = "REPOSITIONING";
        }
      }
      const a = point(agent.from), b = point(agent.to);
      return {
        driverId: agent.id, vehicleType: agent.vehicle,
        longitude: a[0] + (b[0] - a[0]) * agent.progress, latitude: a[1] + (b[1] - a[1]) * agent.progress,
        headingDegrees: agent.heading, speedMetersPerSecond: agent.speed, accuracyMeters: null,
        positionTimestamp: now, receivedTimestamp: null, availability: "AVAILABLE" as const, activeRideId: null, source: "SIMULATION" as const,
      };
    });
  }
}
