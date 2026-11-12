import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHmac,webcrypto} from 'node:crypto';
export async function verifyMailer(mailerSource,bridgeSource){
 const {sendGmailNotification}=await import('data:text/javascript;base64,'+Buffer.from(mailerSource).toString('base64'));
 const secret='a'.repeat(64), sent=[], props=new Map([['GAIA_MAIL_SENDER','sender@example.com'],['GAIA_MAIL_RECIPIENT','recipient@example.com'],['GAIA_MAIL_SECRET',secret]]);
 let quota=100,owner='sender@example.com',locked=false,tests=0;
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
 Session:{getEffectiveUser:()=>({getEmail:()=>owner})},
 Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(s,k)=>Array.from(createHmac('sha256',k).update(s).digest()),getUuid:()=>webcrypto.randomUUID()},
 MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:m=>sent.push(m)},
 LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true},hasLock:()=>locked,releaseLock:()=>{locked=false}})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}};
 vm.createContext(context);vm.runInContext(bridgeSource,context);
 const base={url:'https://script.google.com/macros/s/deployment_test/exec',secret,titleId:'11111111-1111-4111-8111-111111111111',title:'Il castello – città e magia 🎬'};
 let envelope;
 const fetchFn=async(u,o)=>{envelope=JSON.parse(o.body);return {ok:true,json:async()=>context.doPost({postData:{contents:o.body}})}};
 const call=(changes={},fetchOverride=fetchFn)=>sendGmailNotification({...base,...changes},{fetchFn:fetchOverride,cryptoImpl:webcrypto});
 assert.equal((await call()).sent,true);assert.equal(sent.length,1);assert.equal(sent[0].to,'recipient@example.com');assert.ok(sent[0].body.includes(base.title));tests++;
 assert.equal((await call()).duplicate,true);assert.equal(sent.length,1);tests++;
 const altered=structuredClone(envelope);altered.payload[2]='Tampered';assert.equal(context.doPost({postData:{contents:JSON.stringify(altered)}}).ok,false);tests++;
 await assert.rejects(call({secret:'b'.repeat(64)}));assert.equal(sent.length,1);tests++;
 await assert.rejects(sendGmailNotification(base,{fetchFn,cryptoImpl:webcrypto,now:()=>Date.now()-600000}));tests++;
 await assert.rejects(sendGmailNotification(base,{fetchFn,cryptoImpl:webcrypto,now:()=>Date.now()+120000}));tests++;
 quota=0;await assert.rejects(call({titleId:'22222222-2222-4222-8222-222222222222'}));assert.equal(sent.length,1);quota=100;tests++;
 owner='wrong@example.com';await assert.rejects(call({titleId:'33333333-3333-4333-8333-333333333333'}));owner='sender@example.com';tests++;
 for(const url of ['http://script.google.com/macros/s/x/exec','https://evil.example/macros/s/x/exec','https://script.google.com/macros/s/x/dev','https://user:pass@script.google.com/macros/s/x/exec'])await assert.rejects(call({url},async()=>{throw Error('Should not fetch')}));tests++;
 await assert.rejects(call({},async()=>({ok:true,json:async()=>{throw Error('HTML login')}})));tests++;
 await assert.rejects(call({},async()=>({ok:false})));tests++;
 assert.equal(context.doGet().ok,false);assert.equal(locked,false);tests++;
 return {passed:tests,emailsSimulated:sent.length,realEmailsSent:0};
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
 const {readFile}=await import('node:fs/promises');
 console.log(await verifyMailer(await readFile(new URL('../supabase/functions/image-curator/gmail-mailer.js',import.meta.url),'utf8'),await readFile(new URL('../integrations/gmail/Code.gs',import.meta.url),'utf8')));
}
