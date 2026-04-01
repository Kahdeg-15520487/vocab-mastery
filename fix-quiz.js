const fs = require('fs');
let content = fs.readFileSync('apps/frontend/src/views/QuizView.vue', 'utf8');

// Find the start button section by line markers
const lines = content.split('\n');
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<!-- Start Button -->')) startIdx = i;
  if (startIdx >= 0 && lines[i].trim() === '</div>' && lines[i+1]?.trim() === '</div>' && lines[i+2]?.includes('PLAYING PHASE')) {
    endIdx = i + 1;
    break;
  }
}

if (startIdx < 0 || endIdx < 0) {
  console.log('NOT FOUND', startIdx, endIdx);
  process.exit(1);
}

const newSection = [
  '      <!-- Start Button -->',
  '      <div class="text-center space-y-3">',
  '        <button @click="startQuiz" :disabled="loading" class="btn btn-primary text-lg px-8 py-3">',
  '          <span v-if="loading" class="animate-spin inline-block mr-2">\u23f3</span>',
  '          {{ loading ? \'Starting...\' : \'\ud83e\udde0 Start Quiz\' }}',
  '        </button>',
  '        <div>',
  '          <button @click="startLevelTest" :disabled="loading" class="px-6 py-2 text-sm border-2 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors">',
  '            \ud83d\udcca Vocabulary Level Test',
  '          </button>',
  '          <p class="text-xs text-slate-400 mt-1">Tests all CEFR levels to estimate your vocabulary level</p>',
  '        </div>',
  '      </div>',
  '    </div>',
];

lines.splice(startIdx, endIdx - startIdx + 1, ...newSection);
fs.writeFileSync('apps/frontend/src/views/QuizView.vue', lines.join('\n'), 'utf8');
console.log('OK - replaced lines', startIdx, 'to', endIdx);
