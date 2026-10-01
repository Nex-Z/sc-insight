import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightFilename,highlightDownloadFilename} from './recording-name.js';
test('highlight names start with a safe model name, use HK time and retain a unique suffix',()=>{
 const date=new Date('2026-09-25T16:05:06.007Z');
 assert.equal(highlightFilename('Alice',date,'abc'),'Alice-2026-09-26_00-05-06-007-highlight-abc.mp4');
 const unsafe=highlightFilename('主播/名字:*\r\n',date,'1');assert.ok(unsafe.startsWith('主播_名字____-'));assert.ok(!/[<>:"/\\|?*\x00-\x1f]/.test(unsafe));
 assert.ok(highlightFilename('CON',date,'1').startsWith('_CON-'));
 const old={id:'42',filename:'highlight-old.mp4',triggered_at:date};assert.equal(highlightDownloadFilename(old,'Alice'),highlightFilename('Alice',date,'42'));assert.equal(old.filename,'highlight-old.mp4');
 const filename=highlightFilename('Alice',date,'unique');assert.equal(highlightDownloadFilename({...old,filename},'Alice'),filename);
});
