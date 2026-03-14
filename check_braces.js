const fs = require('fs');
const content = fs.readFileSync('c:/Users/ASUS/OneDrive/Desktop/Game/motion.js', 'utf8');
let balance = 0;
let lineNum = 1;
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') balance++;
        else if (line[j] === '}') balance--;
    }
    if (line.includes('function') || line.includes('=> {')) {
        console.log(`Line ${i+1}: ${line.trim()} (Balance: ${balance})`);
    }
}
console.log(`Final balance: ${balance}`);
