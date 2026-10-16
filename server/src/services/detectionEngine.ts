import { db } from '../db.js';
import type { EventType } from '../types.js';
import { uid } from '../events.js';

/**
 * Accident Detection Engine
 * -------------------------
 * Detects possible accidents from simulated (or future real) sensor data.
 *
 * IMPORTANT: Detection is NOT based on speed alone. The engine combines:
 *   - Acceleration magnitude / sudden impact (g-force)
 *   - Vehicle orientation (rollover): abnormal roll/pitch beyond a threshold
 *   - Sudden speed reduction (delta-v over time)
 *   - Manual SOS button (force flag)
 *   - Extensible inputs for future ECU / CAN / OBD-II payloads
 */

export interface DetectionInput {
  acceleration: number; // magnitude in g (m/s^2 / 9.81)
  speedKph: number;
  previousSpeedKph?: number;
  roll: number; // degrees
  pitch: number; // degrees
  yaw: number; // degrees
  manualSos?: boolean;
}

export interface DetectionResult {
  eventType: EventType;
  reasons: string[];
  confidence: number; // 0..1
}

// Tunable thresholds (single source of truth for the detection module).
export const THRESHOLDS = {
  highImpactG: 2.5, // sudden impact / hard collision in g-force
  rolloverAngleDeg: 45, // abnormal orientation beyond this indicates rollover
  suddenSpeedDropKph: 40, // within a short window
  speedDropWindowMs: 1500,
  impactConfidence: 0.85,
  rolloverConfidence: 0.95,
  speedDropConfidence: 0.7,
  sosConfidence: 1.0,
};

export function detectAccident(input: DetectionInput): DetectionResult {
  const reasons: string[] = [];
  let confidence = 0;

  // 1) Sudden impact / high acceleration magnitude.
  if (input.acceleration >= THRESHOLDS.highImpactG) {
    reasons.push(`High impact detected (${input.acceleration.toFixed(2)} g)`);
    confidence = Math.max(confidence, THRESHOLDS.impactConfidence);
  }

  // 2) Rollover / abnormal vehicle orientation.
  const maxTilt = Math.max(Math.abs(input.roll), Math.abs(input.pitch));
  if (maxTilt >= THRESHOLDS.rolloverAngleDeg) {
    reasons.push(
      `Abnormal orientation (roll ${input.roll.toFixed(0)}°, pitch ${input.pitch.toFixed(0)}°)`
    );
    confidence = Math.max(confidence, THRESHOLDS.rolloverConfidence);
  }

  // 3) Sudden speed reduction (a proxy using the last known sample). Real impl
  //    would compare consecutive samples over a rolling window.
  if (
    input.previousSpeedKph != null &&
    input.speedKph >= 0 &&
    input.speedKph <= input.previousSpeedKph - THRESHOLDS.suddenSpeedDropKph
  ) {
    reasons.push(
      `Sudden speed reduction (${input.previousSpeedKph.toFixed(0)} → ${input.speedKph.toFixed(0)} km/h)`
    );
    confidence = Math.max(confidence, THRESHOLDS.speedDropConfidence);
  }

  // 4) Manual SOS.
  if (input.manualSos) {
    reasons.push('Manual SOS button pressed');
    confidence = Math.max(confidence, THRESHOLDS.sosConfidence);
  }

  if (confidence === 0) {
    return { eventType: 'NORMAL', reasons: ['No anomaly detected'], confidence: 0 };
  }

  // Combine independent indicators for higher confidence.
  const indicatorCount = reasons.length;
  if (indicatorCount >= 2) {
    confidence = Math.min(1, confidence + 0.1);
  }

  return {
    eventType: 'POSSIBLE_ACCIDENT',
    reasons,
    confidence: Number(confidence.toFixed(2)),
  };
}

export function persistSensorEvent(input: {
  vehicleId: string;
  acceleration: number;
  speed: number;
  roll: number;
  pitch: number;
  yaw: number;
  eventType: EventType;
  latitude?: number | null;
  longitude?: number | null;
  source?: string;
  timestamp?: string;
}): void {
  db.prepare(
    `INSERT INTO sensor_events
      (id, vehicle_id, acceleration, speed, roll, pitch, yaw, event_type,
       latitude, longitude, source, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uid(),
    input.vehicleId,
    input.acceleration,
    input.speed,
    input.roll,
    input.pitch,
    input.yaw,
    input.eventType,
    input.latitude ?? null,
    input.longitude ?? null,
    input.source || 'SIMULATION',
    input.timestamp || new Date().toISOString()
  );
}
