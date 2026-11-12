/**
 * Gaia email bridge. Configure Script Properties, never public source:
 * GAIA_MAIL_SENDER, GAIA_MAIL_RECIPIENT, GAIA_MAIL_SECRET.
 * Deploy as a web app: execute as owner; POST requires a signed payload.
 */
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function same_(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function signature_(payload,secret){return Utilities.computeHmacSha256Signature(JSON.stringify(payload),secret,Utilities.Charset.UTF_8).map(function(b){return ((b+256)%256).toString(16).padStart(2,'0');}).join('');}
function configuration_(){
 var p=PropertiesService.getScriptProperties(),sender=p.getProperty('GAIA_MAIL_SENDER'),recipient=p.getProperty('GAIA_MAIL_RECIPIENT');
 var email=/^[^\s,@;<>]+@[^\s,@;<>]+\.[^\s,@;<>]+$/;
 if(!sender||!recipient||!email.test(sender)||!email.test(recipient))throw Error('Impostare mittente e destinatario nelle proprietà dello script.');
 if(Session.getEffectiveUser().getEmail().toLowerCase()!==sender.toLowerCase())throw Error('Lo script deve essere eseguito dall’account mittente configurato.');
 return {properties:p,sender:sender,recipient:recipient};
}
function initialiseGaiaMailer(){
 var c=configuration_();
 if(!c.properties.getProperty('GAIA_MAIL_SECRET'))c.properties.setProperty('GAIA_MAIL_SECRET',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
 return 'Configurazione pronta. Copiare GAIA_MAIL_SECRET dalle proprietà dello script nei secret Supabase; non pubblicarla.';
}
function sendGaiaTestEmail(){
 var c=configuration_();
 if(MailApp.getRemainingDailyQuota()<1)throw Error('Quota giornaliera terminata.');
 MailApp.sendEmail({to:c.recipient,subject:'Gaia: email di prova',body:'Le notifiche delle richieste film di Gaia sono configurate.\n\nCatalogo: https://sighteller.github.io/gaia-moviesystem/disponibilita.html',name:'Gaia | Movie System'});
 return 'Email di prova inviata.';
}
function doGet(){return json_({ok:false,error:'Usare una richiesta POST firmata.'});}
function doPost(e){
 var lock=null;
 try{
  var body=e&&e.postData&&e.postData.contents;
  if(typeof body!=='string'||body.length>4000)return json_({ok:false,error:'Richiesta non valida.'});
  var request=JSON.parse(body),p=request.payload,secret=PropertiesService.getScriptProperties().getProperty('GAIA_MAIL_SECRET');
  if(!Array.isArray(p)||p.length!==4||p[0]!==1||typeof p[1]!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p[1])||typeof p[2]!=='string'||!p[2].trim()||p[2].length>300||!Number.isSafeInteger(p[3])||typeof secret!=='string'||!/^[a-f0-9]{64}$/i.test(secret))return json_({ok:false,error:'Richiesta non valida.'});
  var age=Math.floor(Date.now()/1000)-p[3];
  if(age>300||age< -60||!same_(signature_(p,secret),request.signature))return json_({ok:false,error:'Richiesta non autorizzata.'});
  var c=configuration_();
  lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return json_({ok:false,error:'Invio da riprovare.'});
  var ledgerKey='GAIA_SENT_'+p[1].toLowerCase();
  if(c.properties.getProperty(ledgerKey))return json_({ok:true,duplicate:true});
  if(MailApp.getRemainingDailyQuota()<1)return json_({ok:false,error:'Quota giornaliera terminata.'});
  MailApp.sendEmail({to:c.recipient,subject:'Gaia: nuovo titolo richiesto',body:'È stato richiesto: '+p[2]+'\n\nApri il catalogo: https://sighteller.github.io/gaia-moviesystem/disponibilita.html',name:'Gaia | Movie System'});
  c.properties.setProperty(ledgerKey,String(Date.now()));
  return json_({ok:true,duplicate:false});
 }catch(error){return json_({ok:false,error:'Notifica non inviata. Verificare autorizzazione e configurazione.'});}
 finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
