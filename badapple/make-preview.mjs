// Builds preview.html: the player widget with a mock TelegramWidget that streams chunks like the bot does.
// usage: node make-preview.mjs [stream.json] [editMs] [dropEvery]
import fs from 'node:fs';
const dir = new URL('.', import.meta.url);
const s = JSON.parse(fs.readFileSync(new URL(process.argv[2] ?? 'stream_96x72_15.json', dir), 'utf8'));
const editMs = +(process.argv[3] ?? 1000), drop = +(process.argv[4] ?? 0);
const tpl = fs.readFileSync(new URL('widget.html', dir), 'utf8');
const html = tpl.replaceAll('__W__', s.W).replaceAll('__H__', s.H).replaceAll('__FPS__', s.FPS).replaceAll('__N__', s.frames);
const mock = `<script>
(()=>{const C=${JSON.stringify(s.chunks)},hs=[];let timer=0;
const T={chatData:null,onEvent(t,f){if(t==='chatDataChanged')hs.push(f)},
request(d){const [c,a]=d.split(':');console.log('request',d);
if(c==='go'){clearInterval(timer);let n=+a+1;timer=setInterval(()=>{if(n>=C.length)return clearInterval(timer);
if(!${drop}||n%${drop}){T.chatData=n+':'+C[n];hs.forEach(f=>f())}n++},${editMs});return Promise.resolve({result:a+':'+C[+a]})}
if(c==='get')return Promise.resolve({result:a+':'+C[+a]});
if(c==='stop'){clearInterval(timer);return Promise.resolve({result:'ok'})}return Promise.resolve({result:null})}};
window.TelegramWidget=T})();
</script>`;
const page = `<!doctype html><meta charset="utf-8"><title>Bad Apple widget preview</title>
<style>html{background:#7a9cbf}.bubble{width:360px;margin:30px auto;border-radius:16px;overflow:hidden;background:#fff}</style>
<div class="bubble">${mock}${html}</div>`;
fs.writeFileSync(new URL('preview.html', dir), page);
console.log('wrote preview.html');
