/**
 * Intersection Observer utilities for lazy loading
 */
import { writable } from 'svelte/store';

export interface LazyLoadOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
  once?: boolean;
  fallbackDelay?: number;
}

export interface LazyLoadEntry {
  element: Element;
  isIntersecting: boolean;
  intersectionRatio: number;
  target: Element;
}

export type LazyLoadCallback = (entry: LazyLoadEntry) => void;

class LazyLoadManager {
  private observer: IntersectionObserver | null = null;
  private callbacks = new Map<Element, LazyLoadCallback>();
  private options: LazyLoadOptions;
  private fallbackTimeouts = new Map<Element, number>();

  constructor(options: LazyLoadOptions = {}) {
    this.options = {
      root: null,
      rootMargin: '50px',
      threshold: 0.1,
      once: true,
      fallbackDelay: 2000,
      ...options
    };
    this.createObserver();
  }

  private createObserver(): void {
    if (!this.supportsIntersectionObserver()) {
      if (typeof window !== 'undefined') {
        console.warn('IntersectionObserver not supported, using fallback');
      }
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        root: this.options.root,
        rootMargin: this.options.rootMargin,
        threshold: this.options.threshold
      }
    );
  }

  private supportsIntersectionObserver(): boolean {
    return typeof window !== 'undefined' && 'IntersectionObserver' in window;
  }


  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach((entry) => {
      const callback = this.callbacks.get(entry.target);
      if (callback) {
        const lazyEntry: LazyLoadEntry = {
          element: entry.target,
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          target: entry.target
        };

        try {
          callback(lazyEntry);
        } catch (err) {
          console.error('lazyLoad callback error', err);
        }

        if (this.options.once && entry.isIntersecting) {
          this.unobserve(entry.target);
        }
      }
    });
  }

  observe(element: Element, callback: LazyLoadCallback): void {
    if (!element) {
      if (typeof window !== 'undefined') {
        console.warn('LazyLoadManager: Cannot observe null element');
      }
      return;
    }

    this.callbacks.set(element, callback);

    if (this.observer) {
      try {
        this.observer.observe(element);
      } catch {
        this.setupFallback(element, callback);
      }
    } else {
      this.setupFallback(element, callback);
    }
  }

  private setupFallback(element: Element, callback: LazyLoadCallback): void {
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      const timeoutId = window.setTimeout(() => {
        try {
          callback({
            element,
            isIntersecting: true,
            intersectionRatio: 1,
            target: element
          });
        } catch (err) {
          console.error('LazyLoadManager fallback callback error', err);
        }
        this.unobserve(element);
      }, this.options.fallbackDelay);
      this.fallbackTimeouts.set(element, timeoutId);
    } else {
      Promise.resolve().then(() => {
        try {
          callback({
            element,
            isIntersecting: true,
            intersectionRatio: 1,
            target: element
          });
        } catch {
          // ignore
        }
        this.unobserve(element);
      });
    }
  }

  unobserve(element: Element): void {
    if (!element) return;

    if (this.observer) {
      try {
        this.observer.unobserve(element);
      } catch {
        // ignore
      }
    }

    const timeoutId = this.fallbackTimeouts.get(element);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      this.fallbackTimeouts.delete(element);
    }

    this.callbacks.delete(element);
  }

  disconnect(): void {
    if (this.observer) {
      try {
        this.observer.disconnect();
      } catch {
        // ignore
      }
      this.observer = null;
    }

    this.fallbackTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.fallbackTimeouts.clear();
    this.callbacks.clear();
  }
}

let globalLazyLoader: LazyLoadManager | null = null;

export function getLazyLoader(options?: LazyLoadOptions): LazyLoadManager {
  if (!globalLazyLoader) {
    globalLazyLoader = new LazyLoadManager(options);
  }
  return globalLazyLoader;
}


export interface LazyLoadActionOptions extends LazyLoadOptions {
  onIntersect: LazyLoadCallback;
}

export function lazyLoad(element: Element, options: LazyLoadActionOptions) {
  const { onIntersect, ...loaderOptions } = options;
  const loader = getLazyLoader(loaderOptions);
  loader.observe(element, onIntersect);

  return {
    destroy() {
      loader.unobserve(element);
    }
  };
}

export interface LazyComponentState {
  isVisible: boolean;
  hasBeenVisible: boolean;
  intersectionRatio: number;
  isLoaded?: boolean;
}

export function createLazyStore(initialState: Partial<LazyComponentState> = {}) {
  const { subscribe, set, update } = writable<LazyComponentState>({
    isVisible: false,
    hasBeenVisible: false,
    intersectionRatio: 0,
    ...initialState
  });

  return {
    subscribe,
    setVisible: (isVisible: boolean, intersectionRatio: number = 1) => {
      update((state) => ({
        ...state,
        isVisible,
        hasBeenVisible: state.hasBeenVisible || isVisible,
        intersectionRatio
      }));
    },
    reset: () => {
      set({ isVisible: false, hasBeenVisible: false, intersectionRatio: 0 });
    }
  };
}

export function createComponentLazyLoader(
  element: Element,
  options: LazyLoadOptions = {}
): Promise<LazyLoadEntry> {
  return new Promise((resolve) => {
    const loader = getLazyLoader({ once: true, ...options });
    const cb = (entry: LazyLoadEntry) => {
      if (entry.isIntersecting) {
        loader.unobserve(element);
        resolve(entry);
      }
    };
    loader.observe(element, cb);
  });
}

export function lazyLoadImage(
  img: HTMLImageElement,
  src: string,
  options: LazyLoadOptions = {}
): void {
  const loader = getLazyLoader({ once: true, ...options });
  const cb = (entry: LazyLoadEntry) => {
    if (entry.isIntersecting) {
      img.src = src;
      img.classList.add('lazy-loaded');
      loader.unobserve(img);
    }
  };
  loader.observe(img, cb);
}

export interface LazyLoadMetrics {
  totalObserved: number;
  totalLoaded: number;
  averageLoadTime: number;
  loadTimes: number[];
}

class LazyLoadProfiler {
  private metrics: LazyLoadMetrics = {
    totalObserved: 0,
    totalLoaded: 0,
    averageLoadTime: 0,
    loadTimes: []
  };
  private loadStartTimes = new Map<Element, number>();

  startObserving(element: Element): void {
    this.metrics.totalObserved++;
    this.loadStartTimes.set(element, Date.now());
  }

  recordLoad(element: Element): void {
    const startTime = this.loadStartTimes.get(element);
    if (startTime) {
      const loadTime = Date.now() - startTime;
      this.metrics.loadTimes.push(loadTime);
      this.metrics.totalLoaded++;
      this.metrics.averageLoadTime =
        this.metrics.loadTimes.reduce((sum, time) => sum + time, 0) /
        this.metrics.loadTimes.length;
      this.loadStartTimes.delete(element);
    }
  }

  getMetrics(): LazyLoadMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalObserved: 0,
      totalLoaded: 0,
      averageLoadTime: 0,
      loadTimes: []
    };
    this.loadStartTimes.clear();
  }
}

export const lazyLoadProfiler = new LazyLoadProfiler();

export const LAZY_LOAD_PRESETS = {
  EAGER: { rootMargin: '100px', threshold: 0, once: true },
  NORMAL: { rootMargin: '50px', threshold: 0.1, once: true },
  LAZY: { rootMargin: '0px', threshold: 0.5, once: true },
  HEAVY_COMPONENT: { rootMargin: '200px', threshold: 0, once: true, fallbackDelay: 1000 },
  MEDIA: { rootMargin: '50px', threshold: 0, once: true },
  CONTINUOUS: { rootMargin: '0px', threshold: [0, 0.25, 0.5, 0.75, 1], once: false }
} as const;

export type LazyLoadPreset = keyof typeof LAZY_LOAD_PRESETS;
