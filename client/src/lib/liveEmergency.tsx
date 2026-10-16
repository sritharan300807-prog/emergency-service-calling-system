import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, subscribeToEvents } from './api';
import type { Incident } from './types';
import { startAlarm, stopAlarm, unlockAlarmAudio } from './alarm';
import {
  isVoiceControlSupported,
  startVoiceControl,
  stopVoiceControl,
} from './voiceControl';
import { useToast } from '@/components/Toast';

const FINAL_STATUSES = new Set(['RESOLVED', 'FALSE_ALARM', 'CANCELLED']);

interface CountdownState {
  remainingSeconds: number;
  endAt: number;
}

interface LiveEmergencyContextValue {
  activeIncidents: Incident[];
  countdowns: Record<string, CountdownState>;
  refresh: () => Promise<void>;
  voiceListening: boolean;
  voiceSupported: boolean;
}

const LiveEmergencyContext = createContext<LiveEmergencyContextValue | null>(null);

export function LiveEmergencyProvider({ children }: { children: ReactNode }) {
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);
  const [countdowns, setCountdowns] = useState<Record<string, CountdownState>>({});
  const [voiceListening, setVoiceListening] = useState(false);

  const { push } = useToast();

  // Audible alerts with voice control: the siren/ring starts voice listening
  // so the alarm can be silenced by saying phrases like "stop alarm".
  const startAlert = useCallback((mode: 'siren' | 'ring') => {
    startAlarm(mode);
    if (isVoiceControlSupported()) {
      startVoiceControl(() => {
        stopAlarm();
        stopVoiceControl();
        setVoiceListening(false);
        push('success', "Voice command received — the alarm has been silenced.");
      });
      setVoiceListening(true);
    }
  }, [push]);

  const silenceAlert = useCallback(() => {
    stopAlarm();
    stopVoiceControl();
    setVoiceListening(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ incidents: Incident[] }>('/api/incidents/active');
      setActiveIncidents(data.incidents);
    } catch {
      // ignore transient errors; SSE handles live updates
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);

    // Unlock audio on the first user gesture so alarms (which fire from
    // server events, not clicks) are allowed to play on any browser/device.
    const unlock = () => unlockAlarmAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', unlock);

    const isFinal = (status: string) => FINAL_STATUSES.has(status);

    const unsubscribe = subscribeToEvents({
      onEvent: (event, payload) => {
        const p = payload as Record<string, unknown>;
        if (event === 'incident.countdown') {
          const id = p.incidentId as string;
          setCountdowns((prev) => ({
            ...prev,
            [id]: { remainingSeconds: p.remainingSeconds as number, endAt: p.endAt as number },
          }));
        } else if (
          event === 'incident.possible' ||
          event === 'incident.confirmed' ||
          event === 'incident.updated'
        ) {
          setActiveIncidents((prev) => {
            const inc = p as unknown as Incident;
            const exists = prev.some((i) => i.id === inc.id);
            return exists
              ? prev.map((i) => (i.id === inc.id ? inc : i))
              : [inc, ...prev];
          });

          // Audible alerts: siren on detection, escalate to a ringing
          // "call" once confirmed, and silence on any final state.
          if (event === 'incident.possible') {
            startAlert('siren');
          } else if (event === 'incident.confirmed') {
            startAlert('ring');
          } else if (event === 'incident.updated') {
            const inc = p as unknown as Incident;
            if (inc.status === 'CONFIRMED_EMERGENCY') startAlert('ring');
            else if (isFinal(inc.status)) silenceAlert();
            else startAlert('siren');
          }
        } else if (event === 'incident.cancelled') {
          const id = p.id as string;
          silenceAlert();
          setActiveIncidents((prev) => prev.filter((i) => i.id !== id));
          setCountdowns((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      },
    });
    return () => {
      clearInterval(interval);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', unlock);
      unsubscribe();
      silenceAlert();
    };
  }, [refresh, startAlert, silenceAlert]);

  const value: LiveEmergencyContextValue = {
    activeIncidents,
    countdowns,
    refresh,
    voiceListening,
    voiceSupported: isVoiceControlSupported(),
  };
  return (
    <LiveEmergencyContext.Provider value={value}>{children}</LiveEmergencyContext.Provider>
  );
}

export function useLiveEmergency(): LiveEmergencyContextValue {
  const ctx = useContext(LiveEmergencyContext);
  if (!ctx) throw new Error('useLiveEmergency must be used within LiveEmergencyProvider');
  return ctx;
}
