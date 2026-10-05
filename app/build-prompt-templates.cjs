const fs = require('node:fs');
const path = require('node:path');
const files = {
 model: {understand:'01-模特上身图-需求理解与整理.md',generate:'02-模特上身图-图片生成.md'},
 product: {understand:'03-单品展示图-需求理解与整理.md',generate:'04-单品展示图-图片生成.md'},
 size: {understand:'05-尺寸标注图-需求理解与整理.md',generate:'06-尺寸标注图-图片生成.md'}
};
const templates = Object.fromEntries(Object.entries(files).map(([category, stages]) => [category, Object.fromEntries(Object.entries(stages).map(([stage, file]) => [stage, fs.readFileSync(path.join(__dirname, 'prompts', file), 'utf8').trim()]))]));
const data = { version: '2026-09-30.1', templates };
fs.writeFileSync(path.join(__dirname, 'prompt-templates.js'), '// 由六份 Markdown 文档生成。修改文档后运行 node build-prompt-templates.cjs 同步。\nwindow.FABRIC_PIG_PROMPT_TEMPLATES = ' + JSON.stringify(data, null, 2) + ';\n');
console.log('已将六份提示词文档同步为后台内置默认值。');
