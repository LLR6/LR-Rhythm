/* Pure domain logic; shared by Android UI and automated tests. */
(function(root){
'use strict';
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shift=(key,n)=>{const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d)};
const minutes=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]);
const duration=(bed,wake)=>{let n=minutes(wake)-minutes(bed);if(n<=0)n+=1440;return Math.round(n/60*100)/100};
const template=()=>[
 ['wake','06:30','07:00','晨光唤醒','起床 · 洗漱 · 天亮后走一走','sun'],
 ['breakfast','07:00','07:30','好好吃早餐','主食＋蛋白质，给自己一份稳定的能量','cup'],
 ['warmup','07:30','08:20','轻量热身','回忆知识，准备进入上午状态','spark'],
 ['am','08:30','11:30','上午黄金时段','数学 / 政治 · 主动读题、计算、书写','book'],
 ['lunch','11:30','12:20','午餐与散步','热饭、吃到舒服，饭后短暂走动','leaf'],
 ['nap','12:35','12:55','20分钟充电','短午睡或闭目休息，不强迫入睡','moon'],
 ['pm','14:00','17:00','下午稳定输出','英语 / 408 · 把状态练到考场时间','pen'],
 ['move','17:00','18:30','晚餐与活动','吃饭、散步，给大脑一点留白','leaf'],
 ['review','19:00','21:30','温柔收尾','错题复盘、背诵、补弱，按需休息','book'],
 ['unwind','21:30','22:30','慢慢安静下来','洗漱、整理明天，减少屏幕刺激','moon'],
 ['sleep','22:30','22:30','晚安，明天见','关灯，把恢复也算进今天的努力','moon']
].map(([id,start,end,title,desc,icon])=>({id,start,end,title,desc,icon}));
const initial=()=>({schema:1,settings:{name:'LR',examDate:'2026-12-19',theme:'sage',reminders:false,reminderTimes:['08:10','13:40','21:30']},template:template(),days:{},focus:null});
const getDay=(state,key)=>state.days[key]||{tasks:state.template.map(x=>({...x})),records:{},checked:false,sleep:null,caffeine:[],reflection:''};
const ensureDay=(state,key)=>state.days[key]||(state.days[key]=getDay(state,key));
const completed=d=>Object.values(d.records).filter(r=>r.status==='done').length;
const progress=d=>d.tasks.length?Math.round(d.tasks.filter(t=>d.records[t.id]?.status==='done').length/d.tasks.length*100):0;
const xp=s=>Object.values(s.days).reduce((n,d)=>n+(d.checked?20:0)+Object.values(d.records).reduce((a,r)=>a+(r.status==='done'?10:r.status==='partial'?5:0)+(r.note?.trim()?3:0)+(r.photos?.length?2:0),0),0);
const signed=s=>Object.keys(s.days).filter(k=>s.days[k].checked).sort();
const streak=(s,today=dateKey())=>{let k=s.days[today]?.checked?today:shift(today,-1),n=0;while(s.days[k]?.checked){n++;k=shift(k,-1)}return n};
const maxStreak=s=>{let n=0,best=0,prev='';for(const k of signed(s)){n=prev&&shift(prev,1)===k?n+1:1;best=Math.max(best,n);prev=k}return best};
const level=s=>Math.floor(xp(s)/150)+1;
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const range=(s,n,today=dateKey())=>Array.from({length:n},(_,i)=>{const key=shift(today,i-n+1);return {key,day:s.days[key]||null}});
const stats=(s,n,today=dateKey())=>{
 const days=range(s,n,today),real=days.filter(x=>x.day),records=real.flatMap(x=>Object.values(x.day.records)),am=[],pm=[];
 for(const {day} of real)for(const t of day.tasks){const r=day.records[t.id];if(r){const h=minutes(t.start);if(h>=480&&h<720)am.push(r.sleepiness);if(h>=840&&h<1020)pm.push(r.sleepiness)}}
 const sleep=real.map(x=>x.day.sleep?.hours).filter(x=>Number.isFinite(x));
 return {days,active:real.filter(x=>x.day.checked||Object.keys(x.day.records).length||x.day.sleep||x.day.caffeine.length||x.day.reflection).length,signed:real.filter(x=>x.day.checked).length,done:records.filter(r=>r.status==='done').length,focus:records.reduce((n,r)=>n+(r.focus||0),0),sleep:avg(sleep),sleepN:sleep.length,am:avg(am),pm:avg(pm),amN:am.length,pmN:pm.length,mood:avg(records.map(r=>r.mood)),records};
};
const badges=s=>{const days=Object.values(s.days);return [
 {name:'第一束光',icon:'sun',desc:'完成第一次签到',earned:signed(s).length>=1},
 {name:'三日同行',icon:'leaf',desc:'累计签到3天',earned:signed(s).length>=3},
 {name:'一周微光',icon:'spark',desc:'累计签到7天',earned:signed(s).length>=7},
 {name:'留下此刻',icon:'image',desc:'保存一张状态照片',earned:days.some(d=>Object.values(d.records).some(r=>r.photos?.length))},
 {name:'稳稳入场',icon:'book',desc:'同一天记录上午和下午训练状态',earned:days.some(d=>['am','pm'].every(id=>d.records[id]))},
 {name:'照顾自己',icon:'moon',desc:'记录3晚睡眠',earned:days.filter(d=>d.sleep).length>=3}
]};
const validDate=k=>typeof k==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(k)&&dateKey(new Date(k+'T12:00:00'))===k;
const validTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
function validate(raw){
 const s=typeof raw==='string'?JSON.parse(raw):raw;
 const fail=()=>{throw new Error('备份格式不完整或含有不支持的数据')};
 const str=(v,max)=>typeof v==='string'&&v.length<=max;
 const tasks=a=>Array.isArray(a)&&a.length<=40&&new Set(a.map(t=>t.id)).size===a.length&&a.every(t=>str(t.id,80)&&!['__proto__','constructor','prototype'].includes(t.id)&&/^[a-zA-Z0-9_-]+$/.test(t.id)&&validTime(t.start)&&validTime(t.end)&&str(t.title,60)&&str(t.desc,240)&&str(t.icon,20));
 if(!s||s.schema!==1||!s.settings||!str(s.settings.name,30)||!validDate(s.settings.examDate)||!['sage','ocean','rose'].includes(s.settings.theme)||typeof s.settings.reminders!=='boolean'||!Array.isArray(s.settings.reminderTimes)||s.settings.reminderTimes.length!==3||!s.settings.reminderTimes.every(validTime)||!tasks(s.template)||!s.days||typeof s.days!=='object'||Array.isArray(s.days))fail();
 for(const [key,d] of Object.entries(s.days)){
  if(!validDate(key)||!d||!tasks(d.tasks)||!d.records||typeof d.records!=='object'||Array.isArray(d.records)||typeof d.checked!=='boolean'||!str(d.reflection,5000)||!Array.isArray(d.caffeine)||d.caffeine.length>30)fail();
  for(const [id,r] of Object.entries(d.records)){
   if(!d.tasks.some(t=>t.id===id)||!r||!['done','partial','rest'].includes(r.status)||!str(r.note,3000)||!Number.isInteger(r.mood)||r.mood<1||r.mood>5||!Number.isInteger(r.energy)||r.energy<1||r.energy>5||!Number.isInteger(r.sleepiness)||r.sleepiness<0||r.sleepiness>10||!Number.isFinite(r.focus)||r.focus<0||r.focus>1440||!Array.isArray(r.photos)||r.photos.length>4||!r.photos.every(p=>str(p,2000000)&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p)))fail();
  }
  if(d.sleep&&(!validTime(d.sleep.bed)||!validTime(d.sleep.wake)||!Number.isFinite(d.sleep.hours)||d.sleep.hours<=0||d.sleep.hours>24||Math.abs(d.sleep.hours-duration(d.sleep.bed,d.sleep.wake))>.02))fail();
  if(!d.caffeine.every(c=>c&&str(c.id,80)&&str(c.name,60)&&validTime(c.time)&&Number.isFinite(c.mg)&&c.mg>=0&&c.mg<=1000))fail();
 }
 s.focus=null;return s;
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api={uid,dateKey,shift,minutes,duration,template,initial,getDay,ensureDay,completed,progress,xp,signed,streak,maxStreak,level,avg,range,stats,badges,validDate,validTime,validate,escape};
if(typeof module!=='undefined')module.exports=api;else root.Rhythm=api;
})(typeof window!=='undefined'?window:globalThis);
