import fs from 'node:fs';
import process from 'node:process';
const s = fs.readFileSync('E:\\portfolio_React\\my-portfolio\\src\\App.jsx', 'utf8');
const stack = [];
const pairs = {')':'(', '}':'{', ']':'['};
for (let i=0;i<s.length;i++){
  const c=s[i];
  if (c==='('||c==='{'||c==='[') stack.push({c, i});
  if (c===')'||c==='}'||c===']'){
    const top = stack.pop();
    if (!top || top.c !== pairs[c]){
      // find line number
      const prefix = s.slice(0,i);
      const line = prefix.split('\n').length;
      console.log(`Unmatched ${c} at index ${i}, line ${line}`);
      process.exit(1);
    }
  }
}
if (stack.length) {
  const top = stack[stack.length-1];
  const line = s.slice(0, top.i).split('\n').length;
  console.log(`Unclosed ${top.c} at index ${top.i}, line ${line}`);
  process.exit(1);
}
console.log('All braces/parentheses balanced');
