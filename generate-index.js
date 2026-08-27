import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectories = [
  path.join(rootDirectory, 'src', 'notes'),
  path.join(rootDirectory, 'public', 'notes-content')
];
const outputFile = path.join(rootDirectory, 'public', 'search-index.json');

async function directoryExists(directory) {
  try {
    await readdir(directory);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

const sourceDirectory = await (async () => {
  for (const directory of sourceDirectories) {
    if (await directoryExists(directory)) return directory;
  }
  throw new Error('No notes directory found. Expected src/notes or public/notes-content.');
})();

const markdownFiles = await collectMarkdownFiles(sourceDirectory);
const index = await Promise.all(markdownFiles.map(async (filePath) => {
  const relativePath = path.relative(sourceDirectory, filePath).split(path.sep).join('/');
  const parsedPath = path.posix.parse(relativePath);

  return {
    id: parsedPath.name,
    topic: parsedPath.dir.split('/').pop() || 'General',
    title: parsedPath.name,
    content: await readFile(filePath, 'utf8'),
    path: relativePath
  };
}));

index.sort((first, second) => first.topic.localeCompare(second.topic) || first.title.localeCompare(second.title));
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`Generated ${index.length} note entries in ${path.relative(rootDirectory, outputFile)}`);
