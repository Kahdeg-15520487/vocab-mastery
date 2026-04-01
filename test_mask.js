const w = 'accumulate';
const escapedWord = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const forms = new Set([escapedWord]);

// Verb forms
forms.add(escapedWord + 's');
forms.add(escapedWord + 'ed');
forms.add(escapedWord + 'd');
forms.add(escapedWord + 'ing');
forms.add(escapedWord + 'er');
forms.add(escapedWord + 'est');

// Drop silent e before suffix: accumulate → accumulated, accumulating
if (w.endsWith('e')) {
  const base = escapedWord.slice(0, -1);
  forms.add(base + 'ed');
  forms.add(base + 'ing');
  forms.add(base + 'es');
  forms.add(base + 'er');
  forms.add(base + 'est');
}

// Consonant doubling: stop → stopped, running, biggest
if (w.length >= 2 && /[bcdfghjklmnpqrstvwxyz]$/.test(w.slice(-1)) && /[aeiou]$/.test(w.slice(-2, -1))) {
  const doubled = escapedWord + w.slice(-1);
  forms.add(doubled + 'ed');
  forms.add(doubled + 'ing');
  forms.add(doubled + 'er');
  forms.add(doubled + 'est');
}

// -y → -ied/-ies: vary → varied, varies
if (w.endsWith('y') && w.length > 1 && !/[aeiou]/.test(w.slice(-2, -1))) {
  const base = escapedWord.slice(0, -1);
  forms.add(base + 'ied');
  forms.add(base + 'ies');
  forms.add(base + 'ier');
  forms.add(base + 'iest');
  forms.add(base + 'ying');
}

// -s, -x, -ch, -sh → -es: watch → watches
if (/(?:s|x|ch|sh)$/.test(w)) {
  forms.add(escapedWord + 'es');
}

console.log('Forms:', [...forms]);
const pattern = [...forms].join('|');
const sentence = 'I seem to have accumulated a lot of books.';
const masked = sentence.replace(new RegExp(`\\b(${pattern})\\b`, 'gi'), '________');
console.log('Result:', masked);

// Test other cases
console.log('\n--- Test cases ---');
const tests = [
  ['accumulate', 'I seem to have accumulated a lot of books.'],
  ['stop', 'I stopped the car.'],
  ['run', 'She is running fast.'],
  ['carry', 'He carried the box.'],
  ['watch', 'She watches TV.'],
  ['big', 'The biggest problem'],
  ['happy', 'She is happier now.'],
  ['teach', 'He teaches math.'],
  ['swim', 'She swam fast.'],  // won't match irregular
];

for (const [word, sent] of tests) {
  const ew = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const f = new Set([ew]);
  f.add(ew + 's'); f.add(ew + 'ed'); f.add(ew + 'd'); f.add(ew + 'ing');
  f.add(ew + 'er'); f.add(ew + 'est');
  if (word.endsWith('e')) {
    const b = ew.slice(0,-1);
    f.add(b + 'ed'); f.add(b + 'ing'); f.add(b + 'es');
    f.add(b + 'er'); f.add(b + 'est');
  }
  if (word.endsWith('y') && word.length > 1 && !/[aeiou]/.test(word.slice(-2,-1))) {
    const b = ew.slice(0,-1);
    f.add(b + 'ied'); f.add(b + 'ies'); f.add(b + 'ier'); f.add(b + 'iest');
    f.add(b + 'ying');
  }
  if (/(?:s|x|ch|sh)$/.test(word)) { f.add(ew + 'es'); }
  if (/[bcdfghjklmnpqrstvwxyz]$/.test(word.slice(-1)) && /[aeiou]$/.test(word.slice(-2,-1))) {
    const d = ew + word.slice(-1);
    f.add(d + 'ed'); f.add(d + 'ing'); f.add(d + 'er'); f.add(d + 'est');
  }
  const p = [...f].join('|');
  const m = sent.replace(new RegExp(`\\b(${p})\\b`, 'gi'), '________');
  const ok = m.includes('________');
  console.log(`${ok ? '✅' : '❌'} ${word} in "${sent}" → "${m}"`);
}
