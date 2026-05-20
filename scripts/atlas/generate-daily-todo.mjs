#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const nextStepsDir = path.resolve(__dirname, '../../next_steps/active');
const timelinePath = path.resolve(__dirname, '../../llm/llm_timeline.md');

function getLatestTodoFile() {
  if (!fs.existsSync(nextStepsDir)) {
    console.error(`Error: next_steps/active directory does not exist at: ${nextStepsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(nextStepsDir);
  const todoFiles = files
    .filter(f => f.startsWith('todo-') && f.endsWith('.md'))
    .map(f => {
      const match = f.match(/todo-(\d{4}-\d{2}-\d{2})\.md/);
      if (match) {
        return { name: f, date: new Date(match[1]) };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);

  return todoFiles.length > 0 ? todoFiles[0] : null;
}

function getRecentTimelineUpdates(sinceDate) {
  if (!fs.existsSync(timelinePath)) {
    console.warn(`Warning: llm_timeline.md not found at ${timelinePath}`);
    return [];
  }

  const content = fs.readFileSync(timelinePath, 'utf8');
  const lines = content.split('\n');
  const updates = [];

  for (const line of lines) {
    const match = line.match(/^-\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s*—\s*(.*)$/);
    if (match) {
      const date = new Date(match[1]);
      if (date > sinceDate) {
        updates.push({ date, text: match[2] });
      }
    }
  }

  return updates;
}

function run() {
  const latestTodo = getLatestTodoFile();
  if (!latestTodo) {
    console.error("No previous todo files found in next_steps/active/");
    process.exit(1);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const targetFileName = `todo-${todayStr}.md`;
  const targetFilePath = path.join(nextStepsDir, targetFileName);

  console.log(`Latest todo file: ${latestTodo.name} (${latestTodo.date.toISOString().split('T')[0]})`);
  console.log(`Target todo file: ${targetFileName}`);

  if (fs.existsSync(targetFilePath) && latestTodo.name === targetFileName) {
    console.log(`Target file ${targetFileName} already exists and is the latest todo file.`);
  }

  // Load previous todo content
  const prevPath = path.join(nextStepsDir, latestTodo.name);
  let content = fs.readFileSync(prevPath, 'utf8');

  // Find recent timeline updates
  const recentUpdates = getRecentTimelineUpdates(latestTodo.date);
  console.log(`Found ${recentUpdates.length} recent timeline updates since ${latestTodo.date.toISOString().split('T')[0]}`);

  // Automatically update checkbox states based on timeline update descriptions
  let updatedCount = 0;
  if (recentUpdates.length > 0) {
    // Collect all tokens or keywords from timeline text
    const keywordPool = recentUpdates.map(u => u.text.toLowerCase()).join(' ');

    // Simple heuristic to check off tasks matching timeline updates
    const lines = content.split('\n');
    const updatedLines = lines.map(line => {
      const taskMatch = line.match(/^(\s*)-\s*\[\s*\]\s*(.*)$/);
      if (taskMatch) {
        const indent = taskMatch[1];
        const taskText = taskMatch[2];
        const normalizedTask = taskText.toLowerCase();

        // Extract key nouns/phrases from task
        const words = normalizedTask.split(/\s+/).filter(w => w.length > 4);
        if (words.length > 0) {
          // If the task name matches key parts of the timeline updates, mark as checked
          const matchesTimeline = words.every(word => keywordPool.includes(word));
          if (matchesTimeline) {
            console.log(`Auto-checking task: "${taskText}"`);
            updatedCount++;
            return `${indent}- [x] ${taskText}`;
          }
        }
      }
      return line;
    });

    content = updatedLines.join('\n');
  }

  // Update date header
  content = content.replace(/# TODO\s*—\s*\d{4}-\d{2}-\d{2}/g, `# TODO — ${todayStr}`);
  content = content.replace(/\*\*Updated\*\*:\s*\d{4}-\d{2}-\d{2}/g, `**Updated**: ${todayStr}`);

  // Write new file
  fs.writeFileSync(targetFilePath, content);
  console.log(`Successfully generated ${targetFilePath} with ${updatedCount} auto-checked items.`);
}

run();
