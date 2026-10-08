import { Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';

import { InstrumentMetrics } from './models/market.models';
import {
  DEFAULT_PRODUCER_SETTINGS,
  ProducerSettings,
  ProducerStatus,
  ProducerWorkerCommand,
  ProducerWorkerEvent,
} from './models/producer.models';

export interface ProducerWorkerPort {
  onmessage: ((event: MessageEvent<ProducerWorkerEvent>) => void) | null;

  postMessage(message: ProducerWorkerCommand): void;
  terminate(): void;
}

export type ProducerWorkerFactory = () => ProducerWorkerPort;

const PRODUCER_SETTINGS_STORAGE_KEY = 'realtime-fintech-dashboard.producer-settings';

export const PRODUCER_WORKER_FACTORY = new InjectionToken<ProducerWorkerFactory>(
  'PRODUCER_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => {
      return () =>
        new Worker(new URL('./producer.worker', import.meta.url), {
          type: 'module',
          name: 'market-producer',
        }) as unknown as ProducerWorkerPort;
    },
  },
);

@Injectable({
  providedIn: 'root',
})
export class ProducerClientService implements OnDestroy {
  private readonly workerFactory = inject(PRODUCER_WORKER_FACTORY);

  private readonly worker = this.workerFactory();

  private readonly metricsState = signal<readonly InstrumentMetrics[]>([]);

  private readonly statusState = signal<ProducerStatus>('idle');

  private readonly errorState = signal<string | null>(null);

  private readonly settingsState = signal<ProducerSettings>({
    ...DEFAULT_PRODUCER_SETTINGS,
  });

  readonly metrics = this.metricsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly settings = this.settingsState.asReadonly();

  private activeRunId = 0;
  private disposed = false;

  private readonly handleStorageEvent = (event: StorageEvent): void => {
    if (event.key !== PRODUCER_SETTINGS_STORAGE_KEY || event.newValue === null) {
      return;
    }

    const settings = this.parseSettings(event.newValue);

    if (settings !== null) {
      this.start(settings);
    }
  };

  constructor() {
    this.worker.onmessage = (event) => {
      this.handleWorkerEvent(event.data);
    };

    window.addEventListener('storage', this.handleStorageEvent);

    this.start(this.readStoredSettings() ?? DEFAULT_PRODUCER_SETTINGS);
  }

  /**
   * Starts a new run and clears the previous results.
   */
  apply(settings: ProducerSettings, seed?: number): void {
    if (this.disposed) {
      return;
    }

    this.start(settings, seed);

    try {
      localStorage.setItem(PRODUCER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable in privacy modes.
    }
  }

  private start(settings: ProducerSettings, seed?: number): void {
    if (this.disposed) {
      return;
    }

    const activeSettings = {
      ...settings,
    };

    this.activeRunId += 1;

    this.settingsState.set(activeSettings);
    this.metricsState.set([]);
    this.errorState.set(null);
    this.statusState.set('initializing');

    const command: Extract<ProducerWorkerCommand, { type: 'start' }> =
      seed === undefined
        ? {
            type: 'start',
            runId: this.activeRunId,
            settings: activeSettings,
          }
        : {
            type: 'start',
            runId: this.activeRunId,
            settings: activeSettings,
            seed,
          };

    this.worker.postMessage(command);
  }

  pause(): void {
    if (this.disposed) {
      return;
    }

    this.worker.postMessage({
      type: 'pause',
      runId: this.activeRunId,
    });
  }

  resume(): void {
    if (this.disposed) {
      return;
    }

    this.worker.postMessage({
      type: 'resume',
      runId: this.activeRunId,
    });
  }

  togglePause(): void {
    if (this.statusState() === 'paused') {
      this.resume();
      return;
    }

    if (this.statusState() === 'running') {
      this.pause();
    }
  }

  ngOnDestroy(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.worker.onmessage = null;

    window.removeEventListener('storage', this.handleStorageEvent);

    this.worker.postMessage({
      type: 'dispose',
    });

    this.worker.terminate();
  }

  private readStoredSettings(): ProducerSettings | null {
    try {
      const value = localStorage.getItem(PRODUCER_SETTINGS_STORAGE_KEY);

      return value === null ? null : this.parseSettings(value);
    } catch {
      return null;
    }
  }

  private parseSettings(value: string): ProducerSettings | null {
    try {
      const settings: unknown = JSON.parse(value);

      if (typeof settings !== 'object' || settings === null) {
        return null;
      }

      const candidate = settings as Record<string, unknown>;
      const instrumentCount = candidate['instrumentCount'];
      const updatesPerBatch = candidate['updatesPerBatch'];
      const batchIntervalMs = candidate['batchIntervalMs'];

      if (
        typeof instrumentCount !== 'number' ||
        !Number.isInteger(instrumentCount) ||
        instrumentCount < 1 ||
        instrumentCount > 50 ||
        typeof updatesPerBatch !== 'number' ||
        !Number.isInteger(updatesPerBatch) ||
        updatesPerBatch < 1 ||
        updatesPerBatch > 1_000 ||
        typeof batchIntervalMs !== 'number' ||
        !Number.isInteger(batchIntervalMs) ||
        batchIntervalMs < 50 ||
        batchIntervalMs > 2_000
      ) {
        return null;
      }

      return {
        instrumentCount,
        updatesPerBatch,
        batchIntervalMs,
      };
    } catch {
      return null;
    }
  }

  private handleWorkerEvent(event: ProducerWorkerEvent): void {
    // Ignore late events from a previous run.
    if (event.runId !== this.activeRunId) {
      return;
    }

    switch (event.type) {
      case 'status':
        this.statusState.set(event.status);
        break;

      case 'snapshot':
        this.metricsState.set(event.metrics);
        break;

      case 'error':
        this.errorState.set(event.message);
        this.statusState.set('error');
        break;
    }
  }
}
