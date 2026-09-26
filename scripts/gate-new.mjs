// Archives the debug relay log so a gate session starts empty.
import { existsSync, renameSync } from 'node:fs';

const LOG_PATH = '.iwsdk/runtime/logs/kubb-debug.ndjson';
if (existsSync(LOG_PATH)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archived = LOG_PATH.replace('.ndjson', `.${stamp}.ndjson`);
  renameSync(LOG_PATH, archived);
  console.log(`archived to ${archived}`);
} else {
  console.log('nothing to archive');
}
