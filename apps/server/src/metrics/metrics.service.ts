import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client';

export interface GameStats {
  rooms: number;
  playersOnline: number;
  matchesInProgress: number;
}

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly matchesFinished: Counter;
  private statsProvider: (() => GameStats) | null = null;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.matchesFinished = new Counter({
      name: 'cardgames_matches_finished_total',
      help: 'Tổng số ván đã kết thúc từ khi server start',
      registers: [this.registry],
    });

    const provider = (): GameStats | null => this.statsProvider?.() ?? null;
    new Gauge({
      name: 'cardgames_rooms',
      help: 'Số phòng đang tồn tại',
      registers: [this.registry],
      collect() {
        const s = provider();
        if (s) this.set(s.rooms);
      },
    });
    new Gauge({
      name: 'cardgames_players_online',
      help: 'Số người chơi đang kết nối trong các phòng',
      registers: [this.registry],
      collect() {
        const s = provider();
        if (s) this.set(s.playersOnline);
      },
    });
    new Gauge({
      name: 'cardgames_matches_in_progress',
      help: 'Số ván đang diễn ra',
      registers: [this.registry],
      collect() {
        const s = provider();
        if (s) this.set(s.matchesInProgress);
      },
    });
  }

  /** RoomService đăng ký nguồn số liệu — gauge đọc lúc Prometheus scrape */
  setStatsProvider(fn: () => GameStats): void {
    this.statsProvider = fn;
  }
}
