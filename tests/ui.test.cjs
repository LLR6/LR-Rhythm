'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
(async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);if(!p.startsWith(root)){res.writeHead(403);return res.end()}const ext=path.extname(p);res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'}[ext]||'application/octet-stream'));fs.readFile(p,(err,data)=>{if(err){res.writeHead(404);res.end()}else res.end(data)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{
 const page=await b.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,timezoneId:'Asia/Shanghai'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const url=`http://127.0.0.1:${server.address().port}`;await page.goto(url);
 const click=act=>page.locator(`[data-act="${act}"]`).first().click();
 const nav=async id=>{await page.locator(`.bottom-nav [data-id="${id}"]`).click()};
 assert.match(await page.title(),/朝夕/);await page.screenshot({path:path.resolve(__dirname,'../../ui-initial.png'),fullPage:true});
 // Daily check-in persists across reloads and is idempotent.
 await click('checkin');await page.getByText('今天，也在向前。',{exact:true}).waitFor();await click('close');await page.reload();assert.equal(await page.locator('[data-act="checkin"]').isDisabled(),true);
 // Record actual state with an image, literal HTML note and focus minutes.
 await nav('schedule');await page.locator('[data-act="record"][data-id="am"]').click();await page.locator('textarea[name=note]').fill('<img src=x onerror=alert(1)> 今天上午状态不错。');await page.locator('[name=focus]').fill('90');await page.locator('[name=sleepiness]').fill('2');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU7sAAAAASUVORK5CYII=','base64');
 await page.locator('#photo-input').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>document.querySelectorAll('#photo-list .photo').length===1);await page.locator('#record-form button[type=submit]').click();
 await nav('journal');assert.match(await page.locator('.note').innerText(),/<img src=x/);assert.equal(await page.locator('.note img').count(),0);assert.equal(await page.locator('.record-images img').count(),1);
 await page.reload();assert.equal(await page.locator('[data-act="checkin"]').isDisabled(),true);await nav('journal');assert.equal(await page.locator('.record-images img').count(),1);
 // Editing template must not rewrite the already-recorded day.
 await nav('schedule');await click('template');await page.locator('[data-act="edit-task"][data-id="am"]').click();await page.locator('[name=title]').fill('我的数学时间');await page.locator('#task-form button[type=submit]').click();await click('close');assert.equal(await page.locator('.task h3').filter({hasText:'上午黄金时段'}).count(),1);await click('sync');assert.equal(await page.locator('.task h3').filter({hasText:'上午黄金时段'}).count(),1);
 // Sleep, caffeine, daily reflection and stats.
 await nav('today');await click('sleep');await page.locator('#sleep-form button[type=submit]').click();await click('caffeine');await page.locator('#caffeine-form button[type=submit]').click();await click('close');
 await nav('journal');await click('reflection');await page.locator('[name=reflection]').fill('明天继续，不需要完美。');await page.locator('#reflection-form button[type=submit]').click();
 await nav('insights');assert.match(await page.locator('.app-shell').innerText(),/90 分钟/);assert.match(await page.locator('.app-shell').innerText(),/8 小时/);await page.screenshot({path:path.resolve(__dirname,'../../ui-insights.png'),fullPage:true});
 // Settings theme and focus timestamp survive process/page reload.
 await click('settings');await page.locator('label').filter({has:page.locator('input[name=theme][value=ocean]')}).click();await page.locator('#settings-form button[type=submit]').click();assert.equal(await page.locator('body').getAttribute('data-theme'),'ocean');
 await nav('today');await click('focus');await page.locator('#focus-form button[type=submit]').click();await page.reload();await page.locator('.focus-banner').waitFor();await click('focus');assert.match(await page.locator('#timer-display').innerText(),/24:|25:/);await click('cancel-focus');await click('close');
 // Invalid import is rejected; valid backup roundtrip retains image and records.
 const raw=await page.evaluate(()=>localStorage.getItem('lr-rhythm-v1'));await page.evaluate(()=>window.receiveImport('{"schema":99}'));assert.equal(await page.evaluate(()=>localStorage.getItem('lr-rhythm-v1')),raw);await page.evaluate(raw=>window.receiveImport(raw),raw);await nav('journal');assert.equal(await page.locator('.record-images img').count(),1);
 // Delete record removes associated image and recomputes XP; future is read-only.
 await page.locator('[data-act=record][data-id=am]').click();await click('delete-record');assert.equal(await page.locator('.record-images img').count(),0);await nav('schedule');await page.locator('#view-date').fill('2099-01-01');assert.equal(await page.locator('[data-act=record]').first().isDisabled(),true);
 for(const width of [320,393,768]){await page.setViewportSize({width,height:852});for(const id of ['today','schedule','journal','insights','growth']){await nav(id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`overflow ${id} @${width}`)}}
 assert.deepEqual(errors,[]);console.log('PASS: UI persistence, photo compression, check-in, template history, sleep/caffeine, focus recovery, backups, deletion and 320/393/768px layouts.');
 }finally{await b.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
