const fs = require('fs');
const html = fs.readFileSync('C:/Users/Abdullah/.gemini/antigravity-ide/brain/72e20dad-1371-49f9-91c6-95b141827f6c/.system_generated/steps/40/content.md', 'utf8');

// The code block is usually stored in the Next.js page data or encoded in the raw HTML.
// Let's try to match something that looks like `export function GooeyInput`
// Since it's minified HTML, let's just find the JSON blob that might contain the code.

const match = html.match(/"code":"([^"]+)"/);
if (match) {
    let unescaped = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t');
    console.log(unescaped);
} else {
    // Try matching specific aceternity format
    const codeMatch = html.match(/&#x27;use client&#x27;;[\\s\\S]*?export function GooeyInput[\\s\\S]*?<\/code>/);
    if (codeMatch) {
        let code = codeMatch[0].replace(/<\/code>/g, '').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        console.log(code);
    } else {
        console.log("Could not find code block directly. Trying to grep for 'export function GooeyInput'");
        const lines = html.split(/\\n|<br>/);
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('export function GooeyInput')) {
                console.log("Found line:", lines[i].substring(0, 200));
                found = true;
            }
        }
    }
}
