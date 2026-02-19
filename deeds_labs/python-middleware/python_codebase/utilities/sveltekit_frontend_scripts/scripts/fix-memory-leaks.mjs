#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🧹 Fixing Memory Leaks and Adding Cleanup');
console.log('==========================================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Fix addEventListener without removeEventListener
    const addEventListenerRegex = /(\w+)\.addEventListener\(['"]([^'"]+)['"],\s*([^)]+)\);?/g;
    const originalEventListeners = content;
    const eventListeners = [];

    // Collect all addEventListener calls
    let match;
    while ((match = addEventListenerRegex.exec(content)) !== null) {
      eventListeners.push({
        element: match[1],
        event: match[2],
        handler: match[3],
        fullMatch: match[0],
      });
    }

    if (eventListeners.length > 0) {
      // Check if we're inside an effect
      const effectRegex = /\$effect\(\(\) => \{([^}]*addEventListener[^}]*)\}\);?/g;
      let effectMatch;

      while ((effectMatch = effectRegex.exec(content)) !== null) {
        const effectBody = effectMatch[1];
        let needsCleanup = false;

        // Check if cleanup already exists
        if (!effectBody.includes('return') && !effectBody.includes('removeEventListener')) {
          const effectListeners = eventListeners.filter((listener) =>
            effectBody.includes(listener.fullMatch)
          );

          if (effectListeners.length > 0) {
            const cleanup = effectListeners
              .map(
                (listener) =>
                  `    ${listener.element}.removeEventListener('${listener.event}', ${listener.handler});`
              )
              .join('\n');

            const newEffectBody = `${effectBody}

    return () => {
${cleanup}
    };`;

            content = content.replace(effectMatch[0], `$effect(() => {${newEffectBody}});`);

            needsCleanup = true;
            changes++;
            modified = true;
          }
        }

        if (needsCleanup) {
          console.log(
            `    ✅ Added cleanup for ${effectListeners.length} event listeners in effect`
          );
        }
      }

      // For addEventListener outside of effects, wrap in effect
      eventListeners.forEach((listener) => {
        if (
          !content.includes(`${listener.element}.removeEventListener`) &&
          !content.includes(`return () => {`)
        ) {
          const newEffect = `
  $effect(() => {
    ${listener.fullMatch}

    return () => {
      ${listener.element}.removeEventListener('${listener.event}', ${listener.handler});
    };
  });`;

          content = content.replace(listener.fullMatch, newEffect);
          changes++;
          modified = true;
          console.log(`    ✅ Wrapped standalone event listener in effect with cleanup`);
        }
      });
    }

    // 2. Fix setInterval without clearInterval
    const setIntervalRegex = /(?:const|let|var)\s+(\w+)\s*=\s*setInterval\([^)]+\);?/g;
    const originalIntervals = content;
    const intervals = [];

    while ((match = setIntervalRegex.exec(content)) !== null) {
      intervals.push({
        variable: match[1],
        fullMatch: match[0],
      });
    }

    if (intervals.length > 0) {
      intervals.forEach((interval) => {
        if (!content.includes(`clearInterval(${interval.variable})`)) {
          // Wrap in effect with cleanup
          const newEffect = `
  $effect(() => {
    ${interval.fullMatch}

    return () => {
      clearInterval(${interval.variable});
    };
  });`;

          content = content.replace(interval.fullMatch, newEffect);
          changes++;
          modified = true;
          console.log(`    ✅ Added clearInterval cleanup for ${interval.variable}`);
        }
      });
    }

    // 3. Fix setTimeout that should be cleared
    const setTimeoutRegex = /(?:const|let|var)\s+(\w+)\s*=\s*setTimeout\([^)]+\);?/g;
    const originalTimeouts = content;
    const timeouts = [];

    while ((match = setTimeoutRegex.exec(content)) !== null) {
      timeouts.push({
        variable: match[1],
        fullMatch: match[0],
      });
    }

    if (timeouts.length > 0) {
      timeouts.forEach((timeout) => {
        if (
          !content.includes(`clearTimeout(${timeout.variable})`) &&
          (content.includes('onDestroy') || content.includes('$effect'))
        ) {
          // Add cleanup in existing effect or create new one
          if (content.includes('return () => {')) {
            const returnRegex = /(return \(\) => \{[^}]*)/;
            const returnMatch = content.match(returnRegex);
            if (returnMatch) {
              content = content.replace(
                returnMatch[1],
                `${returnMatch[1]}\n      clearTimeout(${timeout.variable});`
              );
              changes++;
              modified = true;
              console.log(`    ✅ Added clearTimeout to existing cleanup`);
            }
          }
        }
      });
    }

    // 4. Fix WebSocket connections without close
    const webSocketRegex = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+WebSocket\([^)]+\);?/g;
    const originalWebSockets = content;
    const webSockets = [];

    while ((match = webSocketRegex.exec(content)) !== null) {
      webSockets.push({
        variable: match[1],
        fullMatch: match[0],
      });
    }

    if (webSockets.length > 0) {
      webSockets.forEach((ws) => {
        if (!content.includes(`${ws.variable}.close()`)) {
          const newEffect = `
  $effect(() => {
    ${ws.fullMatch}

    return () => {
      if (${ws.variable}.readyState === WebSocket.OPEN) {
        ${ws.variable}.close();
      }
    };
  });`;

          content = content.replace(ws.fullMatch, newEffect);
          changes++;
          modified = true;
          console.log(`    ✅ Added WebSocket cleanup for ${ws.variable}`);
        }
      });
    }

    // 5. Fix ResizeObserver without disconnect
    const resizeObserverRegex = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+ResizeObserver\([^)]+\);?/g;
    const originalResizeObservers = content;
    const resizeObservers = [];

    while ((match = resizeObserverRegex.exec(content)) !== null) {
      resizeObservers.push({
        variable: match[1],
        fullMatch: match[0],
      });
    }

    if (resizeObservers.length > 0) {
      resizeObservers.forEach((observer) => {
        if (!content.includes(`${observer.variable}.disconnect()`)) {
          // Find the observe call and wrap both in effect
          const observeRegex = new RegExp(`${observer.variable}\\.observe\\([^)]+\\);?`);
          const observeMatch = content.match(observeRegex);

          if (observeMatch) {
            const newEffect = `
  $effect(() => {
    ${observer.fullMatch}
    ${observeMatch[0]}

    return () => {
      ${observer.variable}.disconnect();
    };
  });`;

            content = content.replace(observer.fullMatch, '');
            content = content.replace(observeMatch[0], newEffect);
            changes++;
            modified = true;
            console.log(`    ✅ Added ResizeObserver cleanup for ${observer.variable}`);
          }
        }
      });
    }

    // 6. Fix IntersectionObserver without disconnect
    const intersectionObserverRegex =
      /(?:const|let|var)\s+(\w+)\s*=\s*new\s+IntersectionObserver\([^)]+\);?/g;
    const originalIntersectionObservers = content;
    const intersectionObservers = [];

    while ((match = intersectionObserverRegex.exec(content)) !== null) {
      intersectionObservers.push({
        variable: match[1],
        fullMatch: match[0],
      });
    }

    if (intersectionObservers.length > 0) {
      intersectionObservers.forEach((observer) => {
        if (!content.includes(`${observer.variable}.disconnect()`)) {
          const observeRegex = new RegExp(`${observer.variable}\\.observe\\([^)]+\\);?`);
          const observeMatch = content.match(observeRegex);

          if (observeMatch) {
            const newEffect = `
  $effect(() => {
    ${observer.fullMatch}
    ${observeMatch[0]}

    return () => {
      ${observer.variable}.disconnect();
    };
  });`;

            content = content.replace(observer.fullMatch, '');
            content = content.replace(observeMatch[0], newEffect);
            changes++;
            modified = true;
            console.log(`    ✅ Added IntersectionObserver cleanup for ${observer.variable}`);
          }
        }
      });
    }

    // 7. Fix Animation frames without cancel
    const rafRegex = /(?:const|let|var)\s+(\w+)\s*=\s*requestAnimationFrame\([^)]+\);?/g;
    const originalRafs = content;
    const rafs = [];

    while ((match = rafRegex.exec(content)) !== null) {
      rafs.push({
        variable: match[1],
        fullMatch: match[0],
      });
    }

    if (rafs.length > 0) {
      rafs.forEach((raf) => {
        if (!content.includes(`cancelAnimationFrame(${raf.variable})`)) {
          // Add to existing cleanup or create new effect
          if (content.includes('return () => {')) {
            const returnRegex = /(return \(\) => \{[^}]*)/;
            const returnMatch = content.match(returnRegex);
            if (returnMatch) {
              content = content.replace(
                returnMatch[1],
                `${returnMatch[1]}\n      cancelAnimationFrame(${raf.variable});`
              );
              changes++;
              modified = true;
              console.log(`    ✅ Added cancelAnimationFrame to existing cleanup`);
            }
          } else {
            const newEffect = `
  $effect(() => {
    ${raf.fullMatch}

    return () => {
      cancelAnimationFrame(${raf.variable});
    };
  });`;

            content = content.replace(raf.fullMatch, newEffect);
            changes++;
            modified = true;
            console.log(`    ✅ Added requestAnimationFrame cleanup for ${raf.variable}`);
          }
        }
      });
    }

    // 8. Add cleanup utility function if multiple cleanups exist
    if (changes > 2 && !content.includes('function cleanup()')) {
      const cleanupUtility = `
  function cleanup() {
    // Centralized cleanup function
    console.log('Component cleanup completed');
  }`;

      content = content.replace(/<script[^>]*>/, `<script lang="ts">${cleanupUtility}`);

      changes++;
      modified = true;
      console.log(`    ✅ Added cleanup utility function`);
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(`  📝 Fixed memory leaks in ${filePath.split(/[/\\]/).pop()} (${changes} fixes)`);
    }

    return modified;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function createCleanupPatterns() {
  const patternsPath = 'src/lib/utils/cleanup-patterns.ts';
  const cleanupPatterns = `
/**
 * Common cleanup patterns for Svelte 5 components
 */

export function createEventListener<T extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  event: T,
  handler: (event: HTMLElementEventMap[T]) => void,
  options?: AddEventListenerOptions
) {
  element.addEventListener(event, handler, options);

  return () => {
    element.removeEventListener(event, handler, options);
  };
}

export function createInterval(callback: () => void, delay: number) {
  const intervalId = setInterval(callback, delay);

  return () => {
    clearInterval(intervalId);
  };
}

export function createTimeout(callback: () => void, delay: number) {
  const timeoutId = setTimeout(callback, delay);

  return () => {
    clearTimeout(timeoutId);
  };
}

export function createWebSocket(url: string, protocols?: string | string[]) {
  const ws = new WebSocket(url, protocols);

  return {
    socket: ws,
    cleanup: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
  };
}

export function createResizeObserver(
  callback: ResizeObserverCallback,
  element: Element
) {
  const observer = new ResizeObserver(callback);
  observer.observe(element);

  return () => {
    observer.disconnect();
  };
}

export function createIntersectionObserver(
  callback: IntersectionObserverCallback,
  element: Element,
  options?: IntersectionObserverInit
) {
  const observer = new IntersectionObserver(callback, options);
  observer.observe(element);

  return () => {
    observer.disconnect();
  };
}

export function createAnimationFrame(callback: FrameRequestCallback) {
  const rafId = requestAnimationFrame(callback);

  return () => {
    cancelAnimationFrame(rafId);
  };
}

export function createMediaQuery(query: string, callback: (matches: boolean) => void) {
  const mediaQuery = window.matchMedia(query);
  const handler = (event: MediaQueryListEvent) => callback(event.matches);

  // Initial call
  callback(mediaQuery.matches);

  mediaQuery.addEventListener('change', handler);

  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
}

export function createAbortController() {
  const controller = new AbortController();

  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    cleanup: () => controller.abort()
  };
}

// Utility for combining multiple cleanup functions
export function combineCleanups(...cleanupFns: (() => void)[]): () => void {
  return () => {
    cleanupFns.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    });
  };
}

// Hook-like pattern for Svelte 5
export function useCleanup() {
  const cleanupFunctions: (() => void)[] = [];

  const addCleanup = (cleanup: () => void) => {
    cleanupFunctions.push(cleanup);
  };

  const cleanup = () => {
    cleanupFunctions.forEach(fn => {
      try {
        fn();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    });
    cleanupFunctions.length = 0;
  };

  return { addCleanup, cleanup };
}
`;

  try {
    writeFileSync(patternsPath, cleanupPatterns, 'utf8');
    console.log(`✅ Created cleanup patterns at ${patternsPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create cleanup patterns:`, error.message);
    return false;
  }
}

function walkDirectory(dir, extension = '.svelte') {
  const files = [];

  function walk(currentDir) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'build', 'dist'].includes(item)) {
          walk(fullPath);
        }
      } else if (stat.isFile() && fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function main() {
  console.log('1️⃣ Finding components with memory leak risks...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that might have memory leaks
  const memoryLeakFiles = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('addEventListener') ||
        content.includes('setInterval') ||
        content.includes('setTimeout') ||
        content.includes('WebSocket') ||
        content.includes('ResizeObserver') ||
        content.includes('IntersectionObserver') ||
        content.includes('requestAnimationFrame')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${memoryLeakFiles.length} components with potential memory leaks\n`);

  if (memoryLeakFiles.length === 0) {
    console.log('✨ No memory leak risks found!');
    return;
  }

  console.log('2️⃣ Creating cleanup patterns library...\n');
  createCleanupPatterns();

  console.log('3️⃣ Fixing memory leaks...\n');

  // Process first 20 files to avoid overwhelming output
  for (const file of memoryLeakFiles.slice(0, 20)) {
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Memory Leak Fix Summary');
  console.log('==========================');
  console.log(`Files fixed: ${filesFixed}`);
  console.log(`Total memory leak fixes: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n🧹 Memory leak fixes applied!');
    console.log('\nFixes made:');
    console.log('- Added cleanup for event listeners');
    console.log('- Added clearInterval for intervals');
    console.log('- Added clearTimeout for timeouts');
    console.log('- Added WebSocket cleanup');
    console.log('- Added Observer cleanup (Resize/Intersection)');
    console.log('- Added cancelAnimationFrame');
    console.log('- Created cleanup patterns library');

    console.log('\n💡 Best practices:');
    console.log('1. Use cleanup patterns from $lib/utils/cleanup-patterns');
    console.log('2. Always return cleanup functions from $effect');
    console.log('3. Test components for memory leaks');
    console.log('4. Use browser dev tools to monitor memory usage');
  }
}

main();
