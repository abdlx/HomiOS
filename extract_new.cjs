const fs = require('fs');

const content = fs.readFileSync('C:/Users/Abdullah/.gemini/antigravity-ide/brain/72e20dad-1371-49f9-91c6-95b141827f6c/.system_generated/steps/40/content.md', 'utf8');

const regex = /"code":"([^"]*?export function GooeyInput[^"]*?)"/;
const match = content.match(regex);
if (match) {
    const raw = match[1];
    const decoded = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    fs.writeFileSync('gooey-input.tsx', decoded, 'utf8');
    console.log('Success!');
} else {
    console.log('Not found');
}
